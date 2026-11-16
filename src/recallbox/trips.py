"""Editable source-linked trip shortlist without hallucinated location facts."""
import json
from datetime import date
from typing import Literal
from uuid import UUID,uuid4
from fastapi import APIRouter,Depends,Request
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel,ConfigDict,Field,model_validator
from .auth import principal
from .db import owned
from .memories import writing
from .action_options import eligible_actions
from .problems import Problem

router=APIRouter(prefix='/v1')

class TripItem(BaseModel):
    model_config=ConfigDict(extra='forbid',strict=True)
    id:UUID=Field(strict=False)
    label:str=Field(min_length=1,max_length=160)
    note:str=Field(default='',max_length=1000)
    day:int|None=Field(default=None,ge=1,le=30)
    source_memory_id:UUID|None=Field(default=None,strict=False)
    origin:Literal['source','user']='user'

    @model_validator(mode='after')
    def safe(self):
        if not self.label.strip():
            raise ValueError('Item label required')
        if self.origin=='source' and not self.source_memory_id:
            raise ValueError('Source item must link to real saved memory')
        if self.origin=='user' and self.source_memory_id:
            raise ValueError('Manual place must not claim verified source')
        return self

class TripEdit(BaseModel):
    model_config=ConfigDict(extra='forbid',strict=True)
    expected_version:int=Field(ge=1,le=2147483646)
    name:str|None=Field(default=None,max_length=160)
    start_date:date|None=None
    end_date:date|None=None
    items:list[TripItem]|None=Field(default=None,max_length=60)

    @model_validator(mode='after')
    def validate_edit(self):
        fields=self.model_fields_set-{'expected_version'}
        if not fields:raise ValueError('Specify an edit')
        if self.name is not None and not self.name.strip():
            raise ValueError('Trip name required')
        if self.start_date and self.end_date and self.end_date<self.start_date:
            raise ValueError('End date before start date')
        if self.items is not None and len({i.id for i in self.items})!=len(self.items):
            raise ValueError('Duplicate item id')
        return self


def output(row):
    result={k:row[k] for k in ('id','source_memory_id','name','start_date','end_date',
       'items','version','created_at','updated_at')}
    if isinstance(result['items'],str):result['items']=json.loads(result['items'])
    if 'source_title' in row:
        result['source_title']=row['source_title'] or 'Saved travel source'
        result['source_url']=row['source_url']
    return jsonable_encoder(result)

async def find(conn,owner,list_id,locked=False):
    row=await conn.fetchrow('''SELECT t.*,m.title AS source_title,m.source_url
      FROM trip_shortlists t LEFT JOIN memories m
      ON m.id=t.source_memory_id AND m.owner_id=t.owner_id
      WHERE t.id=$1 AND t.owner_id=$2 AND t.deleted_at IS NULL''' +
      (' FOR UPDATE OF t' if locked else ''),list_id,owner)
    if row is None:raise Problem(404,'trip_not_found')
    return row

@router.get('/trip-shortlists/{trip_id}')
async def get_trip(trip_id:UUID,request:Request,who=Depends(principal)):
    async with owned(request.app.state.pool,who[0],readonly=True) as conn:
        return output(await find(conn,who[0],trip_id))

@router.post('/memories/{memory_id}/trip-shortlist',status_code=201)
async def create_trip(memory_id:UUID,request:Request,who=Depends(principal)):
    owner=who[0]
    async with writing(request,who) as conn:
        previous=await conn.fetchval('''SELECT id FROM trip_shortlists WHERE owner_id=$1
          AND source_memory_id=$2 AND deleted_at IS NULL''',owner,memory_id)
        if previous:return output(await find(conn,owner,previous))
        source=await conn.fetchrow('''SELECT * FROM memories WHERE id=$1
          AND owner_id=$2 AND deleted_at IS NULL''',memory_id,owner)
        if source is None:raise Problem(404,'memory_not_found')
        if not any(x['kind']=='trip' for x in eligible_actions(source)):
            raise Problem(422,'insufficient_travel_evidence')
        # A travel guide is inspiration, not proof of an address or individual destination.
        items=[{'id':str(uuid4()),'label':source['title'] or 'Saved travel inspiration',
          'note':'','day':None,'source_memory_id':str(memory_id),'origin':'source'}]
        trip_id=uuid4()
        await conn.execute('''INSERT INTO trip_shortlists(id,owner_id,source_memory_id,name,items)
          VALUES($1,$2,$3,$4,$5::jsonb)''',trip_id,owner,memory_id,'Trip shortlist',json.dumps(items))
        return output(await find(conn,owner,trip_id))

@router.patch('/trip-shortlists/{trip_id}')
async def edit_trip(trip_id:UUID,body:TripEdit,request:Request,who=Depends(principal)):
    owner=who[0]
    async with writing(request,who) as conn:
        current=await find(conn,owner,trip_id,locked=True)
        if current['version']!=body.expected_version:
            raise Problem(409,'trip_version_conflict',current=output(current))
        items=([i.model_dump(mode='json') for i in body.items]
           if body.items is not None else current['items'])
        if isinstance(items,str):items=json.loads(items)
        for item in items:
            if item['origin']=='source':
                found=await conn.fetchval('''SELECT id FROM memories WHERE owner_id=$1
                  AND id=$2 AND deleted_at IS NULL''',owner,UUID(str(item['source_memory_id'])))
                if found is None:raise Problem(422,'invalid_source_reference')
        name=body.name.strip() if body.name is not None else current['name']
        start=body.start_date if 'start_date' in body.model_fields_set else current['start_date']
        end=body.end_date if 'end_date' in body.model_fields_set else current['end_date']
        if start and end and end<start:raise Problem(422,'invalid_date_range')
        if name==current['name'] and start==current['start_date'] and end==current['end_date'] and items==current['items']:
            return output(current)
        await conn.execute('''UPDATE trip_shortlists SET name=$2,start_date=$3,end_date=$4,
           items=$5::jsonb,version=version+1,updated_at=clock_timestamp()
           WHERE id=$1 AND owner_id=$6''',trip_id,name,start,end,json.dumps(items),owner)
        return output(await find(conn,owner,trip_id))
