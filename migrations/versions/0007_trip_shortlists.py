"""Owner-isolated trip shortlists; no addresses, hours or transit invented."""
from alembic import op

revision = '0007_trip_shortlists'
down_revision = '0006_shopping_lists'
branch_labels = None
depends_on = None

def upgrade():
    op.execute("""
    CREATE TABLE trip_shortlists (
      id uuid PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES users(id),
      source_memory_id uuid NOT NULL,
      name varchar(160) NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
      start_date date, end_date date,
      items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(items)='array'
        AND jsonb_array_length(items)<=60 AND octet_length(items::text)<=45000),
      version integer NOT NULL DEFAULT 1 CHECK(version>0),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      deleted_at timestamptz,
      UNIQUE(owner_id,id),
      FOREIGN KEY(owner_id,source_memory_id) REFERENCES memories(owner_id,id),
      CHECK(start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
    );
    CREATE UNIQUE INDEX trip_one_source ON trip_shortlists(owner_id,source_memory_id) WHERE deleted_at IS NULL;
    CREATE INDEX trip_recent ON trip_shortlists(owner_id,updated_at DESC,id DESC) WHERE deleted_at IS NULL;
    ALTER TABLE trip_shortlists ENABLE ROW LEVEL SECURITY;
    ALTER TABLE trip_shortlists FORCE ROW LEVEL SECURITY;
    CREATE POLICY owner_scope ON trip_shortlists TO recallbox_api
      USING(owner_id=nullif(current_setting('app.user_id',true),'')::uuid)
      WITH CHECK(owner_id=nullif(current_setting('app.user_id',true),'')::uuid);
    CREATE POLICY migration_scope ON trip_shortlists TO recallbox_migrator USING(true) WITH CHECK(true);
    GRANT SELECT,INSERT ON trip_shortlists TO recallbox_api;
    GRANT UPDATE(name,start_date,end_date,items,version,updated_at,deleted_at)
      ON trip_shortlists TO recallbox_api;
    """)

def downgrade():
    raise RuntimeError('Trip shortlists are user content. Never drop them as a rollback.')
