"""Real learning queue from saved, readable source material; no invented tutorials."""
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Request
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .action_options import eligible_actions
from .auth import principal
from .db import owned
from .memories import writing
from .problems import Problem

router = APIRouter(prefix='/v1')


class LearningEdit(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    expected_version: int = Field(ge=1, le=2147483646)
    status: Literal['not_started', 'in_progress', 'completed'] | None = None
    move: Literal['up', 'down'] | None = None

    @model_validator(mode='after')
    def nonempty(self):
        if self.status is None and self.move is None:
            raise ValueError('Specify progress or a move')
        return self


def output(row):
    return jsonable_encoder({key: row[key] for key in (
        'id', 'source_memory_id', 'status', 'sort_order', 'version',
        'created_at', 'updated_at', 'source_title', 'source_url',
    )})


async def find(conn, owner, item_id, locked=False):
    row = await conn.fetchrow("""SELECT q.*,m.title AS source_title,m.source_url
        FROM learning_items q JOIN memories m
          ON m.id=q.source_memory_id AND m.owner_id=q.owner_id
        WHERE q.id=$1 AND q.owner_id=$2 AND q.deleted_at IS NULL""" +
        (' FOR UPDATE OF q' if locked else ''), item_id, owner)
    if row is None:
        raise Problem(404, 'learning_item_not_found')
    return row


@router.get('/learning-items')
async def list_items(request: Request, who=Depends(principal)):
    async with owned(request.app.state.pool, who[0], readonly=True) as conn:
        rows = await conn.fetch("""SELECT q.*,m.title AS source_title,m.source_url
            FROM learning_items q JOIN memories m
              ON m.id=q.source_memory_id AND m.owner_id=q.owner_id
            WHERE q.owner_id=$1 AND q.deleted_at IS NULL
            ORDER BY q.sort_order ASC,q.id ASC LIMIT 101""", who[0])
        return {'items': [output(row) for row in rows[:100]], 'has_more': len(rows) > 100}


@router.get('/learning-items/{item_id}')
async def get_item(item_id: UUID, request: Request, who=Depends(principal)):
    async with owned(request.app.state.pool, who[0], readonly=True) as conn:
        return output(await find(conn, who[0], item_id))


@router.post('/memories/{memory_id}/learning-item', status_code=201)
async def create_item(memory_id: UUID, request: Request, who=Depends(principal)):
    owner = who[0]
    async with writing(request, who) as conn:
        # Serializes per-account insert/reorder and keeps ordering deterministic.
        await conn.fetchrow('SELECT id FROM users WHERE id=$1 FOR UPDATE', owner)
        existing = await conn.fetchval("""SELECT id FROM learning_items
            WHERE owner_id=$1 AND source_memory_id=$2 AND deleted_at IS NULL""",
            owner, memory_id)
        if existing:
            return output(await find(conn, owner, existing))
        source = await conn.fetchrow("""SELECT * FROM memories
            WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL""", memory_id, owner)
        if source is None:
            raise Problem(404, 'memory_not_found')
        if not any(action['kind'] == 'learning' for action in eligible_actions(source)):
            raise Problem(422, 'insufficient_learning_evidence')
        order = await conn.fetchval("""SELECT COALESCE(MAX(sort_order),0)+1000
            FROM learning_items WHERE owner_id=$1 AND deleted_at IS NULL""", owner)
        item_id = uuid4()
        await conn.execute("""INSERT INTO learning_items
            (id,owner_id,source_memory_id,sort_order) VALUES($1,$2,$3,$4)""",
            item_id, owner, memory_id, order)
        return output(await find(conn, owner, item_id))


@router.patch('/learning-items/{item_id}')
async def edit_item(item_id: UUID, body: LearningEdit, request: Request,
                    who=Depends(principal)):
    owner = who[0]
    async with writing(request, who) as conn:
        await conn.fetchrow('SELECT id FROM users WHERE id=$1 FOR UPDATE', owner)
        current = await find(conn, owner, item_id, locked=True)
        if current['version'] != body.expected_version:
            raise Problem(409, 'learning_version_conflict', current=output(current))
        order = current['sort_order']
        if body.move:
            if body.move == 'up':
                adjacent = await conn.fetchrow("""SELECT id,sort_order FROM learning_items
                    WHERE owner_id=$1 AND deleted_at IS NULL
                      AND (sort_order,id)<($2,$3)
                    ORDER BY sort_order DESC,id DESC LIMIT 1""", owner, order, item_id)
            else:
                adjacent = await conn.fetchrow("""SELECT id,sort_order FROM learning_items
                    WHERE owner_id=$1 AND deleted_at IS NULL
                      AND (sort_order,id)>($2,$3)
                    ORDER BY sort_order,id LIMIT 1""", owner, order, item_id)
            if adjacent:
                await conn.execute("""UPDATE learning_items
                    SET sort_order=$2,version=version+1,updated_at=clock_timestamp()
                    WHERE id=$1 AND owner_id=$3""",
                    adjacent['id'], order, owner)
                order = adjacent['sort_order']
        status = body.status if body.status is not None else current['status']
        if status == current['status'] and order == current['sort_order']:
            return output(current)
        await conn.execute("""UPDATE learning_items
            SET status=$2,sort_order=$3,version=version+1,
                updated_at=clock_timestamp() WHERE id=$1 AND owner_id=$4""",
            item_id, status, order, owner)
        return output(await find(conn, owner, item_id))


@router.delete('/learning-items/{item_id}', status_code=204)
async def remove_item(item_id: UUID, expected_version: int, request: Request,
                      who=Depends(principal)):
    owner = who[0]
    async with writing(request, who) as conn:
        current = await find(conn, owner, item_id, locked=True)
        if current['version'] != expected_version:
            raise Problem(409, 'learning_version_conflict', current=output(current))
        await conn.execute("""UPDATE learning_items SET deleted_at=clock_timestamp(),
            version=version+1 WHERE id=$1 AND owner_id=$2""", item_id, owner)
