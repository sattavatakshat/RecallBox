"""Real in-app reminders with timezone-aware due dates; never claim push delivery."""
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, Request
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .auth import principal
from .db import owned
from .memories import writing
from .problems import Problem

router = APIRouter(prefix='/v1')


class ReminderCreate(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    request_key: UUID = Field(strict=False)
    due_at: datetime
    time_zone: str = Field(min_length=3, max_length=64)

    @model_validator(mode='after')
    def validate(self):
        if self.due_at.tzinfo is None or self.due_at.utcoffset() is None:
            raise ValueError('Timezone-aware due date required')
        if not datetime.now(timezone.utc) < self.due_at < datetime.now(timezone.utc) + timedelta(days=365*5):
            raise ValueError('Reminder must be in the future, within five years')
        try:
            ZoneInfo(self.time_zone)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError('Invalid IANA timezone')
        return self


class ReminderEdit(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    expected_version: int = Field(ge=1, le=2147483646)
    status: str = Field(pattern='^completed$')


def output(row):
    return jsonable_encoder({k:row[k] for k in (
        'id','source_memory_id','source_title','source_url','due_at','time_zone',
        'status','version','created_at','updated_at',
    )})


async def find(conn, owner, item_id, locked=False):
    row = await conn.fetchrow("""SELECT r.*,m.title AS source_title,m.source_url
        FROM reminders r LEFT JOIN memories m
        ON m.id=r.source_memory_id AND m.owner_id=r.owner_id AND m.deleted_at IS NULL
        WHERE r.id=$1 AND r.owner_id=$2 AND r.deleted_at IS NULL""" +
        (' FOR UPDATE OF r' if locked else ''), item_id, owner)
    if row is None:
        raise Problem(404,'reminder_not_found')
    return row


@router.get('/reminders')
async def list_reminders(request: Request, who=Depends(principal)):
    async with owned(request.app.state.pool, who[0], readonly=True) as conn:
        rows = await conn.fetch("""SELECT r.*,m.title AS source_title,m.source_url
            FROM reminders r LEFT JOIN memories m
            ON m.id=r.source_memory_id AND m.owner_id=r.owner_id AND m.deleted_at IS NULL
            WHERE r.owner_id=$1 AND r.deleted_at IS NULL
            ORDER BY (r.status='completed') ASC,r.due_at ASC,r.id ASC LIMIT 101""",who[0])
        return {'items':[output(r) for r in rows[:100]],'has_more':len(rows)>100}


@router.post('/memories/{memory_id}/reminders',status_code=201)
async def create_reminder(memory_id: UUID, body: ReminderCreate, request: Request,
                          who=Depends(principal)):
    owner=who[0]
    async with writing(request, who) as conn:
        previous=await conn.fetchrow("""SELECT id,source_memory_id,due_at,time_zone FROM reminders
            WHERE owner_id=$1 AND request_key=$2""",owner,body.request_key)
        if previous:
            if (previous['source_memory_id']!=memory_id
                or previous['due_at']!=body.due_at or previous['time_zone']!=body.time_zone):
                raise Problem(409,'reminder_request_conflict')
            return output(await find(conn,owner,previous['id']))
        source=await conn.fetchval("""SELECT id FROM memories WHERE id=$1 AND owner_id=$2
            AND deleted_at IS NULL""",memory_id,owner)
        if source is None:
            raise Problem(404,'memory_not_found')
        item_id=uuid4()
        await conn.execute("""INSERT INTO reminders
            (id,owner_id,source_memory_id,request_key,due_at,time_zone)
            VALUES($1,$2,$3,$4,$5,$6)""",
            item_id,owner,memory_id,body.request_key,body.due_at,body.time_zone)
        return output(await find(conn,owner,item_id))


@router.patch('/reminders/{item_id}')
async def mark_completed(item_id: UUID, body: ReminderEdit, request: Request,
                         who=Depends(principal)):
    owner=who[0]
    async with writing(request,who) as conn:
        current=await find(conn,owner,item_id,locked=True)
        if current['version']!=body.expected_version:
            raise Problem(409,'reminder_version_conflict',current=output(current))
        if current['status']=='completed':
            return output(current)
        await conn.execute("""UPDATE reminders SET status='completed',version=version+1,
            updated_at=clock_timestamp() WHERE id=$1 AND owner_id=$2""",item_id,owner)
        return output(await find(conn,owner,item_id))


@router.delete('/reminders/{item_id}',status_code=204)
async def remove_reminder(item_id: UUID, expected_version: int, request: Request,
                          who=Depends(principal)):
    owner=who[0]
    async with writing(request,who) as conn:
        current=await find(conn,owner,item_id,locked=True)
        if current['version']!=expected_version:
            raise Problem(409,'reminder_version_conflict',current=output(current))
        await conn.execute("""UPDATE reminders SET deleted_at=clock_timestamp(),
            version=version+1 WHERE id=$1 AND owner_id=$2""",item_id,owner)
