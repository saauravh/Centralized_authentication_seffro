import { query, queryOne } from '../config/database';
import { RefreshToken } from '../models/RefreshToken';
import crypto from 'crypto';

export class TokenRepository {
  generateRefreshToken(): string {
    return crypto.randomUUID();
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async create(userId: number, tokenHash: string, device: string | null, ttlSeconds: number): Promise<void> {
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, device, expires_at)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
      [userId, tokenHash, device, ttlSeconds]
    );
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return queryOne(
      'SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked = 0 AND expires_at > NOW()',
      [tokenHash]
    );
  }

  async revoke(tokenHash: string): Promise<void> {
    await query('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?', [tokenHash]);
  }

  async revokeAllForUser(userId: number): Promise<void> {
    await query('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', [userId]);
  }
}
