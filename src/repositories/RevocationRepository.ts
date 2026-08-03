import { query, queryOne } from '../config/database';

/**
 * Deny list for access tokens.
 *
 * A JWT is self-contained: once signed, it stays cryptographically valid until it
 * expires, no matter what happens to the account. That is fine for a 15-minute
 * token most of the time, but not when an admin bans someone or a user logs out
 * on a shared machine. These two mechanisms close that window:
 *
 *  - per-token (`jti`) for a single logout
 *  - per-user cutoff for "revoke everything", which cannot be expressed as a
 *    list of jtis because we never recorded the ones already handed out
 *
 * Only /validate-token consults this. Apps doing fast local signature checks
 * accept a bounded staleness instead — see the revalidation interval in the
 * Laravel middleware.
 */
export class RevocationRepository {
  /** Revokes one access token. `expiresAt` lets the row be purged later. */
  async revokeToken(jti: string, userId: number, expiresAt: Date): Promise<void> {
    await query(
      `INSERT INTO revoked_tokens (jti, user_id, expires_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE revoked_at = NOW()`,
      [jti, userId, expiresAt]
    );
  }

  async isTokenRevoked(jti: string): Promise<boolean> {
    const row = await queryOne('SELECT id FROM revoked_tokens WHERE jti = ?', [jti]);

    return row !== null;
  }

  /**
   * Invalidates every access token issued to a user up to now.
   *
   * Uses NOW() + 1s: tokens carry second-resolution `iat`, so a token minted in
   * the same second as the revocation would otherwise slip through the
   * `iat >= tokens_valid_from` comparison.
   */
  async revokeAllForUser(userId: number): Promise<void> {
    await query(
      'UPDATE central_users SET tokens_valid_from = DATE_ADD(NOW(), INTERVAL 1 SECOND) WHERE id = ?',
      [userId]
    );
  }

  /** True when the token predates the user's revocation cutoff. */
  issuedBeforeCutoff(issuedAt: number, cutoff: Date | null): boolean {
    if (!cutoff) {
      return false;
    }

    return issuedAt * 1000 < new Date(cutoff).getTime();
  }

  /** Housekeeping: rows for tokens that have expired on their own. */
  async purgeExpired(): Promise<number> {
    const result = await query('DELETE FROM revoked_tokens WHERE expires_at < NOW()');

    return (result as any).affectedRows ?? 0;
  }
}
