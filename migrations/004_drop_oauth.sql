USE central_auth;

-- The service is headless: it has no hosted login page, no authorization
-- endpoint and no browser session of its own. Applications call it directly and
-- keep their own sessions, so nothing below has a consumer any more.

DROP TABLE IF EXISTS oauth_authorization_codes;
DROP TABLE IF EXISTS oauth_clients;

-- Backed the SSO cookie for the removed authorization page.
DROP TABLE IF EXISTS sessions;
