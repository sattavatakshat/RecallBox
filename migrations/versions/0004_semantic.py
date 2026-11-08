"""Local sentence vectors and ingestion attempt fencing."""
from alembic import op
revision = '0004_semantic'
down_revision = '0003_capture'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    ALTER TABLE memories ADD COLUMN embedding vector(512);
    ALTER TABLE memories ADD COLUMN embedding_version integer;
    ALTER TABLE ingestion_jobs ADD COLUMN lease_id uuid;
    GRANT UPDATE(embedding,embedding_version) ON memories TO recallbox_api;
    INSERT INTO ingestion_jobs(owner_id,memory_id) SELECT owner_id,id FROM memories WHERE kind='note' AND deleted_at IS NULL;
    """)


def downgrade():
    raise RuntimeError('Use a forward migration to preserve vectors')
