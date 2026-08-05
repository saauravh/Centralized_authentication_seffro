"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const AuthService_1 = require("../services/AuthService");
const zod_1 = require("zod");
/** Roles an identity may hold. Each application maps these onto its own actors
 *  (Seffro: users/vendors/agents; Helppu: customers/providers/handymen). */
const ROLES = ['user', 'vendor', 'agent', 'provider', 'handyman', 'admin'];
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8).max(128),
    first_name: zod_1.z.string().min(1).max(100),
    last_name: zod_1.z.string().min(1).max(100),
    phone: zod_1.z.string().max(20).optional(),
    role: zod_1.z.enum(ROLES).default('user').optional(),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string(),
});
const refreshSchema = zod_1.z.object({
    refresh_token: zod_1.z.string().min(32).max(128),
});
const changePasswordSchema = zod_1.z.object({
    current_password: zod_1.z.string(),
    new_password: zod_1.z.string().min(8).max(128),
});
const forgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
});
const resetPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    token: zod_1.z.string().min(32).max(128),
    new_password: zod_1.z.string().min(8).max(128),
});
const verifyEmailSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    token: zod_1.z.string().min(32).max(128),
});
const resendVerificationSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
});
const ssoTicketSchema = zod_1.z.object({
    target: zod_1.z.enum(['seffro', 'helppu']),
});
const ssoRedeemSchema = zod_1.z.object({
    token: zod_1.z.string().min(32).max(128),
    app: zod_1.z.enum(['seffro', 'helppu']),
});
// Only the identity fields this service owns. Password has its own endpoint, and
// status is never client-writable.
const updateProfileSchema = zod_1.z
    .object({
    first_name: zod_1.z.string().min(1).max(100).optional(),
    last_name: zod_1.z.string().min(1).max(100).optional(),
    phone: zod_1.z.string().max(20).nullable().optional(),
    email: zod_1.z.string().email().optional(),
    avatar: zod_1.z.string().max(500).nullable().optional(),
    role: zod_1.z.enum(ROLES).optional(),
})
    .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
});
class AuthController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    register = async (req, res, next) => {
        try {
            const data = registerSchema.parse(req.body);
            const result = await this.authService.register(data, context(req));
            // 200, not 409: an existing identity is a normal outcome the application
            // handles in its own UI. The central id is withheld — see
            // AuthService.register for why.
            if ((0, AuthService_1.isExistingIdentity)(result)) {
                return res.status(200).json({ user_exists: true });
            }
            // No session here by design. The application sends the user to log in.
            return res.status(201).json({
                central_user_id: result.centralUserId,
                verification_required: result.verificationRequired,
            });
        }
        catch (err) {
            return handle(err, res, next);
        }
    };
    login = async (req, res, next) => {
        try {
            const data = loginSchema.parse(req.body);
            const result = await this.authService.login(data.email, data.password, req.headers['user-agent'], context(req));
            return res.json(serializeAuthResult(result));
        }
        catch (err) {
            return handle(err, res, next);
        }
    };
    refresh = async (req, res, next) => {
        try {
            const data = refreshSchema.parse(req.body);
            const result = await this.authService.refresh(data.refresh_token, context(req));
            return res.json(serializeAuthResult(result));
        }
        catch (err) {
            return handle(err, res, next);
        }
    };
    logout = async (req, res, next) => {
        try {
            const { refresh_token } = req.body;
            if (refresh_token) {
                // The access token is optional but worth sending: without it the token
                // already in the user's hands stays usable until it expires.
                await this.authService.logout(refresh_token, bearer(req) ?? undefined, context(req));
            }
            return res.json({ success: true });
        }
        catch (err) {
            return handle(err, res, next);
        }
    };
    /**
     * The only token-inspection endpoint.
     *
     * Checks the signature and then everything a signature cannot know: whether
     * this token was revoked, whether all the user's tokens were revoked, whether
     * the account is still active and verified.
     */
    validate = async (req, res, next) => {
        try {
            const token = bearer(req) ?? (typeof req.body?.token === 'string' ? req.body.token : null);
            if (!token) {
                return res.status(401).json({ valid: false, reason: 'invalid_token' });
            }
            const result = await this.authService.validateToken(token);
            if (!result.valid) {
                return res.status(401).json({ valid: false, reason: result.reason });
            }
            return res.json({ valid: true, user: serializeUser(result.user) });
        }
        catch (err) {
            return handle(err, res, next);
        }
    };
    updateProfile = async (req, res, next) => {
        try {
            const data = updateProfileSchema.parse(req.body);
            if (!req.userId) {
                return res
                    .status(401)
                    .json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
            }
            const user = await this.authService.updateProfile(req.userId, data, context(req));
            return res.json({ user: serializeUser(user) });
        }
        catch (err) {
            return handle(err, res, next);
        }
    };
    me = async (req, res, next) => {
        try {
            const token = bearer(req);
            if (!token) {
                return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
            }
            const user = await this.authService.verifyToken(token);
            return res.json({ user: serializeUser(user) });
        }
        catch (err) {
            return handle(err, res, next);
        }
    };
    changePassword = async (req, res, next) => {
        try {
            const data = changePasswordSchema.parse(req.body);
            if (!req.userId) {
                return res
                    .status(401)
                    .json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
            }
            await this.authService.changePassword(req.userId, data.current_password, data.new_password, context(req));
            return res.json({ success: true });
        }
        catch (err) {
            return handle(err, res, next);
        }
    };
    forgotPassword = async (req, res, next) => {
        try {
            const data = forgotPasswordSchema.parse(req.body);
            await this.authService.forgotPassword(data.email, context(req));
            return res.json({ success: true });
        }
        catch (err) {
            return handle(err, res, next);
        }
    };
    resetPassword = async (req, res, next) => {
        try {
            const data = resetPasswordSchema.parse(req.body);
            await this.authService.resetPassword(data.email, data.token, data.new_password, context(req));
            return res.json({ success: true });
        }
        catch (err) {
            return handle(err, res, next);
        }
    };
    verifyEmail = async (req, res, next) => {
        try {
            const data = verifyEmailSchema.parse({ ...req.query, ...req.body });
            const user = await this.authService.verifyEmail(data.email, data.token, context(req));
            return res.json({ success: true, user: serializeUser(user) });
        }
        catch (err) {
            return handle(err, res, next);
        }
    };
    resendVerification = async (req, res, next) => {
        try {
            const data = resendVerificationSchema.parse(req.body);
            await this.authService.resendVerification(data.email);
            return res.json({ success: true });
        }
        catch (err) {
            return handle(err, res, next);
        }
    };
    /** Mints a single-use ticket for cross-application sign-on. */
    createSsoTicket = async (req, res, next) => {
        try {
            const data = ssoTicketSchema.parse(req.body);
            if (!req.userId) {
                return res
                    .status(401)
                    .json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
            }
            const issued = await this.authService.createSsoTicket(req.userId, data.target, context(req));
            return res.json({ token: issued.token, expires_in: issued.expiresIn });
        }
        catch (err) {
            return handle(err, res, next);
        }
    };
    /** Redeems a ticket for a fresh session, letting the user in without a password. */
    redeemSsoTicket = async (req, res, next) => {
        try {
            const data = ssoRedeemSchema.parse(req.body);
            const result = await this.authService.redeemSsoTicket(data.token, data.app, context(req));
            return res.json(serializeAuthResult(result));
        }
        catch (err) {
            return handle(err, res, next);
        }
    };
}
exports.AuthController = AuthController;
function bearer(req) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer '))
        return null;
    return header.substring(7).trim() || null;
}
function context(req) {
    return { ip: req.ip, userAgent: req.headers['user-agent'] || null };
}
function handle(err, res, next) {
    if (err instanceof zod_1.z.ZodError) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: err.errors } });
    }
    return next(err);
}
/** Wire format is snake_case throughout, matching the Laravel consumers. */
function serializeUser(user) {
    return {
        id: user.id,
        uuid: user.uuid,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        avatar: user.avatar,
        email_verified: user.email_verified,
        email_verified_at: user.email_verified_at,
        status: user.status,
        role: user.role,
    };
}
function serializeAuthResult(result) {
    return {
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
        expires_in: result.expiresIn,
        token_type: 'Bearer',
        user: serializeUser(result.user),
    };
}
//# sourceMappingURL=AuthController.js.map