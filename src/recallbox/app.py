"""Loopback-only product entrypoint. No extractor or private benchmark imports."""
import json
import logging
import time
from collections import OrderedDict
from contextlib import asynccontextmanager
from uuid import UUID, uuid4
import asyncpg
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.exceptions import HTTPException as StarletteHTTPException
from .auth import denied, digest, issue, principal
from .config import Settings
from .db import connect, owned
from .identity import IdentityRejected, IdentityVerifier

logger = logging.getLogger('recallbox')


class Payload(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Exchange(Payload):
    provider: str = Field(min_length=1, max_length=64)
    code: str = Field(min_length=1, max_length=4096)
    code_verifier: str = Field(pattern=r'^[A-Za-z0-9._~-]{43,128}$')
    nonce: str = Field(min_length=32, max_length=256)
    client_device_id: UUID
    platform: str = Field(pattern=r'^(ios|android)$')


class Refresh(Payload):
    refresh_token: str = Field(min_length=64, max_length=128, pattern=r'^[A-Za-z0-9_-]+$')


def create_app():
    settings = Settings.load()

    @asynccontextmanager
    async def lifespan(app):
        app.state.pool = await connect(settings.database_url)
        app.state.identity = IdentityVerifier()
        try:
            yield
        finally:
            await app.state.identity.client.aclose()
            await app.state.pool.close()

    app = FastAPI(title='RecallBox', lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings
    # Bounded single-worker local abuse guard. Durable/distributed limits remain pre-ingress work.
    attempts = OrderedDict()

    @app.middleware('http')
    async def boundary(request, call_next):
        request.state.request_id = str(uuid4())
        start = time.monotonic()
        if request.url.path.startswith('/v1/auth/'):
            key = request.client.host if request.client else 'unknown'
            now = int(time.monotonic() // 60)
            bucket = attempts.pop(key, (now, 0))
            count = bucket[1] + 1 if bucket[0] == now else 1
            attempts[key] = (now, count)
            while len(attempts) > 2048:
                attempts.popitem(last=False)
            if count > 20:
                return error(request, 429, 'rate_limited', {'Retry-After': '60'})
        # Check actual streamed bytes before JSON parsing, including chunked requests.
        if request.method == 'POST':
            data = bytearray()
            async for chunk in request.stream():
                data.extend(chunk)
                if len(data) > 16384:
                    return error(request, 413, 'request_too_large')
            request._body = bytes(data)
        try:
            response = await call_next(request)
        except Exception:
            # Exception text/tracebacks can contain SQL arguments and tokens.
            response = error(request, 503, 'service_unavailable')
        response.headers['X-Request-ID'] = request.state.request_id
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        logger.info(json.dumps({'event': 'request', 'request_id': request.state.request_id,
                               'status': response.status_code, 'duration_ms': round((time.monotonic()-start)*1000)}))
        return response

    def error(request, status, code, headers=None):
        return JSONResponse({'error': {'code': code, 'request_id': request.state.request_id}},
                            status_code=status, headers=headers)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request, exc):
        code = exc.detail if exc.detail in ('authentication_required', 'identity_rejected', 'provider_not_configured') else f'http_{exc.status_code}'
        return error(request, exc.status_code, code, exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        return error(request, 422, 'invalid_request')

    @app.get('/v1/health')
    async def health():
        return {'status': 'ok'}

    @app.post('/v1/auth/exchange')
    async def exchange(body: Exchange):
        provider = settings.providers.get(body.provider)
        if provider is None:
            raise HTTPException(400, 'provider_not_configured')
        try:
            subject = await app.state.identity.verify(provider, body.code, body.code_verifier, body.nonce)
        except IdentityRejected:
            raise HTTPException(401, 'identity_rejected') from None
        async with app.state.pool.acquire() as conn, conn.transaction():
            owner = await conn.fetchval('SELECT resolve_identity($1,$2,$3,$4)', provider.issuer, subject, uuid4(), uuid4())
            await conn.execute("SELECT set_config('app.user_id',$1,true)", str(owner))
            active = await conn.fetchval("SELECT id FROM users WHERE id=$1 AND status='active' FOR UPDATE", owner)
            if not active:
                raise denied()
            device = await conn.fetchval('''INSERT INTO devices(id,owner_id,client_device_id,platform)
                VALUES($1,$2,$3,$4) ON CONFLICT(owner_id,client_device_id)
                DO UPDATE SET last_seen_at=now(),revoked_at=NULL RETURNING id''',
                uuid4(), owner, body.client_device_id, body.platform)
            result, _ = await issue(conn, settings, owner, device=device)
        return result

    @app.post('/v1/auth/refresh')
    async def refresh(body: Refresh):
        token_hash = digest(body.refresh_token)
        async with app.state.pool.acquire() as conn:
            owner = await conn.fetchval('SELECT refresh_owner($1)', token_hash)
        if owner is None:
            raise denied()
        result = None
        async with owned(app.state.pool, owner) as conn:
            # Serialize all session mutations for this owner, including logout.
            active = await conn.fetchval("SELECT status='active' FROM users WHERE id=$1 FOR UPDATE", owner)
            row = await conn.fetchrow('SELECT * FROM sessions WHERE refresh_hash=$1 FOR UPDATE', token_hash)
            if row and active:
                if row['replaced_by'] is not None:
                    await conn.execute('UPDATE sessions SET revoked_at=coalesce(revoked_at,now()) WHERE family_id=$1', row['family_id'])
                elif row['revoked_at'] is None and await conn.fetchval('SELECT $1::timestamptz>now()', row['expires_at']):
                    result, new_session = await issue(conn, settings, owner, row['family_id'], row['device_id'], row['expires_at'])
                    await conn.execute('UPDATE sessions SET replaced_by=$1 WHERE id=$2', new_session, row['id'])
        # Raise AFTER commit so reuse revocation is never rolled back.
        if result is None:
            raise denied()
        return result

    @app.post('/v1/auth/logout', status_code=204)
    async def logout(who=Depends(principal)):
        owner, session = who
        async with owned(app.state.pool, owner) as conn:
            await conn.fetchval('SELECT id FROM users WHERE id=$1 FOR UPDATE', owner)
            await conn.execute('''UPDATE sessions SET revoked_at=coalesce(revoked_at,now())
                WHERE family_id=(SELECT family_id FROM sessions WHERE id=$1)''', session)

    @app.get('/v1/me')
    async def me(who=Depends(principal)):
        async with owned(app.state.pool, who[0]) as conn:
            row = await conn.fetchrow("SELECT id,display_name,created_at FROM users WHERE id=$1 AND status='active'", who[0])
        if row is None:
            raise denied()
        return dict(row)

    return app
