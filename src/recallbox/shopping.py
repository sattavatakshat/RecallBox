"""Persistent, source-traceable shopping lists. No generated ingredients."""
import json
from typing import Literal
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, Request
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from .auth import principal
from .db import owned
from .memories import writing
from .action_options import eligible_actions
from .problems import Problem

router = APIRouter(prefix='/v1')


class ShoppingItem(BaseModel):
    model_config = ConfigDict(extra='forbid',strict=True)
    id: UUID = Field(strict=False)
    text: str = Field(min_length=1,max_length=200)
    checked: bool = False
    origin: Literal['source','user']
    source_quote: str | None = Field(default=None,max_length=200)

    @field_validator('text')
    @classmethod
    def meaningful(cls,value):
        if not value.strip():
            raise ValueError('Item text required')
        return value.strip()

    @model_validator(mode='after')
    def evidence(self):
        if self.origin == 'source' and not self.source_quote:
            raise ValueError('Source entry requires original quote')
        if self.origin == 'user' and self.source_quote is not None:
            raise ValueError('Manual entries cannot claim source evidence')
        return self


class ShoppingEdit(BaseModel):
    model_config = ConfigDict(extra='forbid',strict=True)
    expected_version: int = Field(ge=1,le=2147483646)
    title: str | None = Field(default=None,max_length=160)
    items: list[ShoppingItem] | None = Field(default=None,max_length=60)

    @model_validator(mode='after')
    def validate_edit(self):
        if self.title is None and self.items is None:
            raise ValueError('No changes provided')
        if self.title is not None and not self.title.strip():
            raise ValueError('Title cannot be blank')
        if self.items is not None and len({item.id for item in self.items})!=len(self.items):
            raise ValueError('Duplicate item identifiers')
        return self


def decoded(row):
    result = {key:row[key] for key in
              ('id','source_memory_id','title','items','version','created_at','updated_at')}
    if isinstance(result['items'],str):
        result['items']=json.loads(result['items'])
    if 'source_title' in row:
        result['source_title']=row['source_title'] or 'Original memory unavailable'
        result['source_url']=row['source_url']
    return jsonable_encoder(result)


async def find(conn, owner, list_id, locked=False):
    suffix = ' FOR UPDATE OF s' if locked else ''
    row = await conn.fetchrow('''SELECT s.*,m.title AS source_title,m.source_url
        FROM shopping_lists s LEFT JOIN memories m
          ON m.id=s.source_memory_id AND m.owner_id=s.owner_id
        WHERE s.id=$1 AND s.owner_id=$2 AND s.deleted_at IS NULL''' + suffix,
        list_id, owner)
    if row is None:
        raise Problem(404,'shopping_list_not_found')
    return row


@router.get('/shopping-lists/{list_id}')
async def get_list(list_id: UUID, request: Request, who=Depends(principal)):
    async with owned(request.app.state.pool, who[0], readonly=True) as conn:
        return decoded(await find(conn,who[0],list_id))


@router.post('/memories/{memory_id}/shopping-list',status_code=201)
async def create_list(memory_id: UUID, request: Request, who=Depends(principal)):
    owner=who[0]
    async with writing(request,who) as conn:
        previous = await conn.fetchrow('''SELECT id FROM shopping_lists
            WHERE owner_id=$1 AND source_memory_id=$2 AND deleted_at IS NULL''',
            owner,memory_id)
        if previous:
            return decoded(await find(conn,owner,previous['id']))
        source = await conn.fetchrow('''SELECT * FROM memories
            WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL''',memory_id,owner)
        if source is None:
            raise Problem(404,'memory_not_found')
        recipe = next((item for item in eligible_actions(source)
                       if item['kind']=='shopping'),None)
        if recipe is None:
            raise Problem(422,'insufficient_recipe_evidence')
        ingredients=recipe['evidence_lines']
        items=[{
            'id':str(uuid4()),'text':line,'checked':False,
            'origin':'source','source_quote':line,
        } for line in ingredients]
        list_id=uuid4()
        await conn.execute('''INSERT INTO shopping_lists
            (id,owner_id,source_memory_id,title,items)
            VALUES($1,$2,$3,$4,$5::jsonb)''',
            list_id,owner,memory_id,'Shopping list',json.dumps(items))
        return decoded(await find(conn,owner,list_id))


@router.patch('/shopping-lists/{list_id}')
async def edit_list(list_id: UUID, body: ShoppingEdit, request: Request,
                    who=Depends(principal)):
    owner=who[0]
    async with writing(request,who) as conn:
        row=await find(conn,owner,list_id,locked=True)
        if row['version']!=body.expected_version:
            raise Problem(409,'shopping_list_version_conflict',current=decoded(row))
        previous_items=json.loads(row['items']) if isinstance(row['items'],str) else row['items']
        original_quotes={item['source_quote'] for item in previous_items
                         if item.get('origin')=='source'}
        items = ([item.model_dump(mode='json') for item in body.items]
                 if body.items is not None else previous_items)
        for item in items:
            if item['origin']=='source' and item['source_quote'] not in original_quotes:
                raise Problem(422,'unverified_ingredient')
        title=body.title.strip() if body.title is not None else row['title']
        if title==row['title'] and items==previous_items:
            return decoded(row)
        updated=await conn.fetchrow('''UPDATE shopping_lists
            SET title=$2,items=$3::jsonb,version=version+1,updated_at=clock_timestamp()
            WHERE id=$1 AND owner_id=$4 RETURNING id''',
            list_id,title,json.dumps(items),owner)
        return decoded(await find(conn,owner,updated['id']))
