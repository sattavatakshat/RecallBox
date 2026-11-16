"""Durable, owner-isolated shopping checklists from confirmed recipe evidence."""
from alembic import op

revision = '0006_shopping_lists'
down_revision = '0005_user_organization'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    CREATE TABLE shopping_lists (
      id uuid PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES users(id),
      source_memory_id uuid NOT NULL,
      title varchar(160) NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
      items jsonb NOT NULL CHECK(jsonb_typeof(items)='array'
        AND jsonb_array_length(items) <= 60 AND octet_length(items::text) <= 40000),
      version integer NOT NULL DEFAULT 1 CHECK(version>0),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      deleted_at timestamptz,
      UNIQUE(owner_id,id),
      FOREIGN KEY(owner_id,source_memory_id) REFERENCES memories(owner_id,id)
    );
    CREATE UNIQUE INDEX shopping_lists_one_active ON shopping_lists(owner_id,source_memory_id)
      WHERE deleted_at IS NULL;
    CREATE INDEX shopping_lists_recent ON shopping_lists(owner_id,updated_at DESC,id DESC)
      WHERE deleted_at IS NULL;

    ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;
    ALTER TABLE shopping_lists FORCE ROW LEVEL SECURITY;
    CREATE POLICY owner_scope ON shopping_lists TO recallbox_api
      USING(owner_id=nullif(current_setting('app.user_id',true),'')::uuid)
      WITH CHECK(owner_id=nullif(current_setting('app.user_id',true),'')::uuid);
    CREATE POLICY migration_scope ON shopping_lists TO recallbox_migrator
      USING(true) WITH CHECK(true);
    GRANT SELECT,INSERT ON shopping_lists TO recallbox_api;
    GRANT UPDATE(title,items,version,updated_at,deleted_at) ON shopping_lists TO recallbox_api;
    """)


def downgrade():
    raise RuntimeError('Shopping lists are user data and cannot be dropped on rollback')
