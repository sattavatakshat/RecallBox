"""Durable, account-isolated reminders; no background notification claim."""
from alembic import op

revision = '0009_reminders'
down_revision = '0008_learning_queue'
branch_labels = None
depends_on = None

def upgrade():
    op.execute("""
    CREATE TABLE reminders (
      id uuid PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES users(id),
      source_memory_id uuid NOT NULL,
      request_key uuid NOT NULL,
      due_at timestamptz NOT NULL,
      time_zone varchar(64) NOT NULL,
      status varchar(16) NOT NULL DEFAULT 'scheduled'
        CHECK(status IN ('scheduled','completed')),
      version integer NOT NULL DEFAULT 1 CHECK(version>0),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      deleted_at timestamptz,
      UNIQUE(owner_id,id),
      UNIQUE(owner_id,request_key),
      FOREIGN KEY(owner_id,source_memory_id) REFERENCES memories(owner_id,id)
    );
    CREATE INDEX reminders_upcoming ON reminders(owner_id,status,due_at,id)
      WHERE deleted_at IS NULL;
    ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
    ALTER TABLE reminders FORCE ROW LEVEL SECURITY;
    CREATE POLICY owner_scope ON reminders TO recallbox_api
      USING(owner_id=nullif(current_setting('app.user_id',true),'')::uuid)
      WITH CHECK(owner_id=nullif(current_setting('app.user_id',true),'')::uuid);
    CREATE POLICY migration_scope ON reminders TO recallbox_migrator
      USING(true) WITH CHECK(true);
    GRANT SELECT,INSERT ON reminders TO recallbox_api;
    GRANT UPDATE(status,version,updated_at,deleted_at) ON reminders TO recallbox_api;
    """)

def downgrade():
    raise RuntimeError('Reminders are user content. Never drop them as a rollback.')
