"""Allow saved URL bookmarks in the same owner-isolated memory lifecycle.

No URL is fetched or previewed by the API. The exact user-provided HTTP(S)
address is stored as user_note; kind tells the client this is a bookmark.
This additive migration retains existing notes, revisions, events and keys.
"""
from alembic import op

revision = '0003_bookmark_links'
# Integrate bookmarks after the existing capture/semantic lineage so both survive.
down_revision = '0004_semantic'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE memories DROP CONSTRAINT memories_kind_check")
    op.execute("""ALTER TABLE memories ADD CONSTRAINT memories_kind_check
               CHECK (kind IN ('note', 'link', 'url', 'image', 'pdf'))""")


def downgrade():
    raise RuntimeError('Do not silently remove user URL bookmarks during rollback')
