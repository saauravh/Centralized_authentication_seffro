"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const zod_1 = require("zod");
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8).max(128),
    first_name: zod_1.z.string().min(1).max(100),
    last_name: zod_1.z.string().min(1).max(100),
    phone: zod_1.z.string().optional(),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string(),
});
const refreshSchema = zod_1.z.object({
    refresh_token: zod_1.z.string().uuid(),
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
    token: zod_1.z.string(),
    new_password: zod_1.z.string().min(8).max(128),
});
class AuthController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    register = async (req, res, next) => {
        try {
            const data = registerSchema.parse(req.body);
            const user = await this.authService.register(data);
            return res.status(201).json({ user });
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
                return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: err.errors } });
            }
            next(err);
        }
    };
    login = async (req, res, next) => {
        try {
            const data = loginSchema.parse(req.body);
            const result = await this.authService.login(data.email, data.password, req.headers['user-agent']);
            return res.json(result);
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
                return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: err.errors } });
            }
            next(err);
        }
    };
    refresh = async (req, res, next) => {
        try {
            const data = refreshSchema.parse(req.body);
            const result = await this.authService.refresh(data.refresh_token);
            return res.json(result);
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
                return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: err.errors } });
            }
            next(err);
        }
    };
    verify = async (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
            }
            const token = authHeader.substring(7);
            const user = await this.authService.verifyToken(token);
            return res.json({ valid: true, user });
        }
        catch (err) {
            return res.status(401).json({ valid: false, error: err.message });
        }
    };
    logout = async (req, res, next) => {
        try {
            const { refresh_token } = req.body;
            if (refresh_token) {
                await this.authService.logout(refresh_token);
            }
            return res.json({ success: true });
        }
        catch (err) {
            next(err);
        }
    };
    me = async (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
            }
            const token = authHeader.substring(7);
            const user = await this.authService.verifyToken(token);
            return res.json({ user });
        }
        catch (err) {
            next(err);
        }
    };
    changePassword = async (req, res, next) => {
        try {
            const data = changePasswordSchema.parse(req.body);
            if (!req.userId) {
                return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
            }
            await this.authService.changePassword(req.userId, data.current_password, data.new_password);
            return res.json({ success: true });
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
                return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: err.errors } });
            }
            next(err);
        }
    };
    forgotPassword = async (req, res, next) => {
        try {
            const data = forgotPasswordSchema.parse(req.body);
            await this.authService.forgotPassword(data.email);
            return res.json({ success: true });
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
                return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: err.errors } });
            }
            next(err);
        }
    };
    resetPassword = async (req, res, next) => {
        try {
            const data = resetPasswordSchema.parse(req.body);
            await this.authService.resetPassword(data.email, data.token, data.new_password);
            return res.json({ success: true });
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
                return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: err.errors } });
            }
            next(err);
        }
    };
}
exports.AuthController = AuthController;
//# sourceMappingURL=AuthController.js.map