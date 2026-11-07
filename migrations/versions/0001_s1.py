"""S1 identity and rotating sessions only. pgvector provisioned by administrator."""
from alembic import op
revision = '0001_s1'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='vector') THEN
        RAISE EXCEPTION 'Administrator must enable pgvector before migrating';
      END IF;
    END $$;
    CREATE TABLE users (
      id uuid PRIMARY KEY, status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','deleting','deleted')),
      display_name varchar(120), created_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz, sync_sequence bigint NOT NULL DEFAULT 0 CHECK(sync_sequence>=0)
    );
    CREATE TABLE identities (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id),
      issuer varchar(2048) NOT NULL, subject varchar(255) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(issuer,subject), UNIQUE(owner_id,id)
    );
    CREATE TABLE devices (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id),
      client_device_id uuid NOT NULL, platform text NOT NULL CHECK(platform IN ('ios','android')),
      last_seen_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
      UNIQUE(owner_id,client_device_id), UNIQUE(owner_id,id)
    );
    CREATE TABLE sessions (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id),
      family_id uuid NOT NULL, device_id uuid,
      refresh_hash char(64) NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL, revoked_at timestamptz,
      replaced_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(owner_id,id),
      FOREIGN KEY(owner_id,device_id) REFERENCES devices(owner_id,id),
      FOREIGN KEY(owner_id,replaced_by) REFERENCES sessions(owner_id,id),
      CHECK(expires_at>created_at)
    );
    CREATE INDEX identities_owner ON identities(owner_id);
    CREATE INDEX sessions_family ON sessions(owner_id,family_id);
    CREATE INDEX sessions_expiry ON sessions(expires_at);
    """)
    for table in ('users', 'identities', 'devices', 'sessions'):
        column = 'id' if table == 'users' else 'owner_id'
        op.execute(f"""
        ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
        CREATE POLICY owner_scope ON {table} TO recallbox_api
          USING ({column}=nullif(current_setting('app.user_id',true),'')::uuid)
          WITH CHECK ({column}=nullif(current_setting('app.user_id',true),'')::uuid);
        CREATE POLICY identity_bootstrap ON {table} TO recallbox_migrator
          USING (true) WITH CHECK (true);
        """)
    op.execute("""
    GRANT SELECT ON users, identities TO recallbox_api;
    GRANT UPDATE(sync_sequence) ON users TO recallbox_api;
    GRANT SELECT, INSERT, UPDATE ON devices, sessions TO recallbox_api;
    GRANT SELECT ON alembic_version TO recallbox_api;
    -- Narrow bootstrap functions: fixed search_path, no dynamic SQL, no public EXECUTE.
    -- Only trusted API code invokes identity resolution AFTER provider verification.
    CREATE FUNCTION resolve_identity(p_issuer text, p_subject text, p_owner uuid, p_identity uuid)
    RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    DECLARE result uuid;
    BEGIN
      PERFORM pg_advisory_xact_lock(hashtextextended(p_issuer || chr(31) || p_subject,0));
      SELECT owner_id INTO result FROM public.identities WHERE issuer=p_issuer AND subject=p_subject;
      IF result IS NULL THEN
        INSERT INTO public.users(id) VALUES(p_owner);
        INSERT INTO public.identities(id,owner_id,issuer,subject)
          VALUES(p_identity,p_owner,p_issuer,p_subject);
        result := p_owner;
      END IF;
      RETURN result;
    END $$;
    CREATE FUNCTION refresh_owner(p_hash text) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
      SELECT owner_id FROM public.sessions WHERE refresh_hash=p_hash
    $$;
    REVOKE ALL ON FUNCTION resolve_identity(text,text,uuid,uuid), refresh_owner(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION resolve_identity(text,text,uuid,uuid), refresh_owner(text) TO recallbox_api;
    """)


def downgrade():
    raise RuntimeError('Destructive identity downgrade forbidden; restore a reviewed backup instead')
