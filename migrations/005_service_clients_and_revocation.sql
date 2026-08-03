USE central_auth;

-- Per-application credentials, replacing the single shared SERVICE_SECRET.
-- One app's secret can now be rotated or disabled without touching the others,
-- and login_history can attribute an action to the application that caused it.
CREATE TABLE IF NOT EXISTS service_clients (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(100) NOT NULL UNIQUE,
    secret_hash  VARCHAR(64) NOT NULL,
    active       TINYINT(1) NOT NULL DEFAULT 1,
    last_used_at DATETIME NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_secret_hash (secret_hash),
    INDEX idx_active (active)
) ENGINE=InnoDB;

-- Access tokens are self-contained, so nothing stops a stolen or post-logout
-- token being replayed until it expires. This is the deny list consulted by
-- /validate-token; rows are purged once the token's own exp has passed.
CREATE TABLE IF NOT EXISTS revoked_tokens (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    jti         VARCHAR(36) NOT NULL,
    user_id     INT UNSIGNED NOT NULL,
    expires_at  DATETIME NOT NULL,
    revoked_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_jti (jti),
    INDEX idx_user_id (user_id),
    INDEX idx_expires (expires_at),
    FOREIGN KEY (user_id) REFERENCES central_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Revoking every token a user holds (ban, password reset) can't enumerate jtis
-- it has never seen, so a per-user cutoff covers them in one row: any token
-- issued before this instant is refused.
ALTER TABLE central_users
    ADD COLUMN tokens_valid_from DATETIME NULL AFTER status;

-- login_history gains the events introduced alongside these tables.
ALTER TABLE login_history
    MODIFY COLUMN event ENUM(
        'login',
        'login_failed',
        'logout',
        'refresh',
        'password_change',
        'password_reset',
        'password_reset_requested',
        'register',
        'email_verified',
        'profile_updated',
        'email_changed',
        'tokens_revoked'
    ) NOT NULL;
