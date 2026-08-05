USE central_auth;

-- Cross-application single sign-on tickets.
--
-- A user logged into one application wants to move to another without typing
-- their password again. This application cannot see the other application's
-- server-side session, and there is no shared cookie, so the identity service
-- mints a short-lived, single-use ticket that the destination application
-- redeems in exchange for a fresh session.
--
-- Only the SHA-256 hash is stored. The raw token is a 32-byte CSPRNG value
-- carried in the redirect URL, so it is safe to persist the hash: reading the
-- database back could not be replayed into an account takeover.
CREATE TABLE IF NOT EXISTS sso_tickets (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    target      VARCHAR(30) NOT NULL,
    token_hash  VARCHAR(64) NOT NULL,
    expires_at  DATETIME NOT NULL,
    used_at     DATETIME NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_token_hash (token_hash),
    INDEX idx_user_id (user_id),
    INDEX idx_target (target),
    INDEX idx_expires (expires_at),
    FOREIGN KEY (user_id) REFERENCES central_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

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
        'tokens_revoked',
        'account_locked',
        'sso_ticket_issued',
        'sso_redeem'
    ) NOT NULL;
