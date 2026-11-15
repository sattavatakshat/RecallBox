"""Explicit, private collections of saved notes and links (S8 beta slice).

No automatic classification, cross-account visibility, raw file uploads or AI
calls. All queries run under transaction-local owner RLS.
"""
from uuid import UUID, uuid4

import asyncpg
from fastapi import APIRouter, Depends, Query, Request
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field, field_validator

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
                         who=Depends(principal)):
    owner = who[0]
    async with owned(request.app.state.pool, owner, isolation='repeatable_read', readonly=True) as conn:
        collection = await find_collection(conn, owner, collection_id)
        rows = await conn.fetch(f'''SELECT {summary_columns()} FROM collection_items ci
            JOIN memories m ON m.id=ci.memory_id AND m.owner_id=ci.owner_id
            WHERE ci.owner_id=$1 AND ci.collection_id=$2
              AND ci.removed_at IS NULL AND m.deleted_at IS NULL
            ORDER BY ci.added_at DESC,m.id DESC LIMIT $3''', owner, collection_id, limit+1)
    return {**format_collection(collection), 'items': [
        memory(row, detail=False) for row in rows[:limit]
    ], 'has_more': len(rows) > limit}


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
