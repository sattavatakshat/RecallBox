import os
from alembic import context
from sqlalchemy import create_engine, pool

# Migration credentials are never read by the API.
url = os.environ['RECALLBOX_MIGRATION_URL']
if not url.startswith('postgresql+psycopg://recallbox_migrator:'):
    raise ValueError('Dedicated recallbox_migrator PostgreSQL URL required')
if context.is_offline_mode():
    context.configure(url=url, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = create_engine(url, poolclass=pool.NullPool)
    with engine.connect() as conn:
        context.configure(connection=conn)
        with context.begin_transaction():
            context.run_migrations()
