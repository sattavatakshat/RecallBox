import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4
import jwt
from fastapi import HTTPException, Request
from .db import owned


def denied():
    return HTTPException(401, 'authentication_required', headers={'WWW-Authenticate': 'Bearer'})


def digest(token: str):
    return hashlib.sha256(token.encode()).hexdigest()


async def issue(conn, settings, owner, family=None, device=None, expiry=None):
    now = datetime.now(timezone.utc)
    session = uuid4()
    refresh = secrets.token_urlsafe(48)
    expiry = expiry or now + timedelta(days=30)
    await conn.execute('''INSERT INTO sessions(id,owner_id,family_id,device_id,refresh_hash,expires_at)
        VALUES($1,$2,$3,$4,$5,$6)''', session, owner, family or uuid4(), device, digest(refresh), expiry)
    lifetime = max(0, min(600, int((expiry - now).total_seconds())))
    access = jwt.encode({'iss': settings.issuer, 'aud': 'recallbox-mobile', 'sub': str(owner),
        'sid': str(session), 'iat': now, 'exp': now + timedelta(seconds=lifetime), 'jti': str(uuid4())},
        settings.signing_key, algorithm='HS256')
    return {'access_token': access, 'refresh_token': refresh, 'token_type': 'Bearer',
            'expires_in': lifetime}, session


async def principal(request: Request):
    scheme, _, token = request.headers.get('authorization', '').partition(' ')
    if scheme.lower() != 'bearer' or not token or len(token) > 4096:
        raise denied()
    try:
        claims = jwt.decode(token, request.app.state.settings.signing_key, algorithms=['HS256'],
            audience='recallbox-mobile', issuer=request.app.state.settings.issuer,
            options={'require': ['exp', 'iat', 'sub', 'sid', 'iss', 'aud', 'jti']})
        owner, session = UUID(claims['sub']), UUID(claims['sid'])
    except (jwt.PyJWTError, ValueError, TypeError):
        raise denied() from None
    async with owned(request.app.state.pool, owner) as conn:
        valid = await conn.fetchval('''SELECT EXISTS(SELECT 1 FROM sessions s JOIN users u ON u.id=s.owner_id
            WHERE s.id=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='active')''', session)
    if not valid:
        raise denied()
    return owner, session
