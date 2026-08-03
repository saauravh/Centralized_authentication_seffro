USE central_auth;

-- 004 dropped these, but the migration runner used to re-apply 001 on every run,
-- and 001 recreates them with CREATE TABLE IF NOT EXISTS. The runner now puts
-- every file through the applied/skipped ledger, so this drop is the last one
-- needed. Kept as its own migration rather than editing 001, which has already
-- been applied everywhere.

DROP TABLE IF EXISTS oauth_authorization_codes;
DROP TABLE IF EXISTS oauth_clients;
DROP TABLE IF EXISTS sessions;
