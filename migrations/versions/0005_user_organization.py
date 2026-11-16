"""Persist intentional, owner-scoped organization choices.

Manual topic/tags live apart from source-derived labels. An ingestion retry may
refresh evidence, but it must never replace a person's corrections.
"""
from alembic import op

revision = '0005_user_organization'
down_revision = '0004_collections'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    ALTER TABLE memories ADD COLUMN topic_override varchar(48);
    ALTER TABLE memories ADD COLUMN tags_override text[];
    ALTER TABLE memories ADD COLUMN suggested_topic varchar(48);
    ALTER TABLE memories ADD COLUMN suggested_topic_reason varchar(140);
    ALTER TABLE memories ADD CONSTRAINT memory_topic_override_valid
      CHECK (topic_override IS NULL OR length(trim(topic_override)) BETWEEN 1 AND 48);
    ALTER TABLE memories ADD CONSTRAINT memory_tags_override_valid
      CHECK (tags_override IS NULL OR cardinality(tags_override) <= 12);
    GRANT UPDATE(topic_override, tags_override, suggested_topic, suggested_topic_reason)
      ON memories TO recallbox_api;
    """)


def downgrade():
    raise RuntimeError('User organization preferences must not be dropped on rollback')
