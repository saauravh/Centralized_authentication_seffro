import { query, queryOne } from '../config/database';
import crypto from 'crypto';

export type SsoTarget = 'seffro' | 'helppu';

export const VALID_SSO_TARGETS: SsoTarget[] = ['seffro', 'helppu'];

export function isSsoTarget(value: string): value is SsoTarget {
  return (VALID_SSO_TARGETS as string[]).includes(value);
}

export interface IssuedSsoTicket {
  /** Raw token — carried in the redirect URL, never persisted. */
  token: string;
  expiresAt: Date;
}

interface StoredTicket {
  id: number;
  user_id: number;
  target: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
}

/**
 * Single-use, expiring tickets for cross-application single sign-on.
 *
 * Same shape as the reset/verify tokens: only the SHA-256 hash is stored, and
 * redemption is atomic via `used_at IS NULL` in the WHERE clause so two
 * concurrent requests carrying the same ticket cannot both succeed. `target`
 * binds the ticket to the application it was minted for, so a ticket is worth
 * nothing on any other application.
 */
export class SsoTicketRepository {
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async issue(userId: number, target: SsoTarget, ttlSeconds: number): Promise<IssuedSsoTicket> {
    const token = crypto.randomBytes(32).toString('hex');

    await query(
      `INSERT INTO sso_tickets (user_id, target, token_hash, expires_at)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
      [userId, target, this.hashToken(token), ttlSeconds]
    );

    return { token, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  }

  /**
   * Looks up a redeemable ticket without spending it. Returns null when unknown,
   * expired, or already used.
   */
  async peek(token: string): Promise<{ userId: number; target: string } | null> {
    const stored: StoredTicket | null = await queryOne(
      `SELECT * FROM sso_tickets
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()`,
      [this.hashToken(token)]
    );

    return stored ? { userId: stored.user_id, target: stored.target } : null;
  }

  /** Spends a ticket. Returns false if it was already spent or expired. */
  async consume(token: string): Promise<boolean> {
    const result = await query(
      `UPDATE sso_tickets SET used_at = NOW()
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()`,
      [this.hashToken(token)]
    );

    return (result as any).affectedRows === 1;
  }

  /** Housekeeping: drop rows that can no longer be redeemed. */
  async purgeExpired(): Promise<void> {
    await query('DELETE FROM sso_tickets WHERE expires_at < NOW()');
  }
}
