import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'central_auth',
  },

  jwt: {
    issuer: process.env.JWT_ISSUER || 'seffro-identity',
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL || '900', 10),
    refreshTtl: parseInt(process.env.JWT_REFRESH_TTL || '604800', 10),
    // Directory holding active.key plus the named key pairs. Falls back to the
    // single-pair paths below when active.key is absent.
    keysDir: process.env.JWT_KEYS_DIR || './keys',
    privateKeyPath: process.env.JWT_PRIVATE_KEY_PATH || './keys/private.pem',
    publicKeyPath: process.env.JWT_PUBLIC_KEY_PATH || './keys/public.pem',
    privateKey: '',
    publicKey: '',
  },

  // Single-use tokens emailed to the user. Short TTLs: these arrive out of band
  // and are the weakest link in the account-recovery chain.
  tokens: {
    resetTtl: parseInt(process.env.RESET_TOKEN_TTL || '3600', 10),
    verifyTtl: parseInt(process.env.VERIFY_TOKEN_TTL || '86400', 10),
    // SSO tickets ride in a redirect URL and are single-use, so they live for
    // barely a minute — long enough for the browser to land, short enough that a
    // captured link is worthless.
    ssoTtl: parseInt(process.env.SSO_TOKEN_TTL || '60', 10),
  },

  // When true, an unverified account cannot obtain a session at all. Registration
  // never issues one either way — this governs whether login is also refused.
  requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === 'true',

  // Account lockout. Complements the in-memory rate limiter: that one throttles
  // a burst, this one survives a restart and follows the account rather than the
  // request source, so a distributed attempt is still caught.
  lockout: {
    threshold: parseInt(process.env.LOCKOUT_THRESHOLD || '10', 10),
    durationSeconds: parseInt(process.env.LOCKOUT_DURATION || '900', 10),
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'noreply@seffro.com',
  },

  // Where emailed links point. These are pages in the consumer apps, not here —
  // the identity service has no user-facing UI in this architecture.
  links: {
    resetUrl: process.env.PASSWORD_RESET_URL || 'http://localhost:8000/central/password/reset',
    verifyUrl: process.env.EMAIL_VERIFY_URL || 'http://localhost:8000/central/email/verify',
  },

  // Shared secret the Laravel apps present on every call. This API can mint
  // tokens for any account, so it must never be reachable unauthenticated.
  serviceSecret: process.env.SERVICE_SECRET || '',

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
};
