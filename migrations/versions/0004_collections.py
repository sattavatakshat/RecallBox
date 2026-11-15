"""S8 beta: owner-isolated user-created groupings without automatic labeling.

Deletion/removal is soft. Existing saved memories, notes, links, revisions,
and sync messages are not rewritten by this migration.
"""
from alembic import op

revision = '0004_collections'
down_revision = '0003_bookmark_links'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    CREATE TABLE collections (
      id uuid PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES users(id),
      name varchar(80) NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
      version integer NOT NULL DEFAULT 1 CHECK(version>0),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      deleted_at timestamptz,
      UNIQUE(owner_id,id)
    );
    CREATE UNIQUE INDEX collections_active_name ON collections(owner_id, lower(name))
      WHERE deleted_at IS NULL;
    CREATE INDEX collections_recent ON collections(owner_id,created_at DESC,id DESC)
      WHERE deleted_at IS NULL;

    CREATE TABLE collection_items (
      owner_id uuid NOT NULL REFERENCES users(id),
      collection_id uuid NOT NULL,
      memory_id uuid NOT NULL,
      added_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      removed_at timestamptz,
      PRIMARY KEY(owner_id,collection_id,memory_id),
      FOREIGN KEY(owner_id,collection_id) REFERENCES collections(owner_id,id),
      FOREIGN KEY(owner_id,memory_id) REFERENCES memories(owner_id,id)
    );
    CREATE INDEX collection_items_by_memory ON collection_items(owner_id,memory_id)
      WHERE removed_at IS NULL;
    """)
    for table in ('collections', 'collection_items'):
        op.execute(f"""
        ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
        CREATE POLICY owner_scope ON {table} TO recallbox_api
          USING(owner_id=nullif(current_setting('app.user_id',true),'')::uuid)
          WITH CHECK(owner_id=nullif(current_setting('app.user_id',true),'')::uuid);
        CREATE POLICY migration_scope ON {table} TO recallbox_migrator
          USING(true) WITH CHECK(true);
        GRANT SELECT,INSERT ON {table} TO recallbox_api;
        """)
    op.execute("GRANT UPDATE(name,version,updated_at,deleted_at) ON collections TO recallbox_api")
    op.execute("GRANT UPDATE(removed_at,added_at) ON collection_items TO recallbox_api")


def downgrade():
    raise RuntimeError('Never drop saved collections or their membership during rollback')
