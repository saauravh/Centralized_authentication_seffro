import { query, queryOne } from '../config/database';
import { CentralUser, CreateUserInput, UserPublic } from '../models/User';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export class UserRepository {
  async findByEmail(email: string): Promise<CentralUser | null> {
    return queryOne('SELECT * FROM central_users WHERE email = ?', [email]);
  }

  async findById(id: number): Promise<CentralUser | null> {
    return queryOne('SELECT * FROM central_users WHERE id = ?', [id]);
  }

  async create(input: CreateUserInput): Promise<CentralUser> {
    const hashedPassword = await bcrypt.hash(input.password, SALT_ROUNDS);
    const result = await query(
      `INSERT INTO central_users (email, password, first_name, last_name, phone)
       VALUES (?, ?, ?, ?, ?)`,
      [input.email, hashedPassword, input.first_name, input.last_name, input.phone || null]
    );
    return this.findById((result as any).insertId) as Promise<CentralUser>;
  }

  async updateLastLogin(id: number): Promise<void> {
    await query('UPDATE central_users SET last_login_at = NOW() WHERE id = ?', [id]);
  }

  async verifyEmail(id: number): Promise<void> {
    await query('UPDATE central_users SET email_verified = 1 WHERE id = ?', [id]);
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
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      email_verified: user.email_verified === 1,
      status: user.status,
    };
  }
}
