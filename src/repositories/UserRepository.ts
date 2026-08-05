import { query, queryOne } from '../config/database';
import { CentralUser, CreateUserInput, UserPublic } from '../models/User';
// bcryptjs, not the native bcrypt: it emits the same $2b$ hashes but needs no
// C++ toolchain, so the service builds identically on every deploy target.
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SALT_ROUNDS = 10;

export class UserRepository {
  async findByEmail(email: string): Promise<CentralUser | null> {
    return queryOne('SELECT * FROM central_users WHERE email = ?', [email]);
  }

  async findById(id: number): Promise<CentralUser | null> {
    return queryOne('SELECT * FROM central_users WHERE id = ?', [id]);
  }

  /** Lookup by the public identifier, for anything that came from outside. */
  async findByUuid(uuid: string): Promise<CentralUser | null> {
    return queryOne('SELECT * FROM central_users WHERE uuid = ?', [uuid]);
  }

  async create(input: CreateUserInput): Promise<CentralUser> {
    const hashedPassword = await bcrypt.hash(input.password, SALT_ROUNDS);
    const result = await query(
      `INSERT INTO central_users (uuid, email, password, first_name, last_name, phone, role)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        input.email,
        hashedPassword,
        input.first_name,
        input.last_name,
        input.phone || null,
        input.role || 'user',
      ]
    );
    return this.findById((result as any).insertId) as Promise<CentralUser>;
  }

  /**
   * Failed-login bookkeeping for account lockout.
   *
   * Persisted rather than held in the in-memory rate limiter so a lockout
   * survives a restart and is visible to support staff looking at the account.
   */
  async recordFailedLogin(id: number, threshold: number, lockSeconds: number): Promise<void> {
    await query(
      `UPDATE central_users
       SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = IF(failed_login_attempts + 1 >= ?, DATE_ADD(NOW(), INTERVAL ? SECOND), locked_until)
       WHERE id = ?`,
      [threshold, lockSeconds, id]
    );
  }

  async clearFailedLogins(id: number): Promise<void> {
    await query(
      'UPDATE central_users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?',
      [id]
    );
  }

  isLocked(user: CentralUser): boolean {
    return user.locked_until !== null && new Date(user.locked_until).getTime() > Date.now();
  }

  async updateLastLogin(id: number): Promise<void> {
    await query('UPDATE central_users SET last_login_at = NOW() WHERE id = ?', [id]);
  }

  async verifyEmail(id: number): Promise<void> {
    await query('UPDATE central_users SET email_verified_at = NOW() WHERE id = ?', [id]);
  }

  /**
   * Partial update of the identity fields this service owns.
   *
   * Columns are whitelisted here rather than derived from the input keys — the
   * caller passes a request-shaped object, and interpolating its keys into SQL
   * would let a client write to `password` or `status`.
   */
  async updateProfile(
    id: number,
    changes: {
      first_name?: string;
      last_name?: string;
      phone?: string | null;
      email?: string;
      avatar?: string | null;
      email_verified_at?: Date | null;
      role?: string;
    }
  ): Promise<CentralUser> {
    const allowed = ['first_name', 'last_name', 'phone', 'email', 'avatar', 'email_verified_at', 'role'] as const;

    const sets: string[] = [];
    const values: any[] = [];

    for (const column of allowed) {
      const value = changes[column];
      if (value !== undefined) {
        sets.push(`${column} = ?`);
        values.push(value);
      }
    }

    if (sets.length > 0) {
      values.push(id);
      await query(`UPDATE central_users SET ${sets.join(', ')} WHERE id = ?`, values);
    }

    return this.findById(id) as Promise<CentralUser>;
  }

  async updatePassword(id: number, newPassword: string): Promise<void> {
    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await query('UPDATE central_users SET password = ? WHERE id = ?', [hashed, id]);
  }

  async comparePassword(plain: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(plain, hashed);
  }

  toPublic(user: CentralUser): UserPublic {
    return {
      id: user.id,
      uuid: user.uuid,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      avatar: user.avatar,
      // Kept alongside the timestamp: callers overwhelmingly want the boolean,
      // and deriving it in every consumer invites inconsistency.
      email_verified: user.email_verified_at !== null,
      email_verified_at: user.email_verified_at,
      status: user.status,
      role: user.role,
    };
  }
}
