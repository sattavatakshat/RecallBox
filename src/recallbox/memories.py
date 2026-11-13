"""S2 plain-text notes. All persistence/revisions/events share an owner transaction."""
import hashlib
import json
from contextlib import asynccontextmanager
from datetime import datetime
from uuid import UUID, uuid4
from typing import Literal
from urllib.parse import urlsplit
from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from .auth import denied, principal
from .cursors import decode, encode
from .db import owned
from .problems import Problem

router = APIRouter(prefix='/v1')


def require_http_bookmark(value: str) -> None:
    """Validate an address for storage/opening only; no server-side fetch occurs."""
    if (not value or len(value) > 4096 or
            any(ord(char) <= 32 or ord(char) == 127 for char in value)):
        raise ValueError('Bookmark must be a valid HTTP(S) URL of at most 4096 characters')
    try:
        parsed = urlsplit(value)
        valid = (parsed.scheme in ('http', 'https') and bool(parsed.hostname) and
                 parsed.username is None and parsed.password is None)
        # Access port to reject malformed ports before persisting them.
        _ = parsed.port
    except ValueError:
        valid = False
    if not valid:
        raise ValueError('Bookmark requires an absolute HTTP(S) URL without credentials')


class CreateNote(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    kind: Literal['note', 'link'] = 'note'
    title: str = Field(default='', max_length=240)
    content: str = Field(min_length=1, max_length=100000)

    @field_validator('content')
    @classmethod
    def meaningful(cls, value):
        if not value.strip():
            raise ValueError('Empty note')
        return value

    @model_validator(mode='after')
    def validate_kind(self):
        if self.kind == 'link':
            require_http_bookmark(self.content)
        return self


class EditNote(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    expected_version: int = Field(ge=1, le=2147483646)
    title: str | None = Field(default=None, max_length=240)
    content: str | None = Field(default=None, min_length=1, max_length=100000)
    starred: bool | None = None
    archived: bool | None = None

    @model_validator(mode='after')
    def fields_valid(self):
        fields = self.model_fields_set - {'expected_version'}
        if not fields or any(getattr(self, field) is None for field in fields):
            raise ValueError('Specify non-null editable fields')
        if self.content is not None and not self.content.strip():
            raise ValueError('Empty note')
        return self


def memory(row, *, detail=True):
    result = {k: row[k] for k in ('id', 'kind', 'title', 'version', 'starred', 'archived', 'created_at', 'updated_at')}
    result['content' if detail else 'preview'] = row['user_note'] if detail else row['user_note'][:200]
    return jsonable_encoder(result)


def summary_columns():
    return 'id,kind,title,version,starred,archived,created_at,updated_at,left(user_note,200) AS user_note'


@asynccontextmanager
async def writing(request, who):
    owner, session = who
    async with owned(request.app.state.pool, owner) as conn:
        active = await conn.fetchval("SELECT status='active' FROM users WHERE id=$1 FOR UPDATE", owner)
        valid = await conn.fetchval('''SELECT EXISTS(SELECT 1 FROM sessions WHERE id=$1
            AND revoked_at IS NULL AND expires_at>now())''', session)
        if not active or not valid:
            raise denied()
        yield conn


async def publish(conn, owner, row, operation):
    """Caller holds users row lock until COMMIT. Not a PostgreSQL sequence."""
    seq = await conn.fetchval('UPDATE users SET sync_sequence=sync_sequence+1 WHERE id=$1 RETURNING sync_sequence', owner)
    payload = {'id': str(row['id']), 'version': row['version'], 'deleted': True} if operation == 'delete' else memory(row)
    await conn.execute('''INSERT INTO memory_revisions(id,owner_id,memory_id,entity_version,mutation_kind,payload)
        VALUES($1,$2,$3,$4,$5,$6::jsonb)''', uuid4(), owner, row['id'], row['version'],
        'delete' if operation == 'delete' else ('create' if row['version'] == 1 else 'update'), json.dumps(payload))
    await conn.execute('''INSERT INTO sync_changes(owner_id,sequence,entity_id,version,operation)
        VALUES($1,$2,$3,$4,$5)''', owner, seq, row['id'], row['version'], operation)
    return seq


@router.post('/memories', status_code=201)
async def create_note(body: CreateNote, request: Request,
                      idempotency_key: UUID = Header(), who=Depends(principal)):
    owner = who[0]
    hash_payload = body.model_dump()
    # Preserve S2 retry fingerprints for existing note clients across upgrade.
    if body.kind == 'note':
        hash_payload.pop('kind')
    request_hash = hashlib.sha256(json.dumps(hash_payload, sort_keys=True, ensure_ascii=False,
                                           separators=(',', ':')).encode()).hexdigest()
    async with writing(request, who) as conn:
        previous = await conn.fetchrow("SELECT *, expires_at>clock_timestamp() AS usable FROM idempotency_keys WHERE key=$1 AND route='/v1/memories'", idempotency_key)
        if previous:
            if previous['request_hash'] != request_hash:
                raise Problem(409, 'idempotency_mismatch')
            if not previous['usable']:
                raise Problem(409, 'idempotency_expired')
            deleted = await conn.fetchval('SELECT deleted_at IS NOT NULL FROM memories WHERE id=$1', previous['response_entity_id'])
            if deleted:
                raise Problem(410, 'memory_deleted')
            snapshot = await conn.fetchval('SELECT payload FROM memory_revisions WHERE memory_id=$1 AND entity_version=1', previous['response_entity_id'])
            return json.loads(snapshot)
        # created_sequence is the value publish() will commit under the same row lock.
        next_seq = await conn.fetchval('SELECT sync_sequence+1 FROM users WHERE id=$1', owner)
        row = await conn.fetchrow('''INSERT INTO memories(id,owner_id,kind,title,user_note,created_sequence)
            VALUES($1,$2,$3,$4,$5,$6) RETURNING *''', uuid4(), owner, body.kind, body.title, body.content, next_seq)
        await publish(conn, owner, row, 'upsert')
        await conn.execute('''INSERT INTO idempotency_keys(owner_id,key,route,request_hash,response_status,response_entity_id,expires_at)
            VALUES($1,$2,'/v1/memories',$3,201,$4,clock_timestamp()+interval '24 hours')''',
            owner, idempotency_key, request_hash, row['id'])
        return memory(row)


@router.get('/memories')
async def list_notes(request: Request, cursor: str | None = Query(default=None, max_length=4096),
                     limit: int = Query(default=20, ge=1, le=50), archived: bool = False,
                     who=Depends(principal)):
    owner = who[0]
    async with owned(request.app.state.pool, owner, isolation='repeatable_read', readonly=True) as conn:
        user = await conn.fetchrow('SELECT sync_sequence,sync_epoch FROM users WHERE id=$1', owner)
        high = user['sync_sequence']
        before_time, before_id = None, None
        if cursor:
            state = decode(request.app.state.settings, cursor, owner, user['sync_epoch'], 'list')
            try:
                if state['archived'] != archived or type(state['high']) is not int or not 0 <= state['high'] <= high:
                    raise ValueError()
                high = state['high']
                before_time, before_id = datetime.fromisoformat(state['before_time']), UUID(state['before_id'])
                if before_time.tzinfo is None:
                    raise ValueError()
            except (KeyError, TypeError, ValueError):
                raise Problem(400, 'invalid_cursor') from None
        rows = await conn.fetch(f'''SELECT {summary_columns()} FROM memories WHERE owner_id=$1 AND deleted_at IS NULL
            AND archived=$2 AND created_sequence<=$3
            AND ($4::timestamptz IS NULL OR (created_at,id)<($4,$5::uuid))
            ORDER BY created_at DESC,id DESC LIMIT $6''', owner, archived, high, before_time, before_id, limit+1)
        page = rows[:limit]
        next_cursor = None
        if len(rows) > limit:
            last = page[-1]
            next_cursor = encode(request.app.state.settings, owner, user['sync_epoch'], 'list',
                                 high=high, archived=archived, before_time=last['created_at'].isoformat(), before_id=str(last['id']))
        return {'items': [memory(row, detail=False) for row in page], 'next_cursor': next_cursor,
                'sync_cursor': encode(request.app.state.settings, owner, user['sync_epoch'], 'sync', after=high)}


@router.get('/search')
async def search_memories(request: Request, q: str = Query(min_length=1, max_length=160),
                          limit: int = Query(default=20, ge=1, le=50), who=Depends(principal)):
    """Owner-scoped literal keyword search; not embeddings or semantic inference."""
    query = q.strip()
    if not query:
        raise Problem(422, 'invalid_search_query')
    async with owned(request.app.state.pool, who[0], isolation='repeatable_read', readonly=True) as conn:
        rows = await conn.fetch(f'''SELECT {summary_columns()} FROM memories
            WHERE owner_id=$1 AND deleted_at IS NULL
            AND (strpos(lower(title), lower($2))>0
                 OR strpos(lower(user_note), lower($2))>0)
            ORDER BY created_at DESC,id DESC LIMIT $3''', who[0], query, limit+1)
    return {'items': [memory(row, detail=False) for row in rows[:limit]],
            'has_more': len(rows) > limit}


@router.get('/memories/{memory_id}')
async def get_note(memory_id: UUID, request: Request, who=Depends(principal)):
    async with owned(request.app.state.pool, who[0]) as conn:
        row = await conn.fetchrow('SELECT * FROM memories WHERE id=$1 AND deleted_at IS NULL', memory_id)
        if row is None:
            raise Problem(404, 'memory_not_found')
        return memory(row)


@router.patch('/memories/{memory_id}')
async def edit_note(memory_id: UUID, body: EditNote, request: Request, who=Depends(principal)):
    async with writing(request, who) as conn:
        row = await conn.fetchrow('SELECT * FROM memories WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', memory_id)
        if row is None:
            raise Problem(404, 'memory_not_found')
        if row['version'] != body.expected_version:
            raise Problem(409, 'version_conflict', current=memory(row))
        values = dict(row)
        for field in body.model_fields_set - {'expected_version'}:
            values['user_note' if field == 'content' else field] = getattr(body, field)
        if row['kind'] == 'link':
            require_http_bookmark(values['user_note'])
        if all(values[k] == row[k] for k in ('title', 'user_note', 'starred', 'archived')):
            return memory(row)
        updated = await conn.fetchrow('''UPDATE memories SET title=$1,user_note=$2,starred=$3,archived=$4,
            version=version+1,updated_at=clock_timestamp() WHERE id=$5 RETURNING *''',
            values['title'], values['user_note'], values['starred'], values['archived'], memory_id)
        await publish(conn, who[0], updated, 'upsert')
        return memory(updated)


@router.delete('/memories/{memory_id}', status_code=204)
async def delete_note(memory_id: UUID, request: Request,
                      expected_version: int = Query(ge=1, le=2147483646), who=Depends(principal)):
    async with writing(request, who) as conn:
        row = await conn.fetchrow('SELECT * FROM memories WHERE id=$1 FOR UPDATE', memory_id)
        if row is None:
            raise Problem(404, 'memory_not_found')
        if row['deleted_at'] is not None:
            return
        if row['version'] != expected_version:
            raise Problem(409, 'version_conflict', current=memory(row))
        updated = await conn.fetchrow('''UPDATE memories SET deleted_at=clock_timestamp(),updated_at=clock_timestamp(),
            version=version+1 WHERE id=$1 RETURNING *''', memory_id)
        await publish(conn, who[0], updated, 'delete')
