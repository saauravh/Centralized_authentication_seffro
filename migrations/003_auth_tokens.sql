USE central_auth;

-- Password reset tokens. Only the SHA-256 hash is stored, never the raw token.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    token_hash  VARCHAR(64) NOT NULL,
    expires_at  DATETIME NOT NULL,
    used_at     DATETIME NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_token_hash (token_hash),
    INDEX idx_user_id (user_id),
    INDEX idx_expires (expires_at),
    FOREIGN KEY (user_id) REFERENCES central_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Email verification tokens. Same hashing rule as above.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    token_hash  VARCHAR(64) NOT NULL,
    expires_at  DATETIME NOT NULL,
    used_at     DATETIME NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_token_hash (token_hash),
    INDEX idx_user_id (user_id),
    INDEX idx_expires (expires_at),
    FOREIGN KEY (user_id) REFERENCES central_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- login_history.event needs values for the flows added alongside these tables.
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
        'email_verified'
    ) NOT NULL;

-- IP address is recorded for reset/verification requests too, so allow NULL user agents
-- and index the pair used by the abuse queries.
ALTER TABLE login_history
    ADD INDEX idx_user_event_created (user_id, event, created_at);
