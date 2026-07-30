import { UserRepository } from '../repositories/UserRepository';
import { TokenRepository } from '../repositories/TokenRepository';
import { TokenService } from './TokenService';
import { BadRequestError, UnauthorizedError, ConflictError } from '../utils/errors';
import { UserPublic, CreateUserInput } from '../models/User';

export interface AuthResult {
  user: UserPublic;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class AuthService {
  constructor(
    private userRepo: UserRepository,
    private tokenRepo: TokenRepository,
    private tokenService: TokenService
  ) {}

  async register(input: CreateUserInput): Promise<UserPublic> {
    const existing = await this.userRepo.findByEmail(input.email);
    if (existing) {
      throw new ConflictError('Email already registered');
    }

    const user = await this.userRepo.create(input);
    await this.sendVerificationEmail(user.email);

    return this.userRepo.toPublic(user);
  }

  async login(email: string, password: string, device?: string): Promise<AuthResult> {
    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedError('Account is suspended or banned');
    }

    const valid = await this.userRepo.comparePassword(password, user.password);
    if (!valid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    await this.userRepo.updateLastLogin(user.id);

    const accessToken = this.tokenService.generateAccessToken(user);
    const refreshToken = this.tokenRepo.generateRefreshToken();
    const tokenHash = this.tokenRepo.hashToken(refreshToken);
    await this.tokenRepo.create(user.id, tokenHash, device || null, 604800);

    return {
      user: this.userRepo.toPublic(user),
      accessToken,
      refreshToken,
      expiresIn: 900,
    };
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const tokenHash = this.tokenRepo.hashToken(refreshToken);
    const stored = await this.tokenRepo.findByHash(tokenHash);
    if (!stored) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    await this.tokenRepo.revoke(tokenHash);

    const user = await this.userRepo.findById(stored.user_id);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('User not found or inactive');
    }

    const newAccessToken = this.tokenService.generateAccessToken(user);
    const newRefreshToken = this.tokenRepo.generateRefreshToken();
    const newHash = this.tokenRepo.hashToken(newRefreshToken);
    await this.tokenRepo.create(user.id, newHash, stored.device, 604800);

    return {
      user: this.userRepo.toPublic(user),
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900,
    };
  }

  async verifyToken(accessToken: string): Promise<UserPublic> {
    const payload = this.tokenService.verifyAccessToken(accessToken);
    const user = await this.userRepo.findById(payload.sub);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('User not found or inactive');
    }
    return this.userRepo.toPublic(user);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.tokenRepo.hashToken(refreshToken);
    await this.tokenRepo.revoke(tokenHash);
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new BadRequestError('User not found');
    }

    const valid = await this.userRepo.comparePassword(currentPassword, user.password);
    if (!valid) {
      throw new BadRequestError('Current password is incorrect');
    }

    await this.userRepo.updatePassword(userId, newPassword);
    await this.tokenRepo.revokeAllForUser(userId);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.userRepo.findByEmail(email);
    if (!user) return;
    await this.sendPasswordResetEmail(email);
  }

  async resetPassword(email: string, token: string, newPassword: string): Promise<void> {
    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      throw new BadRequestError('Invalid reset request');
    }
    await this.userRepo.updatePassword(user.id, newPassword);
  }

  private async sendVerificationEmail(email: string): Promise<void> {
    // TODO: Implement email sending via nodemailer
    console.log(`[EMAIL] Verification email sent to ${email}`);
  }

  private async sendPasswordResetEmail(email: string): Promise<void> {
    // TODO: Implement email sending via nodemailer
    console.log(`[EMAIL] Password reset email sent to ${email}`);
  }
}
