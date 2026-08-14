import { query, queryOne } from '../config/database';
import crypto from 'crypto';

export type TokenPurpose = 'password_reset' | 'email_verification';

const TABLES: Record<TokenPurpose, string> = {
  password_reset: 'password_reset_tokens',
  email_verification: 'email_verification_tokens',
};

export interface IssuedToken {
  /** Raw token — emailed to the user, never persisted. */
  token: string;
  expiresAt: Date;
}

interface StoredToken {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
}

/**
 * Single-use, expiring tokens for password reset and email verification.
 *
 * Only the SHA-256 hash is stored, so a database read cannot be replayed into an
 * account takeover. SHA-256 (rather than bcrypt) is deliberate: the raw token is
 * 32 bytes of CSPRNG output, so there is no low-entropy secret to slow down
 * guessing, and reset/verify are hot paths.
 */
export class AuthTokenRepository {
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Issues a token, invalidating any outstanding ones for the same user and
   * purpose so a fresh request always supersedes older emails.
   */
  async issue(purpose: TokenPurpose, userId: number, ttlSeconds: number): Promise<IssuedToken> {
    return this.issueWithToken(purpose, userId, ttlSeconds, crypto.randomBytes(32).toString('hex'));
  }

  /**
   * Same as issue(), but with a short numeric code instead of a 256-bit hex
   * string — for tokens a person types in by hand (e.g. an emailed
   * verification code) rather than ones carried in a link.
   *
   * Lower entropy is fine here: the redeem rate limiter caps guesses per
   * account, and the short TTL these are issued with closes the window long
   * before that limit could exhaust a 6-digit keyspace.
   */
  async issueOtp(
    purpose: TokenPurpose,
    userId: number,
    ttlSeconds: number,
    digits = 6
  ): Promise<IssuedToken> {
    const code = crypto.randomInt(0, 10 ** digits).toString().padStart(digits, '0');
    return this.issueWithToken(purpose, userId, ttlSeconds, code);
  }

  private async issueWithToken(
    purpose: TokenPurpose,
    userId: number,
    ttlSeconds: number,
    token: string
  ): Promise<IssuedToken> {
    const table = TABLES[purpose];
    await query(`UPDATE ${table} SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL`, [
      userId,
    ]);

    await query(
      `INSERT INTO ${table} (user_id, token_hash, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
      [userId, this.hashToken(token), ttlSeconds]
    );

    return { token, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  }

  /**
   * Looks up a redeemable token without spending it, returning the user id it
   * was issued to, or null if unknown, expired, or already used.
   *
   * Callers validate against this before calling consume(). Doing it the other
   * way round would let a request that fails a later check still burn the user's
   * only valid link.
   */
  async peek(purpose: TokenPurpose, token: string): Promise<number | null> {
    const stored: StoredToken | null = await queryOne(
      `SELECT * FROM ${TABLES[purpose]}
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()`,
      [this.hashToken(token)]
    );
    return stored ? stored.user_id : null;
  }

  /**
   * Spends a token. Returns false if it was already spent or expired.
   *
   * `used_at IS NULL` lives in the WHERE clause rather than a preceding SELECT so
   * redemption is atomic: two concurrent requests carrying the same token cannot
   * both succeed, regardless of what peek() reported a moment earlier.
   */
  async consume(purpose: TokenPurpose, token: string): Promise<boolean> {
    const result = await query(
      `UPDATE ${TABLES[purpose]} SET used_at = NOW()
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()`,
      [this.hashToken(token)]
    );
    return (result as any).affectedRows === 1;
  }

  async invalidateAllForUser(purpose: TokenPurpose, userId: number): Promise<void> {
    await query(
      `UPDATE ${TABLES[purpose]} SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL`,
      [userId]
    );
  }

  /** Housekeeping: drop rows that can no longer be redeemed. */
  async purgeExpired(purpose: TokenPurpose): Promise<void> {
    await query(`DELETE FROM ${TABLES[purpose]} WHERE expires_at < NOW()`);
  }
}
