"""Owned notes, immutable revisions, durable retries and commit-ordered sync."""
from alembic import op

revision = '0002_memories'
down_revision = '0001_s1'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    ALTER TABLE users ADD COLUMN sync_epoch uuid NOT NULL DEFAULT gen_random_uuid();
    ALTER TABLE users ADD COLUMN sync_floor bigint NOT NULL DEFAULT 0
      CHECK(sync_floor>=0 AND sync_floor<=sync_sequence);
    CREATE TABLE memories (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id),
      kind text NOT NULL DEFAULT 'note' CHECK(kind='note'),
      title varchar(240) NOT NULL DEFAULT '',
      user_note text NOT NULL CHECK(char_length(user_note) BETWEEN 1 AND 100000),
      version integer NOT NULL DEFAULT 1 CHECK(version>0),
      created_sequence bigint NOT NULL CHECK(created_sequence>0),
      starred boolean NOT NULL DEFAULT false, archived boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), deleted_at timestamptz,
      UNIQUE(owner_id,id)
    );
    CREATE TABLE memory_revisions (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), memory_id uuid NOT NULL,
      entity_version integer NOT NULL CHECK(entity_version>0),
      mutation_kind text NOT NULL CHECK(mutation_kind IN ('create','update','delete')),
      payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=700000),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      UNIQUE(owner_id,memory_id,entity_version),
      FOREIGN KEY(owner_id,memory_id) REFERENCES memories(owner_id,id)
    );
    CREATE TABLE idempotency_keys (
      owner_id uuid NOT NULL REFERENCES users(id), key uuid NOT NULL,
      route text NOT NULL CHECK(route='/v1/memories'), request_hash char(64) NOT NULL,
      response_status smallint NOT NULL CHECK(response_status=201), response_entity_id uuid NOT NULL,
      expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY(owner_id,route,key),
      FOREIGN KEY(owner_id,response_entity_id) REFERENCES memories(owner_id,id),
      CHECK(expires_at>created_at)
    );
    CREATE TABLE sync_changes (
      owner_id uuid NOT NULL REFERENCES users(id), sequence bigint NOT NULL CHECK(sequence>0),
      entity_kind text NOT NULL DEFAULT 'memory' CHECK(entity_kind='memory'), entity_id uuid NOT NULL,
      version integer NOT NULL CHECK(version>0), operation text NOT NULL CHECK(operation IN ('upsert','delete')),
      changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY(owner_id,sequence),
      FOREIGN KEY(owner_id,entity_id,version) REFERENCES memory_revisions(owner_id,memory_id,entity_version)
    );
    CREATE INDEX memories_recent ON memories(owner_id,archived,created_at DESC,id DESC) WHERE deleted_at IS NULL;
    CREATE INDEX memories_starred ON memories(owner_id,created_at DESC,id DESC) WHERE starred AND deleted_at IS NULL;
    CREATE INDEX idempotency_expiry ON idempotency_keys(expires_at);
    CREATE INDEX sync_retention ON sync_changes(owner_id,changed_at,sequence);
    """)
    for table in ('memories', 'memory_revisions', 'idempotency_keys', 'sync_changes'):
        op.execute(f"""
        ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
        CREATE POLICY owner_scope ON {table} TO recallbox_api
          USING(owner_id=nullif(current_setting('app.user_id',true),'')::uuid)
          WITH CHECK(owner_id=nullif(current_setting('app.user_id',true),'')::uuid);
        CREATE POLICY migration_scope ON {table} TO recallbox_migrator USING(true) WITH CHECK(true);
        GRANT SELECT,INSERT ON {table} TO recallbox_api;
        """)
    op.execute('GRANT UPDATE(title,user_note,version,starred,archived,updated_at,deleted_at) ON memories TO recallbox_api')


def downgrade():
    raise RuntimeError('Do not drop user memories to roll back code; use a reviewed recovery plan')
