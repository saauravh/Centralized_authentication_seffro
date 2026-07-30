CREATE DATABASE IF NOT EXISTS central_auth CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE central_auth;

-- Core users table (only identity data, no roles/permissions)
CREATE TABLE IF NOT EXISTS central_users (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    phone           VARCHAR(20) NULL,
    password        VARCHAR(255) NOT NULL,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    email_verified  TINYINT(1) NOT NULL DEFAULT 0,
    status          ENUM('active', 'suspended', 'banned') NOT NULL DEFAULT 'active',
    last_login_at   DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- Refresh tokens for JWT refresh flow
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    token_hash  VARCHAR(64) NOT NULL,
    device      VARCHAR(255) NULL,
    expires_at  DATETIME NOT NULL,
    revoked     TINYINT(1) NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_token_hash (token_hash),
    INDEX idx_user_id (user_id),
    INDEX idx_expires (expires_at),
    FOREIGN KEY (user_id) REFERENCES central_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- User sessions (for OAuth authorization page SSO cookie)
CREATE TABLE IF NOT EXISTS sessions (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED NOT NULL,
    session_token   VARCHAR(64) NOT NULL UNIQUE,
    ip_address      VARCHAR(45) NULL,
    user_agent      VARCHAR(500) NULL,
    last_activity   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at      DATETIME NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_session_token (session_token),
    FOREIGN KEY (user_id) REFERENCES central_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- OAuth 2.1 clients (seffro, hellpu, provider, etc.)
CREATE TABLE IF NOT EXISTS oauth_clients (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    client_id       VARCHAR(100) NOT NULL UNIQUE,
    client_secret   VARCHAR(255) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    redirect_uris   JSON NOT NULL,
    allowed_scopes  JSON NULL,
    user_id         INT UNSIGNED NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_client_id (client_id),
    FOREIGN KEY (user_id) REFERENCES central_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- OAuth authorization codes (short-lived, for PKCE flow)
CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code                    VARCHAR(36) NOT NULL UNIQUE,
    client_id               VARCHAR(100) NOT NULL,
    user_id                 INT UNSIGNED NOT NULL,
    redirect_uri            VARCHAR(500) NULL,
    code_challenge          VARCHAR(128) NULL,
    code_challenge_method   VARCHAR(10) NULL,
    scopes                  JSON NULL,
    expires_at              DATETIME NOT NULL,
    used                    TINYINT(1) NOT NULL DEFAULT 0,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_code (code),
    INDEX idx_client_code (client_id, code),
    FOREIGN KEY (user_id) REFERENCES central_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Login history for audit
CREATE TABLE IF NOT EXISTS login_history (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    event       ENUM('login', 'login_failed', 'logout', 'refresh', 'password_change') NOT NULL,
    ip_address  VARCHAR(45) NULL,
    user_agent  VARCHAR(500) NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_event (event),
    INDEX idx_created (created_at),
    FOREIGN KEY (user_id) REFERENCES central_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
