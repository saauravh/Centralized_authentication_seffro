import { query, queryOne } from '../config/database';
import { RefreshToken } from '../models/RefreshToken';
import crypto from 'crypto';

export class TokenRepository {
  /** 256 bits of CSPRNG output. Opaque to clients; only its hash is stored. */
  generateRefreshToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async create(
    userId: number,
    tokenHash: string,
    deviceName: string | null,
    ipAddress: string | null,
    ttlSeconds: number
  ): Promise<void> {
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, device_name, ip_address, expires_at)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
      [userId, tokenHash, deviceName, ipAddress, ttlSeconds]
    );
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return queryOne(
      'SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()',
      [tokenHash]
    );
  }

  async revoke(tokenHash: string): Promise<void> {
    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL', [tokenHash]);
  }

  async revokeAllForUser(userId: number): Promise<void> {
    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [userId]);
  }
}
