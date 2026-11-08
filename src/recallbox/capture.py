"""Authenticated capture storage. Network retrieval runs only in the worker CLI."""
import hashlib
import json
from uuid import UUID, uuid4
from urllib.parse import unquote, urlsplit
from fastapi import APIRouter, Depends, Header, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from .auth import principal
from .db import owned
from .memories import memory, publish, writing
from .problems import Problem

router = APIRouter(prefix='/v1')


class Link(BaseModel):
    model_config = ConfigDict(extra='forbid')
    url: str = Field(min_length=10, max_length=4096)
    title: str = Field(default='', max_length=240)


async def store(request, who, key, kind, title, content, source=None, asset=None):
    fingerprint = hashlib.sha256(json.dumps([kind,title,content,source]).encode() + (asset[2] if asset else b'')).hexdigest()
    async with writing(request, who) as conn:
        previous = await conn.fetchrow("SELECT *,expires_at>now() AS usable FROM idempotency_keys WHERE key=$1 AND route='/v1/memories'", key)
        if previous:
            if previous['request_hash'] != fingerprint:
                raise Problem(409, 'idempotency_mismatch')
            if not previous['usable']:
                raise Problem(409, 'idempotency_expired')
            row = await conn.fetchrow('SELECT * FROM memories WHERE id=$1 AND deleted_at IS NULL', previous['response_entity_id'])
            if row is None:
                raise Problem(410, 'memory_deleted')
            return memory(row)
        count = await conn.fetchval('SELECT count(*) FROM ingestion_jobs WHERE state IN (\'queued\',\'processing\')')
        if count >= 30:
            raise Problem(429, 'capture_queue_full')
        used = await conn.fetchval('SELECT coalesce(sum(octet_length(data)),0) FROM capture_assets')
        if asset and used + len(asset[2]) > 128 * 1024 * 1024:
            raise Problem(413, 'account_storage_limit')
        seq = await conn.fetchval('SELECT sync_sequence+1 FROM users WHERE id=$1', who[0])
        row = await conn.fetchrow('''INSERT INTO memories(id,owner_id,kind,title,user_note,source_url,processing_state,created_sequence,labels)
          VALUES($1,$2,$3,$4,$5,$6,'queued',$7,$8) RETURNING *''', uuid4(), who[0], kind, title, content, source, seq,
          [kind, urlsplit(source).hostname] if source else [kind])
        if asset:
            await conn.execute('INSERT INTO capture_assets(owner_id,memory_id,mime,filename,data) VALUES($1,$2,$3,$4,$5)',
                               who[0], row['id'], *asset)
        await conn.execute('INSERT INTO ingestion_jobs(owner_id,memory_id) VALUES($1,$2)', who[0], row['id'])
        await publish(conn, who[0], row, 'upsert')
        await conn.execute('''INSERT INTO idempotency_keys(owner_id,key,route,request_hash,response_status,response_entity_id,expires_at)
          VALUES($1,$2,'/v1/memories',$3,201,$4,clock_timestamp()+interval '24 hours')''', who[0], key, fingerprint, row['id'])
        return memory(row)


@router.post('/captures', status_code=201)
async def save_link(body: Link, request: Request, idempotency_key: UUID = Header(), who=Depends(principal)):
    try:
        p = urlsplit(body.url)
        if p.scheme not in ('http','https') or not p.hostname or p.username or p.password or p.port not in (None,80,443) or any(ord(c)<33 for c in body.url) or '\\' in body.url:
            raise ValueError()
    except ValueError:
        raise Problem(422, 'invalid_public_url') from None
    return await store(request, who, idempotency_key, 'url', body.title or p.hostname,
                       body.url, source=body.url)


@router.post('/uploads', status_code=201)
async def upload(request: Request, idempotency_key: UUID = Header(),
                 filename: str = Query(min_length=1, max_length=240), who=Depends(principal)):
    data = await request.body()
    mime = request.headers.get('content-type','').split(';')[0]
    signatures = {'application/pdf': data.startswith(b'%PDF-'), 'image/png': data.startswith(b'\x89PNG\r\n\x1a\n'),
                  'image/jpeg': data.startswith(b'\xff\xd8\xff'),
                  'image/webp': data.startswith(b'RIFF') and data[8:12] == b'WEBP'}
    if not signatures.get(mime) or len(data)>8*1024*1024:
        raise Problem(422, 'unsupported_file')
    kind = 'pdf' if mime == 'application/pdf' else 'image'
    return await store(request, who, idempotency_key, kind, filename, filename, asset=(mime,filename,data))


@router.get('/memories/{memory_id}/asset')
async def asset(memory_id: UUID, request: Request, who=Depends(principal)):
    async with owned(request.app.state.pool, who[0], readonly=True) as conn:
        row = await conn.fetchrow('''SELECT a.* FROM capture_assets a JOIN memories m ON m.id=a.memory_id AND m.owner_id=a.owner_id
          WHERE a.memory_id=$1 AND m.deleted_at IS NULL''', memory_id)
    if row is None:
        raise Problem(404, 'asset_not_found')
    return Response(bytes(row['data']), media_type=row['mime'], headers={'Content-Disposition': 'attachment; filename="recallbox-source"'})


@router.post('/memories/{memory_id}/retry')
async def retry(memory_id: UUID, request: Request, who=Depends(principal)):
    async with writing(request, who) as conn:
        row = await conn.fetchrow('SELECT * FROM memories WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', memory_id)
        if row is None:
            raise Problem(404, 'memory_not_found')
        if row['processing_state'] not in ('failed','metadata_only'):
            raise Problem(409, 'processing_not_retryable')
        await conn.execute("UPDATE ingestion_jobs SET state='queued',attempts=0,available_at=now(),lease_until=NULL,error=NULL WHERE memory_id=$1", memory_id)
        row = await conn.fetchrow("UPDATE memories SET processing_state='queued',processing_error=NULL,version=version+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING *", memory_id)
        await publish(conn, who[0], row, 'upsert')
        return memory(row)
