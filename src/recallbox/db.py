from contextlib import asynccontextmanager
from uuid import UUID
import asyncpg


@asynccontextmanager
async def owned(pool: asyncpg.Pool, owner: UUID, *, isolation="read_committed", readonly=False):
    # SET LOCAL is reset on commit/rollback and cannot leak through the pool.
    async with pool.acquire() as conn, conn.transaction(isolation=isolation, readonly=readonly):
        await conn.execute("SELECT set_config('app.user_id', $1, true)", str(owner))
        yield conn


async def connect(url: str):
    pool = await asyncpg.create_pool(url, min_size=1, max_size=3, command_timeout=5,
                                   server_settings={'timezone': 'UTC', 'application_name': 'recallbox'})
    try:
        async with pool.acquire() as conn:
            role = await conn.fetchrow('SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname=current_user')
            if any(role.values()):
                raise RuntimeError('Unsafe runtime database role')
            if await conn.fetchval("SELECT has_schema_privilege(current_user,'public','CREATE') OR pg_has_role(current_user,'recallbox_migrator','MEMBER')"):
                raise RuntimeError('Runtime role has migration privileges')
            if not await conn.fetchval("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='vector')"):
                raise RuntimeError('pgvector must be provisioned')
            if await conn.fetchval('SELECT version_num FROM public.alembic_version') != '0003_bookmark_links':
                raise RuntimeError('Product migration required')
            for table in ('users', 'identities', 'sessions', 'devices', 'memories',
                          'memory_revisions', 'idempotency_keys', 'sync_changes'):
                safe = await conn.fetchval("""SELECT relrowsecurity AND relforcerowsecurity
                    AND pg_get_userbyid(relowner) <> current_user FROM pg_class
                    WHERE oid=to_regclass($1)""", 'public.' + table)
                if not safe:
                    raise RuntimeError('Unsafe ownership boundary')
        return pool
    except BaseException:
        await pool.close()
        raise
