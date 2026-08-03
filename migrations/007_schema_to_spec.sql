USE central_auth;

-- ---------------------------------------------------------------------------
-- central_users
-- ---------------------------------------------------------------------------

-- Public identifier. Sequential ids leak user counts and are guessable in URLs;
-- applications should reference the uuid anywhere a value is exposed outside the
-- server-to-server channel. The integer id stays as the internal foreign key.
ALTER TABLE central_users
    ADD COLUMN uuid CHAR(36) NULL AFTER id;

UPDATE central_users SET uuid = UUID() WHERE uuid IS NULL;

ALTER TABLE central_users
    MODIFY COLUMN uuid CHAR(36) NOT NULL,
    ADD UNIQUE KEY uq_uuid (uuid);

ALTER TABLE central_users
    ADD COLUMN avatar VARCHAR(500) NULL AFTER last_name;

-- A timestamp rather than a flag: "when was this verified" is an audit question
-- that comes up constantly, and the boolean is derivable from it.
ALTER TABLE central_users
    ADD COLUMN email_verified_at DATETIME NULL AFTER avatar;

UPDATE central_users SET email_verified_at = COALESCE(updated_at, NOW()) WHERE email_verified = 1;

ALTER TABLE central_users
    DROP COLUMN email_verified;

-- Account lockout after repeated failures. Counted here rather than in the
-- in-memory rate limiter so a lockout survives a restart and is visible to
-- support staff.
ALTER TABLE central_users
    ADD COLUMN failed_login_attempts INT UNSIGNED NOT NULL DEFAULT 0 AFTER status,
    ADD COLUMN locked_until DATETIME NULL AFTER failed_login_attempts;

-- ---------------------------------------------------------------------------
-- refresh_tokens
-- ---------------------------------------------------------------------------

ALTER TABLE refresh_tokens
    CHANGE COLUMN device device_name VARCHAR(255) NULL,
    ADD COLUMN ip_address VARCHAR(45) NULL AFTER device_name;

-- revoked_at carries when as well as whether, which the audit trail needs.
ALTER TABLE refresh_tokens
    ADD COLUMN revoked_at DATETIME NULL AFTER expires_at;

UPDATE refresh_tokens SET revoked_at = NOW() WHERE revoked = 1;

ALTER TABLE refresh_tokens
    DROP COLUMN revoked;

-- ---------------------------------------------------------------------------
-- login_history
-- ---------------------------------------------------------------------------

ALTER TABLE login_history
    ADD COLUMN device VARCHAR(255) NULL AFTER ip_address,
    ADD COLUMN browser VARCHAR(255) NULL AFTER device;

-- ---------------------------------------------------------------------------
-- service_clients
-- ---------------------------------------------------------------------------

ALTER TABLE service_clients
    CHANGE COLUMN name client_name VARCHAR(100) NOT NULL,
    CHANGE COLUMN secret_hash client_secret_hash VARCHAR(64) NOT NULL;

-- Recorded per client so a leaked secret is only usable from the expected
-- network location. NULL means unrestricted.
ALTER TABLE service_clients
    ADD COLUMN allowed_origin VARCHAR(255) NULL AFTER client_secret_hash;

ALTER TABLE service_clients
    ADD COLUMN status ENUM('active', 'disabled') NOT NULL DEFAULT 'active' AFTER allowed_origin;

UPDATE service_clients SET status = IF(active = 1, 'active', 'disabled');

ALTER TABLE service_clients
    DROP COLUMN active;
