import { query, queryOne } from '../config/database';
import { CentralUser, CreateUserInput, UserPublic } from '../models/User';
// bcryptjs, not the native bcrypt: it emits the same $2b$ hashes but needs no
// C++ toolchain, so the service builds identically on every deploy target.
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { normalizePhone, looksLikeEmail, PHONE_KEY_LENGTH } from '../utils/phone';
import { logger } from '../utils/logger';

const SALT_ROUNDS = 10;

/**
 * Strips the separators people type into a phone field. Not a full "digits
 * only" cleanup — MySQL has no portable regex replace — but enough to make the
 * suffix comparison a useful filter. The exact match happens in findAllByPhone.
 */
const CLEAN_PHONE_SQL =
  "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''), '+', '')";

export class UserRepository {
  async findByEmail(email: string): Promise<CentralUser | null> {
    return queryOne('SELECT * FROM central_users WHERE email = ?', [email]);
  }

  /**
   * Every identity carrying this mobile number.
   *
   * `phone` is not unique in the schema, so this returns a list: callers decide
   * what a collision means. The SQL only narrows the scan — it compares the last
   * {@link PHONE_KEY_LENGTH} characters after the separators a user is likely to
   * have typed — and the digits are then compared exactly in JS.
   */
  async findAllByPhone(phone: string): Promise<CentralUser[]> {
    const key = normalizePhone(phone);
    if (!key) {
      return [];
    }

    const rows: CentralUser[] = await query(
      `SELECT * FROM central_users
        WHERE phone IS NOT NULL AND phone <> ''
          AND RIGHT(${CLEAN_PHONE_SQL}, ${PHONE_KEY_LENGTH}) = ?`,
      [key]
    );

    return rows.filter((row) => row.phone !== null && normalizePhone(row.phone) === key);
  }

  /**
   * The single identity holding this number, or null.
   *
   * A number shared by more than one identity resolves to nobody. Registration
   * and profile updates both refuse duplicates, so this is the historical case —
   * and picking one of them would hand the caller a session on an account that
   * may not be theirs.
   */
  async findByPhone(phone: string): Promise<CentralUser | null> {
    const matches = await this.findAllByPhone(phone);

    if (matches.length > 1) {
      logger.warn('Mobile number resolves to more than one identity', {
        count: matches.length,
        ids: matches.map((u) => u.id),
      });
      return null;
    }

    return matches[0] || null;
  }

  /** Resolves whichever of the two identifiers a login form collected. */
  async findByIdentifier(identifier: string): Promise<CentralUser | null> {
    const value = identifier.trim();

    return looksLikeEmail(value) ? this.findByEmail(value) : this.findByPhone(value);
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
