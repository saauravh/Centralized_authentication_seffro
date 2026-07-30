"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const errors_1 = require("../utils/errors");
class AuthService {
    userRepo;
    tokenRepo;
    tokenService;
    constructor(userRepo, tokenRepo, tokenService) {
        this.userRepo = userRepo;
        this.tokenRepo = tokenRepo;
        this.tokenService = tokenService;
    }
    async register(input) {
        const existing = await this.userRepo.findByEmail(input.email);
        if (existing) {
            throw new errors_1.ConflictError('Email already registered');
        }
        const user = await this.userRepo.create(input);
        await this.sendVerificationEmail(user.email);
        return this.userRepo.toPublic(user);
    }
    async login(email, password, device) {
        const user = await this.userRepo.findByEmail(email);
        if (!user) {
            throw new errors_1.UnauthorizedError('Invalid email or password');
        }
        if (user.status !== 'active') {
            throw new errors_1.UnauthorizedError('Account is suspended or banned');
        }
        const valid = await this.userRepo.comparePassword(password, user.password);
        if (!valid) {
            throw new errors_1.UnauthorizedError('Invalid email or password');
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
    async refresh(refreshToken) {
        const tokenHash = this.tokenRepo.hashToken(refreshToken);
        const stored = await this.tokenRepo.findByHash(tokenHash);
        if (!stored) {
            throw new errors_1.UnauthorizedError('Invalid or expired refresh token');
        }
        await this.tokenRepo.revoke(tokenHash);
        const user = await this.userRepo.findById(stored.user_id);
        if (!user || user.status !== 'active') {
            throw new errors_1.UnauthorizedError('User not found or inactive');
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
    async verifyToken(accessToken) {
        const payload = this.tokenService.verifyAccessToken(accessToken);
        const user = await this.userRepo.findById(payload.sub);
        if (!user || user.status !== 'active') {
            throw new errors_1.UnauthorizedError('User not found or inactive');
        }
        return this.userRepo.toPublic(user);
    }
    async logout(refreshToken) {
        const tokenHash = this.tokenRepo.hashToken(refreshToken);
        await this.tokenRepo.revoke(tokenHash);
    }
    async changePassword(userId, currentPassword, newPassword) {
        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new errors_1.BadRequestError('User not found');
        }
        const valid = await this.userRepo.comparePassword(currentPassword, user.password);
        if (!valid) {
            throw new errors_1.BadRequestError('Current password is incorrect');
        }
        await this.userRepo.updatePassword(userId, newPassword);
        await this.tokenRepo.revokeAllForUser(userId);
    }
    async forgotPassword(email) {
        const user = await this.userRepo.findByEmail(email);
        if (!user)
            return;
        await this.sendPasswordResetEmail(email);
    }
    async resetPassword(email, token, newPassword) {
        const user = await this.userRepo.findByEmail(email);
        if (!user) {
            throw new errors_1.BadRequestError('Invalid reset request');
        }
        await this.userRepo.updatePassword(user.id, newPassword);
    }
    async sendVerificationEmail(email) {
        // TODO: Implement email sending via nodemailer
        console.log(`[EMAIL] Verification email sent to ${email}`);
    }
    async sendPasswordResetEmail(email) {
        // TODO: Implement email sending via nodemailer
        console.log(`[EMAIL] Password reset email sent to ${email}`);
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=AuthService.js.map