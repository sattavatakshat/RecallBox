"""Owner-scoped, reorderable learning queue with source provenance."""
from alembic import op

revision = '0008_learning_queue'
down_revision = '0007_trip_shortlists'
branch_labels = None
depends_on = None

def upgrade():
    op.execute("""
    CREATE TABLE learning_items (
      id uuid PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES users(id),
      source_memory_id uuid NOT NULL,
      status varchar(16) NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('not_started', 'in_progress', 'completed')),
      sort_order bigint NOT NULL CHECK(sort_order > 0),
      version integer NOT NULL DEFAULT 1 CHECK(version > 0),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      deleted_at timestamptz,
      UNIQUE(owner_id,id),
      FOREIGN KEY(owner_id,source_memory_id) REFERENCES memories(owner_id,id)
    );
    CREATE UNIQUE INDEX learning_one_source ON learning_items(owner_id, source_memory_id) WHERE deleted_at IS NULL;
    CREATE INDEX learning_sort ON learning_items(owner_id,sort_order,id) WHERE deleted_at IS NULL;
    ALTER TABLE learning_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE learning_items FORCE ROW LEVEL SECURITY;
    CREATE POLICY owner_scope ON learning_items TO recallbox_api
      USING(owner_id=nullif(current_setting('app.user_id',true),'')::uuid)
      WITH CHECK(owner_id=nullif(current_setting('app.user_id',true),'')::uuid);
    CREATE POLICY migration_scope ON learning_items TO recallbox_migrator USING(true) WITH CHECK(true);
    GRANT SELECT,INSERT ON learning_items TO recallbox_api;
    GRANT UPDATE(status,sort_order,version,updated_at,deleted_at) ON learning_items TO recallbox_api;
    """)

def downgrade():
    raise RuntimeError('Learning queue is user content. Never drop it as a rollback.')
