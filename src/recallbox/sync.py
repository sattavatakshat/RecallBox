"""Current-state delta sync, replayable by sequence; no content in tombstones."""
from fastapi import APIRouter, Depends, Query, Request
from .auth import principal
from .cursors import decode, encode
from .db import owned
from .memories import memory, summary_columns
from .problems import Problem

router = APIRouter(prefix='/v1')


@router.get('/sync')
async def sync(request: Request, cursor: str | None = Query(default=None, max_length=4096),
               limit: int = Query(default=20, ge=1, le=50), who=Depends(principal)):
    owner = who[0]
    async with owned(request.app.state.pool, owner, isolation='repeatable_read', readonly=True) as conn:
        user = await conn.fetchrow('SELECT sync_sequence,sync_epoch,sync_floor FROM users WHERE id=$1', owner)
        after, high = 0, user['sync_sequence']
        if cursor:
            state = decode(request.app.state.settings, cursor, owner, user['sync_epoch'], 'sync')
            try:
                after, high = state['after'], state.get('until', high)
                if type(after) is not int or type(high) is not int or not 0 <= after <= high <= user['sync_sequence']:
                    raise ValueError()
            except (KeyError, TypeError, ValueError):
                raise Problem(400, 'invalid_cursor') from None
        if after < user['sync_floor']:
            raise Problem(410, 'cursor_expired')
        changes = await conn.fetch('''SELECT sequence,entity_id FROM sync_changes WHERE owner_id=$1
            AND sequence>$2 AND sequence<=$3 ORDER BY sequence LIMIT $4''', owner, after, high, limit+1)
        page = changes[:limit]
        entities = await conn.fetch(f'''SELECT {summary_columns()},deleted_at FROM memories
            WHERE id=ANY($1::uuid[])''', [row['entity_id'] for row in page])
        by_id = {row['id']: row for row in entities}
        items = []
        for change in page:
            row = by_id[change['entity_id']]
            if row['deleted_at'] is not None:
                item = {'operation': 'delete', 'id': str(row['id']), 'version': row['version']}
            else:
                item = {'operation': 'upsert', 'memory': memory(row, detail=False)}
            items.append({'sequence': str(change['sequence']), **item})
        more = len(changes) > limit
        state = {'after': page[-1]['sequence'], 'until': high} if more else {'after': high}
        return {'changes': items, 'has_more': more,
                'next_cursor': encode(request.app.state.settings, owner, user['sync_epoch'], 'sync', **state)}
