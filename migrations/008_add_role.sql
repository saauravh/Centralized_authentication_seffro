USE central_auth;

-- Role of the person behind this identity. The same account may act as several
-- things across applications (a Seffro vendor is a Helppu provider), so this is
-- the *primary* role chosen at registration, not an exhaustive list. Each
-- application maps it onto its own actor model — see config('central-auth.role_map').
ALTER TABLE central_users
    ADD COLUMN role VARCHAR(30) NOT NULL DEFAULT 'user' AFTER status;

-- Rows created before this column existed are plain users.
UPDATE central_users SET role = 'user' WHERE role = '';

ALTER TABLE central_users
    ADD INDEX idx_role (role);

-- login_history gains the event introduced alongside these tables.
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
        'account_locked'
    ) NOT NULL;
