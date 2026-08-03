import { query, queryOne } from '../config/database';
import crypto from 'crypto';

export interface ServiceClient {
  id: number;
  client_name: string;
  client_secret_hash: string;
  /** Optional network restriction. Null means unrestricted. */
  allowed_origin: string | null;
  status: 'active' | 'disabled';
  last_used_at: Date | null;
}

/**
 * Credentials for the applications allowed to call this service.
 *
 * Per-app rather than one shared secret: a compromised or rotated credential
 * affects only the app it belongs to, and `last_used_at` shows at a glance
 * whether a client is still in use before it is retired.
 *
 * Secrets are stored as SHA-256 hashes. They are 256-bit random values, not
 * user-chosen passwords, so there is no low-entropy secret for a slow KDF to
 * protect — and this runs on every single request.
 */
export class ServiceClientRepository {
  hashSecret(secret: string): string {
    return crypto.createHash('sha256').update(secret).digest('hex');
  }

  generateSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  async findBySecret(secret: string): Promise<ServiceClient | null> {
    return queryOne(
      "SELECT * FROM service_clients WHERE client_secret_hash = ? AND status = 'active'",
      [this.hashSecret(secret)]
    );
  }

  /**
   * Second factor on top of the secret: a leaked credential is only usable from
   * the address the client is expected to call from. Clients with no
   * allowed_origin are unrestricted.
   */
  originAllowed(client: ServiceClient, ip: string | undefined): boolean {
    if (!client.allowed_origin) {
      return true;
    }

    return client.allowed_origin
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .includes((ip || '').trim());
  }

  /** Fire-and-forget; a failed timestamp write must not fail the request. */
  async touch(id: number): Promise<void> {
    try {
      await query('UPDATE service_clients SET last_used_at = NOW() WHERE id = ?', [id]);
    } catch {
      // Ignored by design.
    }
  }

  async count(): Promise<number> {
    const row = await queryOne(
      "SELECT COUNT(*) AS c FROM service_clients WHERE status = 'active'"
    );

    return row ? Number(row.c) : 0;
  }

  /** Used by the provisioning script. Returns the raw secret exactly once. */
  async create(name: string, allowedOrigin: string | null = null): Promise<{ name: string; secret: string }> {
    const secret = this.generateSecret();
    await query(
      `INSERT INTO service_clients (client_name, client_secret_hash, allowed_origin)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         client_secret_hash = VALUES(client_secret_hash),
         allowed_origin = VALUES(allowed_origin),
         status = 'active'`,
      [name, this.hashSecret(secret), allowedOrigin]
    );

    return { name, secret };
  }
}
