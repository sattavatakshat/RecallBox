"""Durable private captures and leased ingestion jobs."""
from alembic import op

revision = '0003_capture'
down_revision = '0002_memories'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    ALTER TABLE memories DROP CONSTRAINT memories_kind_check;
    ALTER TABLE memories ADD CHECK(kind IN ('note','url','image','pdf'));
    ALTER TABLE memories ADD COLUMN source_url text;
    ALTER TABLE memories ADD COLUMN extracted_text text NOT NULL DEFAULT '' CHECK(char_length(extracted_text)<=100000);
    ALTER TABLE memories ADD COLUMN processing_state text NOT NULL DEFAULT 'ready'
      CHECK(processing_state IN ('queued','processing','ready','metadata_only','failed'));
    ALTER TABLE memories ADD COLUMN processing_error text;
    ALTER TABLE memories ADD COLUMN labels text[] NOT NULL DEFAULT '{}';
    ALTER TABLE memories ADD COLUMN collection varchar(80) NOT NULL DEFAULT '';
    CREATE INDEX memories_search ON memories USING gin(to_tsvector('english',title || ' ' || user_note || ' ' || extracted_text)) WHERE deleted_at IS NULL;
    CREATE TABLE capture_assets (
      owner_id uuid NOT NULL, memory_id uuid NOT NULL, mime text NOT NULL,
      filename varchar(240) NOT NULL, data bytea NOT NULL CHECK(octet_length(data) BETWEEN 1 AND 8388608),
      PRIMARY KEY(owner_id,memory_id), FOREIGN KEY(owner_id,memory_id) REFERENCES memories(owner_id,id)
    );
    CREATE TABLE ingestion_jobs (
      owner_id uuid NOT NULL, memory_id uuid NOT NULL, attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
      state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','processing','done','failed')),
      available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz,
      error text, updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(owner_id,memory_id), FOREIGN KEY(owner_id,memory_id) REFERENCES memories(owner_id,id)
    );
    CREATE INDEX ingestion_due ON ingestion_jobs(owner_id,state,available_at);
    GRANT UPDATE(extracted_text,processing_state,processing_error,labels,collection) ON memories TO recallbox_api;
    GRANT UPDATE ON ingestion_jobs TO recallbox_api;
    """)
    for table in ('capture_assets', 'ingestion_jobs'):
        op.execute(f"""
        ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
        CREATE POLICY owner_scope ON {table} TO recallbox_api
          USING(owner_id=nullif(current_setting('app.user_id',true),'')::uuid)
          WITH CHECK(owner_id=nullif(current_setting('app.user_id',true),'')::uuid);
        CREATE POLICY migration_scope ON {table} TO recallbox_migrator USING(true) WITH CHECK(true);
        GRANT SELECT,INSERT ON {table} TO recallbox_api;
        """)


def downgrade():
    raise RuntimeError('Capture data must not be dropped during rollback')
