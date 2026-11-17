"""Explicit, private collections of saved notes and links (S8 beta slice).

No automatic classification, cross-account visibility, raw file uploads or AI
calls. All queries run under transaction-local owner RLS.
"""
from datetime import datetime
from uuid import UUID, uuid4

import asyncpg
from fastapi import APIRouter, Depends, Query, Request
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .cursors import decode, encode
from .auth import principal
from .db import owned
from .memories import memory, summary_columns
from .problems import Problem

router = APIRouter(prefix='/v1')


class CollectionCreate(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    name: str = Field(min_length=1, max_length=80)

    @field_validator('name')
    @classmethod
    def normal_name(cls, value):
        clean = value.strip()
        if not clean:
            raise ValueError('A collection name is required')
        return clean


class CollectionRename(CollectionCreate):
    expected_version: int = Field(ge=1, le=2147483646)


def format_collection(row):
    result = {
        'id': row['id'], 'name': row['name'], 'version': row['version'],
        'created_at': row['created_at'], 'updated_at': row['updated_at'],
    }
    if 'item_count' in row:
        result['item_count'] = row['item_count']
    return jsonable_encoder(result)


async def find_collection(conn, owner, collection_id, *, locked=False):
    suffix = ' FOR UPDATE' if locked else ''
    row = await conn.fetchrow(
        'SELECT * FROM collections WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL' + suffix,
        collection_id, owner
    )
    if row is None:
        raise Problem(404, 'collection_not_found')
    return row


@router.get('/collections')
async def list_collections(request: Request, limit: int = Query(default=50, ge=1, le=100),
                           who=Depends(principal)):
    owner = who[0]
    async with owned(request.app.state.pool, owner, isolation='repeatable_read', readonly=True) as conn:
        rows = await conn.fetch('''SELECT c.id,c.name,c.version,c.created_at,c.updated_at,
            count(m.id)::int AS item_count FROM collections c
            LEFT JOIN collection_items ci ON ci.collection_id=c.id AND ci.owner_id=c.owner_id
                 AND ci.removed_at IS NULL
            LEFT JOIN memories m ON m.id=ci.memory_id AND m.owner_id=c.owner_id
                 AND m.deleted_at IS NULL
            WHERE c.owner_id=$1 AND c.deleted_at IS NULL
            GROUP BY c.id ORDER BY c.created_at DESC,c.id DESC LIMIT $2''',
            owner, limit+1)
    return {'items': [format_collection(row) for row in rows[:limit]],
            'has_more': len(rows) > limit}


@router.post('/collections', status_code=201)
async def create_collection(body: CollectionCreate, request: Request,
                            who=Depends(principal)):
    owner = who[0]
    try:
        async with owned(request.app.state.pool, owner) as conn:
            # Lock the owner row to cap collection count under concurrent creates.
            await conn.fetchval('SELECT id FROM users WHERE id=$1 FOR UPDATE', owner)
            count = await conn.fetchval(
                'SELECT count(*) FROM collections WHERE owner_id=$1 AND deleted_at IS NULL', owner
            )
            if count >= 100:
                raise Problem(409, 'collection_limit_reached')
            row = await conn.fetchrow('''INSERT INTO collections(id,owner_id,name)
                VALUES($1,$2,$3) RETURNING *''', uuid4(), owner, body.name)
            return format_collection(row)
    except asyncpg.UniqueViolationError:
        raise Problem(409, 'collection_name_exists') from None


@router.get('/collections/{collection_id}')
async def get_collection(collection_id: UUID, request: Request,
                         limit: int = Query(default=50, ge=1, le=100),
                         cursor: str | None = Query(default=None, max_length=4096),
                         who=Depends(principal)):
    owner = who[0]
    async with owned(request.app.state.pool, owner, isolation='repeatable_read', readonly=True) as conn:
        collection = await find_collection(conn, owner, collection_id)
        epoch = await conn.fetchval('SELECT sync_epoch FROM users WHERE id=$1', owner)
        before_time, before_id = None, None
        if cursor:
            state = decode(request.app.state.settings, cursor, owner, epoch, 'collection')
            try:
                if state['collection_id'] != str(collection_id):
                    raise ValueError()
                before_time, before_id = datetime.fromisoformat(state['before_time']), UUID(state['before_id'])
                if before_time.tzinfo is None:
                    raise ValueError()
            except (KeyError, TypeError, ValueError):
                raise Problem(400, 'invalid_cursor') from None
        count = await conn.fetchval('''SELECT count(*) FROM collection_items ci
            JOIN memories m ON m.id=ci.memory_id AND m.owner_id=ci.owner_id
            WHERE ci.owner_id=$1 AND ci.collection_id=$2
              AND ci.removed_at IS NULL AND m.deleted_at IS NULL''', owner, collection_id)
        rows = await conn.fetch(f'''SELECT {summary_columns(prefix='m.')},ci.added_at FROM collection_items ci
            JOIN memories m ON m.id=ci.memory_id AND m.owner_id=ci.owner_id
            WHERE ci.owner_id=$1 AND ci.collection_id=$2
              AND ci.removed_at IS NULL AND m.deleted_at IS NULL
            AND ($4::timestamptz IS NULL OR (ci.added_at,m.id)<($4,$5::uuid))
            ORDER BY ci.added_at DESC,m.id DESC LIMIT $3''', owner, collection_id, limit+1, before_time, before_id)
        next_cursor = None
        if len(rows) > limit:
            last = rows[limit-1]
            next_cursor = encode(request.app.state.settings, owner, epoch, 'collection',
                collection_id=str(collection_id), before_time=last['added_at'].isoformat(), before_id=str(last['id']))
    return jsonable_encoder({**format_collection(collection), 'item_count': count, 'next_cursor': next_cursor, 'items': [
        {**memory(row, detail=False), 'collection_added_at': row['added_at'].isoformat(timespec='microseconds')} for row in rows[:limit]
    ], 'has_more': len(rows) > limit})


class MembershipStatus(BaseModel):
    model_config = ConfigDict(extra='forbid')
    memory_ids: list[UUID] = Field(max_length=100)


@router.post('/collections/{collection_id}/membership-status')
async def membership_status(collection_id: UUID, body: MembershipStatus, request: Request,
                            who=Depends(principal)):
    """Bounded reconciliation; missing IDs are not active members."""
    owner = who[0]
    async with owned(request.app.state.pool, owner, readonly=True) as conn:
        await find_collection(conn, owner, collection_id)
        rows = await conn.fetch(f'''SELECT {summary_columns(prefix='m.')},ci.added_at FROM memories m
            JOIN collection_items ci ON ci.memory_id=m.id AND ci.owner_id=m.owner_id
            WHERE ci.owner_id=$1 AND ci.collection_id=$2 AND m.id=ANY($3::uuid[])
              AND ci.removed_at IS NULL AND m.deleted_at IS NULL''', owner, collection_id, body.memory_ids)
    return jsonable_encoder({'items': [{**memory(row, detail=False), 'collection_added_at': row['added_at'].isoformat(timespec='microseconds')} for row in rows]})


@router.get('/collections/{collection_id}/candidates')
async def collection_candidates(collection_id: UUID, request: Request,
                                q: str = Query(default='', max_length=200),
                                cursor: str | None = Query(default=None, max_length=4096),
                                limit: int = Query(default=20, ge=1, le=50), who=Depends(principal)):
    """Existing keyword predicates over all durable originals, with stable pages."""
    owner = who[0]
    q = q.strip()
    async with owned(request.app.state.pool, owner, isolation='repeatable_read', readonly=True) as conn:
        group = await find_collection(conn, owner, collection_id)
        user = await conn.fetchrow('SELECT sync_epoch,sync_sequence FROM users WHERE id=$1', owner)
        high, before_time, before_id = user['sync_sequence'], None, None
        if cursor:
            state = decode(request.app.state.settings, cursor, owner, user['sync_epoch'], 'collection-picker')
            try:
                if state['collection_id'] != str(collection_id) or state['q'] != q:
                    raise ValueError()
                high = state['high']
                if type(high) is not int or not 0 <= high <= user['sync_sequence']:
                    raise ValueError()
                before_time, before_id = datetime.fromisoformat(state['before_time']), UUID(state['before_id'])
                if before_time.tzinfo is None:
                    raise ValueError()
            except (KeyError, TypeError, ValueError):
                raise Problem(400, 'invalid_cursor') from None
        rows = await conn.fetch(f'''SELECT {summary_columns(prefix='m.')}, EXISTS(
            SELECT 1 FROM collection_items ci WHERE ci.owner_id=$1 AND ci.collection_id=$2
            AND ci.memory_id=m.id AND ci.removed_at IS NULL) AS already_added
            FROM memories m WHERE m.owner_id=$1 AND m.deleted_at IS NULL AND m.created_sequence<=$3
            AND ($4::timestamptz IS NULL OR (m.created_at,m.id)<($4,$5::uuid))
            AND (m.kind NOT IN ('image','pdf') OR EXISTS(SELECT 1 FROM capture_assets a
                 WHERE a.memory_id=m.id AND a.owner_id=m.owner_id))
            AND ($6='' OR to_tsvector('english',m.title || ' ' || m.user_note || ' ' || m.extracted_text)
                @@ plainto_tsquery('english',$6) OR strpos(lower(concat_ws(' ',m.title,m.user_note,
                m.extracted_text,m.source_url,m.collection,array_to_string(m.labels,' '),m.topic_override,
                array_to_string(m.tags_override,' '))),lower($6))>0)
            ORDER BY m.created_at DESC,m.id DESC LIMIT $7''',
            owner, collection_id, high, before_time, before_id, q, limit+1)
        page = rows[:limit]
        next_cursor = None
        if len(rows) > limit:
            next_cursor = encode(request.app.state.settings, owner, user['sync_epoch'], 'collection-picker',
                collection_id=str(collection_id), q=q, high=high,
                before_time=page[-1]['created_at'].isoformat(), before_id=str(page[-1]['id']))
    return {'name': group['name'], 'items': [
        {**memory(row, detail=False), 'already_added': row['already_added']} for row in page],
        'next_cursor': next_cursor}


@router.patch('/collections/{collection_id}')
async def rename_collection(collection_id: UUID, body: CollectionRename, request: Request,
                            who=Depends(principal)):
    owner = who[0]
    try:
        async with owned(request.app.state.pool, owner) as conn:
            current = await find_collection(conn, owner, collection_id, locked=True)
            if current['version'] != body.expected_version:
                raise Problem(409, 'collection_version_conflict')
            if current['name'] == body.name:
                return format_collection(current)
            row = await conn.fetchrow('''UPDATE collections SET name=$1,version=version+1,
                updated_at=clock_timestamp() WHERE id=$2 AND owner_id=$3 RETURNING *''',
                body.name, collection_id, owner)
            return format_collection(row)
    except asyncpg.UniqueViolationError:
        raise Problem(409, 'collection_name_exists') from None


@router.delete('/collections/{collection_id}', status_code=204)
async def remove_collection(collection_id: UUID, request: Request,
                            expected_version: int = Query(ge=1, le=2147483646),
                            who=Depends(principal)):
    owner = who[0]
    async with owned(request.app.state.pool, owner) as conn:
        current = await find_collection(conn, owner, collection_id, locked=True)
        if current['version'] != expected_version:
            raise Problem(409, 'collection_version_conflict')
        await conn.execute('''UPDATE collections SET deleted_at=clock_timestamp(),
            version=version+1,updated_at=clock_timestamp()
            WHERE owner_id=$1 AND id=$2''', owner, collection_id)


@router.put('/collections/{collection_id}/memories/{memory_id}', status_code=204)
async def add_to_collection(collection_id: UUID, memory_id: UUID, request: Request,
                            who=Depends(principal)):
    owner = who[0]
    async with owned(request.app.state.pool, owner) as conn:
        await find_collection(conn, owner, collection_id, locked=True)
        found = await conn.fetchval('''SELECT id FROM memories WHERE id=$1
            AND owner_id=$2 AND deleted_at IS NULL FOR UPDATE''', memory_id, owner)
        if found is None:
            raise Problem(404, 'memory_not_found')
        await conn.execute('''INSERT INTO collection_items(owner_id,collection_id,memory_id)
            VALUES($1,$2,$3) ON CONFLICT(owner_id,collection_id,memory_id)
            DO UPDATE SET removed_at=NULL,added_at=clock_timestamp()
            WHERE collection_items.removed_at IS NOT NULL''',
            owner, collection_id, memory_id)


@router.delete('/collections/{collection_id}/memories/{memory_id}', status_code=204)
async def remove_from_collection(collection_id: UUID, memory_id: UUID, request: Request,
                                 who=Depends(principal)):
    owner = who[0]
    async with owned(request.app.state.pool, owner) as conn:
        await find_collection(conn, owner, collection_id, locked=True)
        await conn.execute('''UPDATE collection_items
            SET removed_at=clock_timestamp()
            WHERE owner_id=$1 AND collection_id=$2 AND memory_id=$3 AND removed_at IS NULL''',
            owner, collection_id, memory_id)


@router.get('/memories/{memory_id}/collections')
async def collections_for_memory(memory_id: UUID, request: Request,
                                 who=Depends(principal)):
    """Get real active memberships for one owner-scoped saved memory."""
    owner = who[0]
    async with owned(request.app.state.pool, owner, readonly=True) as conn:
        exists = await conn.fetchval(
            'SELECT id FROM memories WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL',
            memory_id, owner
        )
        if exists is None:
            raise Problem(404, 'memory_not_found')
        rows = await conn.fetch('''SELECT c.id,c.name,c.version,c.created_at,c.updated_at
            FROM collection_items ci
            JOIN collections c ON c.id=ci.collection_id AND c.owner_id=ci.owner_id
            WHERE ci.owner_id=$1 AND ci.memory_id=$2 AND ci.removed_at IS NULL
              AND c.deleted_at IS NULL ORDER BY c.name,c.id''', owner, memory_id)
        return {'items': [format_collection(row) for row in rows]}
