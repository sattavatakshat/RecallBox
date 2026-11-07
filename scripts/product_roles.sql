-- Run only as database administrator against a NEW dedicated recallbox database.
-- Passwords intentionally absent: use psql \password interactively, never Git/argv.
CREATE ROLE recallbox_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE recallbox_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
REVOKE ALL ON DATABASE recallbox FROM PUBLIC;
GRANT CONNECT ON DATABASE recallbox TO recallbox_migrator, recallbox_api;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO recallbox_migrator;
GRANT USAGE ON SCHEMA public TO recallbox_api;
-- pgvector must already be installed on the host. Administrator enables it because
-- CREATE EXTENSION vector normally requires superuser. No elevated API privilege.
CREATE EXTENSION IF NOT EXISTS vector;
