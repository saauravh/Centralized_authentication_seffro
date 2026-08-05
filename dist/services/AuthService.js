"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
exports.isExistingIdentity = isExistingIdentity;
const SsoTicketRepository_1 = require("../repositories/SsoTicketRepository");
const config_1 = require("../config");
const errors_1 = require("../utils/errors");
function isExistingIdentity(result) {
    return result.userExists === true;
}
class AuthService {
    userRepo;
    tokenRepo;
    tokenService;
    authTokenRepo;
    emailService;
    historyRepo;
    revocationRepo;
    ssoTicketRepo;
    constructor(userRepo, tokenRepo, tokenService, authTokenRepo, emailService, historyRepo, revocationRepo, ssoTicketRepo) {
        this.userRepo = userRepo;
        this.tokenRepo = tokenRepo;
        this.tokenService = tokenService;
        this.authTokenRepo = authTokenRepo;
        this.emailService = emailService;
        this.historyRepo = historyRepo;
        this.revocationRepo = revocationRepo;
        this.ssoTicketRepo = ssoTicketRepo;
    }
    /**
     * Creates a central identity. Deliberately issues no session.
     *
     * Registration and authentication are separate steps. If registration returned
     * a token, a user could sign up and use the account indefinitely without ever
     * opening the verification email, and REQUIRE_EMAIL_VERIFICATION would be
     * trivially bypassable. The caller sends the user to log in, which is the one
     * path that issues a session and the one place verification is enforced.
     *
     * When the address is already registered this is not an error — the same person
     * may be signing up on a second application. The response says only that the
     * identity exists: the central id is withheld because nothing here has proved
     * the caller owns that address, and an id would let an application link a local
     * record to a stranger's identity.
     */
    async register(input, ctx = {}) {
        const existing = await this.userRepo.findByEmail(input.email);
        if (existing) {
            return { userExists: true };
        }
        const user = await this.userRepo.create(input);
        await this.historyRepo.record(user.id, 'register', ctx);
        await this.issueVerificationEmail(user.id, user.email);
        return {
            centralUserId: user.id,
            verificationRequired: config_1.config.requireEmailVerification,
        };
    }
    async login(email, password, device, ctx = {}) {
        const user = await this.userRepo.findByEmail(email);
        if (!user) {
            throw new errors_1.UnauthorizedError('Invalid email or password');
        }
        // Checked before the password so a locked account stops absorbing guesses
        // entirely, rather than merely refusing correct ones.
        if (this.userRepo.isLocked(user)) {
            await this.historyRepo.record(user.id, 'login_failed', ctx);
            throw new errors_1.AccountLockedError();
        }
        const valid = await this.userRepo.comparePassword(password, user.password);
        if (!valid) {
            await this.userRepo.recordFailedLogin(user.id, config_1.config.lockout.threshold, config_1.config.lockout.durationSeconds);
            // Re-read to see whether that attempt crossed the threshold, so the lock
            // is recorded at the moment it happens rather than on the next attempt.
            const after = await this.userRepo.findById(user.id);
            if (after && this.userRepo.isLocked(after)) {
                await this.historyRepo.record(user.id, 'account_locked', ctx);
            }
            await this.historyRepo.record(user.id, 'login_failed', ctx);
            throw new errors_1.UnauthorizedError('Invalid email or password');
        }
        // Checked after the password so a wrong password and a suspended account are
        // indistinguishable to someone probing with a known-good address.
        if (user.status !== 'active') {
            await this.historyRepo.record(user.id, 'login_failed', ctx);
            throw new errors_1.UnauthorizedError('Account is suspended or banned');
        }
        // Login is the only place a session is issued, which makes it the only place
        // verification has to be enforced. Distinct error code so the application can
        // offer to re-send the email instead of showing "wrong password".
        if (config_1.config.requireEmailVerification && user.email_verified_at === null) {
            await this.historyRepo.record(user.id, 'login_failed', ctx);
            throw new errors_1.EmailNotVerifiedError();
        }
        await this.userRepo.clearFailedLogins(user.id);
        await this.userRepo.updateLastLogin(user.id);
        await this.historyRepo.record(user.id, 'login', ctx);
        return this.issueTokens(user, device || null, ctx.ip || null);
    }
    /**
     * Full validation, as opposed to a signature check.
     *
     * Local RS256 verification in each application is fast but cannot see anything
     * that happened after the token was signed. This asks the source of truth: is
     * the signature good, has this token been revoked, has every token for this
     * user been revoked, and is the account still active? Use it on privileged
     * actions and on a periodic revalidation tick, not on every page load.
     */
    async validateToken(accessToken) {
        let payload;
        try {
            payload = this.tokenService.verifyAccessToken(accessToken);
        }
        catch {
            return { valid: false, reason: 'invalid_token' };
        }
        if (payload.jti && (await this.revocationRepo.isTokenRevoked(payload.jti))) {
            return { valid: false, reason: 'token_revoked' };
        }
        const user = await this.userRepo.findById(payload.sub);
        if (!user || user.status !== 'active') {
            return { valid: false, reason: 'account_inactive' };
        }
        // Catches "revoke everything" for this user — a ban or password reset issued
        // after the token was minted.
        if (this.revocationRepo.issuedBeforeCutoff(payload.iat, user.tokens_valid_from)) {
            return { valid: false, reason: 'token_revoked' };
        }
        if (config_1.config.requireEmailVerification && user.email_verified_at === null) {
            return { valid: false, reason: 'email_unverified' };
        }
        return { valid: true, user: this.userRepo.toPublic(user) };
    }
    /**
     * Updates the identity fields this service owns, so a change made in one
     * application is visible to all of them.
     *
     * A new email address is treated as unverified until proven: it resets
     * email_verified and sends a fresh verification mail. Otherwise a user could
     * move their account to an address they do not control and keep a verified
     * badge.
     */
    async updateProfile(userId, changes, ctx = {}) {
        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new errors_1.BadRequestError('User not found');
        }
        const emailChanged = changes.email !== undefined && changes.email.toLowerCase() !== user.email.toLowerCase();
        if (emailChanged) {
            const taken = await this.userRepo.findByEmail(changes.email);
            if (taken && taken.id !== userId) {
                throw new errors_1.ConflictError('That email address is already in use');
            }
        }
        const updated = await this.userRepo.updateProfile(userId, {
            first_name: changes.first_name,
            last_name: changes.last_name,
            phone: changes.phone,
            email: changes.email,
            avatar: changes.avatar,
            role: changes.role,
            email_verified_at: emailChanged ? null : undefined,
        });
        await this.historyRepo.record(userId, emailChanged ? 'email_changed' : 'profile_updated', ctx);
        if (emailChanged) {
            await this.issueVerificationEmail(userId, updated.email);
        }
        return this.userRepo.toPublic(updated);
    }
    /** Ends every session a user holds. Used for bans and forced sign-out. */
    async revokeAllSessions(userId, ctx = {}) {
        await this.tokenRepo.revokeAllForUser(userId);
        await this.revocationRepo.revokeAllForUser(userId);
        await this.historyRepo.record(userId, 'tokens_revoked', ctx);
    }
    async refresh(refreshToken, ctx = {}) {
        const tokenHash = this.tokenRepo.hashToken(refreshToken);
        const stored = await this.tokenRepo.findByHash(tokenHash);
        if (!stored) {
            throw new errors_1.UnauthorizedError('Invalid or expired refresh token');
        }
        // Rotation: the presented token is spent whether or not the rest succeeds.
        await this.tokenRepo.revoke(tokenHash);
        const user = await this.userRepo.findById(stored.user_id);
        if (!user || user.status !== 'active') {
            throw new errors_1.UnauthorizedError('User not found or inactive');
        }
        await this.historyRepo.record(user.id, 'refresh', ctx);
        return this.issueTokens(user, stored.device_name, ctx.ip || stored.ip_address);
    }
    async verifyToken(accessToken) {
        const payload = this.tokenService.verifyAccessToken(accessToken);
        const user = await this.userRepo.findById(payload.sub);
        if (!user || user.status !== 'active') {
            throw new errors_1.UnauthorizedError('User not found or inactive');
        }
        return this.userRepo.toPublic(user);
    }
    /**
     * Ends a session.
     *
     * Revoking the refresh token stops renewal, but the access token already in
     * hand stays cryptographically valid until it expires. Blacklisting its jti
     * closes that window, which matters on shared machines where "log out" has to
     * mean the session is over now, not in fifteen minutes.
     */
    async logout(refreshToken, accessToken, ctx = {}) {
        const tokenHash = this.tokenRepo.hashToken(refreshToken);
        const stored = await this.tokenRepo.findByHash(tokenHash);
        await this.tokenRepo.revoke(tokenHash);
        if (accessToken) {
            try {
                const payload = this.tokenService.verifyAccessToken(accessToken);
                if (payload.jti) {
                    await this.revocationRepo.revokeToken(payload.jti, payload.sub, new Date(payload.exp * 1000));
                }
            }
            catch {
                // An expired or malformed access token needs no revoking.
            }
        }
        if (stored) {
            await this.historyRepo.record(stored.user_id, 'logout', ctx);
        }
    }
    async changePassword(userId, currentPassword, newPassword, ctx = {}) {
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
        await this.revocationRepo.revokeAllForUser(userId);
        await this.historyRepo.record(userId, 'password_change', ctx);
    }
    /**
     * Always resolves, whether or not the address is registered — the response is
     * identical either way so this endpoint cannot be used to enumerate accounts.
     */
    async forgotPassword(email, ctx = {}) {
        const user = await this.userRepo.findByEmail(email);
        if (!user || user.status !== 'active')
            return;
        const { token } = await this.authTokenRepo.issue('password_reset', user.id, config_1.config.tokens.resetTtl);
        await this.historyRepo.record(user.id, 'password_reset_requested', ctx);
        await this.emailService.sendPasswordReset(user.email, token);
    }
    /**
     * Redeems a reset token. The token alone determines which account is affected;
     * the email is only cross-checked so a token cannot be replayed against a
     * different address than the one it was mailed to.
     */
    async resetPassword(email, token, newPassword, ctx = {}) {
        const userId = await this.authTokenRepo.peek('password_reset', token);
        if (userId === null) {
            throw new errors_1.BadRequestError('This reset link is invalid or has expired');
        }
        const user = await this.userRepo.findById(userId);
        if (!user || user.email.toLowerCase() !== email.toLowerCase()) {
            // Mismatch means the caller paired a token with the wrong address. Leave
            // the token unspent so a bad request cannot destroy a valid reset link.
            throw new errors_1.BadRequestError('This reset link is invalid or has expired');
        }
        if (!(await this.authTokenRepo.consume('password_reset', token))) {
            throw new errors_1.BadRequestError('This reset link is invalid or has expired');
        }
        await this.userRepo.updatePassword(user.id, newPassword);
        // A reset is a credential change of unknown provenance: cut every existing
        // session so a thief who still holds a token is evicted. The cutoff covers
        // access tokens too, which revoking refresh tokens alone would leave live.
        await this.tokenRepo.revokeAllForUser(user.id);
        await this.revocationRepo.revokeAllForUser(user.id);
        await this.historyRepo.record(user.id, 'password_reset', ctx);
    }
    async verifyEmail(email, token, ctx = {}) {
        const userId = await this.authTokenRepo.peek('email_verification', token);
        if (userId === null) {
            throw new errors_1.BadRequestError('This verification link is invalid or has expired');
        }
        const user = await this.userRepo.findById(userId);
        if (!user || user.email.toLowerCase() !== email.toLowerCase()) {
            throw new errors_1.BadRequestError('This verification link is invalid or has expired');
        }
        if (!(await this.authTokenRepo.consume('email_verification', token))) {
            throw new errors_1.BadRequestError('This verification link is invalid or has expired');
        }
        await this.userRepo.verifyEmail(user.id);
        await this.historyRepo.record(user.id, 'email_verified', ctx);
        return this.userRepo.toPublic({ ...user, email_verified_at: new Date() });
    }
    /** Silent for unknown or already-verified addresses, same rationale as forgotPassword. */
    async resendVerification(email) {
        const user = await this.userRepo.findByEmail(email);
        if (!user || user.email_verified_at !== null)
            return;
        await this.issueVerificationEmail(user.id, user.email);
    }
    /**
     * Mints a single-use ticket another application can redeem for a session.
     *
     * Used for cross-domain SSO: a user logged into one application is redirected
     * to a second one, which presents the ticket to redeemSsoTicket and receives a
     * fresh session without the user typing a password again. The ticket is bound
     * to the application it was minted for and lasts barely a minute, so a captured
     * URL is worthless.
     */
    async createSsoTicket(userId, target, ctx = {}) {
        if (!(0, SsoTicketRepository_1.isSsoTarget)(target)) {
            throw new errors_1.BadRequestError('Unknown SSO target');
        }
        const user = await this.userRepo.findById(userId);
        if (!user || user.status !== 'active') {
            throw new errors_1.UnauthorizedError('User not found or inactive');
        }
        const issued = await this.ssoTicketRepo.issue(userId, target, config_1.config.tokens.ssoTtl);
        await this.historyRepo.record(userId, 'sso_ticket_issued', ctx);
        return { token: issued.token, expiresIn: config_1.config.tokens.ssoTtl };
    }
    /**
     * Redeems a ticket issued by createSsoTicket for a fresh session.
     *
     * The ticket alone determines which account is affected, so a token cannot be
     * replayed against a different person; the presented application must also be
     * the one the ticket was minted for, so a ticket torn out of one redirect URL
     * cannot start a session anywhere else.
     */
    async redeemSsoTicket(token, app, ctx = {}) {
        const ticket = await this.ssoTicketRepo.peek(token);
        if (!ticket) {
            throw new errors_1.BadRequestError('This sign-in link is invalid or has expired');
        }
        if (ticket.target !== app) {
            throw new errors_1.BadRequestError('This sign-in link is invalid or has expired');
        }
        const user = await this.userRepo.findById(ticket.userId);
        if (!user || user.status !== 'active') {
            throw new errors_1.UnauthorizedError('User not found or inactive');
        }
        if (config_1.config.requireEmailVerification && user.email_verified_at === null) {
            throw new errors_1.EmailNotVerifiedError();
        }
        if (!(await this.ssoTicketRepo.consume(token))) {
            throw new errors_1.BadRequestError('This sign-in link is invalid or has expired');
        }
        await this.userRepo.updateLastLogin(user.id);
        await this.historyRepo.record(user.id, 'sso_redeem', ctx);
        return this.issueTokens(user, 'sso', ctx.ip || null);
    }
    async issueVerificationEmail(userId, email) {
        const { token } = await this.authTokenRepo.issue('email_verification', userId, config_1.config.tokens.verifyTtl);
        await this.emailService.sendVerification(email, token);
    }
    async issueTokens(user, deviceName, ipAddress) {
        const accessToken = this.tokenService.generateAccessToken(user);
        const refreshToken = this.tokenRepo.generateRefreshToken();
        await this.tokenRepo.create(user.id, this.tokenRepo.hashToken(refreshToken), deviceName, ipAddress, config_1.config.jwt.refreshTtl);
        return {
            user: this.userRepo.toPublic(user),
            accessToken,
            refreshToken,
            expiresIn: config_1.config.jwt.accessTtl,
        };
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=AuthService.js.map