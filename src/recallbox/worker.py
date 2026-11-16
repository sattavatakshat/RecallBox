"""One local processing slot, durable leases/retries. Explicit beta owner allowlist."""
import argparse
import asyncio
import json
import os
import signal
from pathlib import Path
import sys
import tempfile
from uuid import UUID, uuid4
from urllib.parse import urlsplit
from .config import Settings
from .db import connect, owned
from .memories import publish
from .embeddings import embed
from .topics import suggest_topic


async def process(row, asset):
    if row['kind']=='note':
        return {'state':'ready','text':'','error':None}
    with tempfile.TemporaryDirectory(prefix='recallbox-job-') as temp:
        directory = Path(temp).resolve()
        if asset:
            (directory / 'input').write_bytes(bytes(asset))
        repo = Path(__file__).resolve().parents[2]
        python = Path(sys.executable).resolve()
        # Child sees only its input, code/runtime and system libraries. It cannot
        # access private host configuration, database sockets or API loopback ports.
        reads = [directory,repo / 'src',repo / '.venv',python.parents[1],Path('/System'),Path('/usr'),Path('/Library'),Path('/opt/homebrew/opt'),Path('/opt/homebrew/Cellar'),Path('/dev'),Path('/private/etc')]
        profile = '(version 1)(deny default)(allow process-exec)(allow process-fork)(allow process-info* (target self))(allow sysctl-read)(allow mach-lookup)(allow file-read-metadata)'
        profile += '(allow file-read* (literal "/") ' + ' '.join('(subpath '+json.dumps(str(p))+')' for p in reads) + ')'
        profile += '(allow file-write* (subpath '+json.dumps(str(directory))+'))'
        profile += '(allow network-outbound (remote tcp "*:443") (remote tcp "*:80") (remote udp "*:53") (remote tcp "*:53") (literal "/private/var/run/mDNSResponder"))'
        env = {'PATH':'/usr/bin:/bin','PYTHONPATH':str(repo / 'src'),'PYTHONDONTWRITEBYTECODE':'1','TMPDIR':str(directory)}
        child = await asyncio.create_subprocess_exec('/usr/bin/sandbox-exec','-p',profile,str(repo / '.venv/bin/python'),
                    '-m','recallbox.process_capture',row['kind'],row['source_url'] or '',str(directory),
                    env=env,cwd=directory,start_new_session=True,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL)
        try:
            communication = asyncio.create_task(child.communicate())
            started = asyncio.get_running_loop().time()
            while not communication.done():
                await asyncio.wait({communication},timeout=0.5)
                if communication.done():
                    break
                probe = await asyncio.create_subprocess_exec('/bin/ps','-o','rss=','-p',str(child.pid),stdout=asyncio.subprocess.PIPE)
                usage,_ = await probe.communicate()
                if (usage.strip() and int(usage.strip())>262144) or asyncio.get_running_loop().time()-started>65:
                    raise asyncio.TimeoutError()
            output,_ = await communication
        except asyncio.TimeoutError:
            try:
                os.killpg(child.pid,signal.SIGKILL)
            except ProcessLookupError:
                pass
            await communication
            return {'state':'failed','text':'','error':'Processing exceeded the local time limit.'}
        if child.returncode or len(output)>700000:
            return {'state':'failed','text':'','error':'Isolated processor could not complete this capture.'}
        try:
            return json.loads(output)
        except ValueError:
            return {'state':'failed','text':'','error':'Invalid processor response.'}


async def tick(pool, owner):
    async with owned(pool,owner) as conn:
        if not await conn.fetchval("SELECT id FROM users WHERE id=$1 AND status='active' FOR UPDATE",owner):
            return False
        # A crashed last attempt must become visibly retryable after its lease.
        expired = await conn.fetch('''UPDATE ingestion_jobs SET state='failed',error='Processing interrupted. Please retry.'
          WHERE state='processing' AND lease_until<now() AND attempts>=3 RETURNING memory_id''')
        for job in expired:
            row = await conn.fetchrow("UPDATE memories SET processing_state='failed',processing_error='Processing interrupted. Please retry.',version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND deleted_at IS NULL RETURNING *",job['memory_id'])
            if row:
                await publish(conn,owner,row,'upsert')
        job = await conn.fetchrow('''SELECT j.* FROM ingestion_jobs j JOIN memories m ON m.id=j.memory_id AND m.owner_id=j.owner_id
          WHERE m.deleted_at IS NULL AND j.attempts<3 AND ((j.state='queued' AND j.available_at<=now())
          OR (j.state='processing' AND j.lease_until<now())) ORDER BY j.available_at LIMIT 1 FOR UPDATE OF j SKIP LOCKED''')
        if job is None:
            return False
        attempt = job['attempts']+1
        lease_id = uuid4()
        await conn.execute("UPDATE ingestion_jobs SET state='processing',attempts=$2,lease_until=now()+interval '90 seconds',lease_id=$3,updated_at=now() WHERE memory_id=$1",job['memory_id'],attempt,lease_id)
        row = await conn.fetchrow('SELECT * FROM memories WHERE id=$1 FOR UPDATE',job['memory_id'])
        index_only = row['kind']=='note' or row['processing_state'] in ('ready','metadata_only')
        if not index_only:
            row = await conn.fetchrow("UPDATE memories SET processing_state='processing',processing_error=NULL,version=version+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING *",job['memory_id'])
            await publish(conn,owner,row,'upsert')
        asset = await conn.fetchval('SELECT data FROM capture_assets WHERE memory_id=$1',row['id']) if not index_only else None
    result = {'state':row['processing_state'],'text':row['extracted_text'],'error':row['processing_error']} if index_only else await process(row,asset)
    vector = await embed(row['title']+'\n'+row['user_note']+'\n'+result.get('text','')) if result['state']!='failed' else None
    async with owned(pool,owner) as conn:
        await conn.fetchval('SELECT id FROM users WHERE id=$1 FOR UPDATE',owner)
        current = await conn.fetchrow('SELECT * FROM memories WHERE id=$1 FOR UPDATE',row['id'])
        lease = await conn.fetchrow('SELECT * FROM ingestion_jobs WHERE memory_id=$1 FOR UPDATE',row['id'])
        if not current or current['deleted_at'] or lease['state']!='processing' or lease['lease_id']!=lease_id:
            return True
        again = result['state']=='failed' and attempt<3
        state = 'queued' if again else result['state']
        await conn.execute('''UPDATE ingestion_jobs SET state=$2,error=$3,lease_until=NULL,available_at=now()+interval '15 seconds',updated_at=now()
          WHERE memory_id=$1''',row['id'],'queued' if again else ('failed' if state=='failed' else 'done'),result.get('error'))
        if index_only:
            # Notes are source text supplied by the user. Retrying indexing must
            # never replace their manual topic/tags or create speculative labels.
            if current['kind']=='note' or current['processing_state']=='ready':
                suggested, reason = suggest_topic(current['title'],current['user_note']+'\\n'+current['extracted_text'])
            else:
                suggested, reason = None, None
            if (current['suggested_topic'],current['suggested_topic_reason']) != (suggested,reason):
                updated = await conn.fetchrow('''UPDATE memories SET suggested_topic=$2,
                  suggested_topic_reason=$3,version=version+1,updated_at=clock_timestamp()
                  WHERE id=$1 RETURNING *''', row['id'],suggested,reason)
                await publish(conn,owner,updated,'upsert')
            await conn.execute('UPDATE memories SET embedding=$2::vector,embedding_version=$3 WHERE id=$1',
                               row['id'],vector,1 if vector else None)
            print(json.dumps({'event':'memory_indexed','state':state}),flush=True)
            return True
        title = result.get('title') if current['title']==row['title'] and row['kind']=='url' and row['title']==urlsplit(row['source_url']).hostname else None
        suggested, reason = suggest_topic(title or current['title'], result.get('text','')) if state=='ready' else (None,None)
        updated = await conn.fetchrow('''UPDATE memories SET processing_state=$2,processing_error=$3,extracted_text=$4,
          title=$5,suggested_topic=$6,suggested_topic_reason=$7,version=version+1,
          updated_at=clock_timestamp() WHERE id=$1 RETURNING *''',
          row['id'],state,result.get('error'),result.get('text','')[:100000],title or current['title'],suggested,reason)
        await publish(conn,owner,updated,'upsert')
        await conn.execute('UPDATE memories SET embedding=$2::vector,embedding_version=$3 WHERE id=$1',
                           row['id'],vector,1 if vector else None)
    print(json.dumps({'event':'capture_processed','state':state,'attempt':attempt}),flush=True)
    return True


async def run(owners, once):
    pool = await connect(Settings.load().database_url)
    try:
        while True:
            processed = False
            for owner in owners:
                processed = await tick(pool,owner) or processed
            if once:
                return
            await asyncio.sleep(1 if processed else 3)
    finally:
        await pool.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--owner',action='append',type=UUID,required=True,help='Explicit local beta account UUID; repeat for multiple accounts')
    parser.add_argument('--once',action='store_true')
    args = parser.parse_args()
    try:
        asyncio.run(run(args.owner,args.once))
    except KeyboardInterrupt:
        pass


if __name__=='__main__':
    main()
