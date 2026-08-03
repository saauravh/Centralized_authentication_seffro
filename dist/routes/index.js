"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRoutes = createRoutes;
const express_1 = require("express");
const authenticate_1 = require("../middleware/authenticate");
const serviceAuth_1 = require("../middleware/serviceAuth");
const rateLimiter_1 = require("../middleware/rateLimiter");
/**
 * The service's entire surface.
 *
 * Everything here is called by our own Laravel backends, never by a browser.
 * There is deliberately no hosted login page, no authorization endpoint and no
 * redirect flow: users stay on the application they started from.
 */
function createRoutes(authController, tokenService, clientRepo) {
    const router = (0, express_1.Router)();
    // Guards the whole surface: these endpoints trust their caller to be one of
    // our own backends, identified by its own service client secret. The client
    // quota runs after, so it can key on the identified caller.
    router.use('/api/auth', (0, serviceAuth_1.serviceAuth)(clientRepo), (0, rateLimiter_1.rateLimitClient)());
    // Identity lifecycle. register creates the account but issues no session —
    // login is the only path that does, and the only place verification is checked.
    router.post('/api/auth/register', (0, rateLimiter_1.rateLimit)('register'), authController.register);
    router.post('/api/auth/login', (0, rateLimiter_1.rateLimit)('login'), authController.login);
    router.post('/api/auth/refresh', authController.refresh);
    router.post('/api/auth/logout', authController.logout);
    // One inspection endpoint, not two. A signature-only check was easy to reach
    // for by mistake and would happily accept a token belonging to a banned
    // account; this always consults revocation and account status as well.
    router.post('/api/auth/validate-token', authController.validate);
    // Profile.
    router.get('/api/auth/me', (0, authenticate_1.authenticate)(tokenService), authController.me);
    router.patch('/api/auth/profile', (0, authenticate_1.authenticate)(tokenService), authController.updateProfile);
    router.post('/api/auth/change-password', (0, authenticate_1.authenticate)(tokenService), authController.changePassword);
    // Account recovery and verification.
    router.post('/api/auth/forgot-password', (0, rateLimiter_1.rateLimit)('sendMail'), authController.forgotPassword);
    router.post('/api/auth/reset-password', (0, rateLimiter_1.rateLimit)('redeem'), authController.resetPassword);
    router.post('/api/auth/verify-email', (0, rateLimiter_1.rateLimit)('redeem'), authController.verifyEmail);
    router.post('/api/auth/resend-verification', (0, rateLimiter_1.rateLimit)('sendMail'), authController.resendVerification);
    // Unauthenticated: used by load balancers and deploy checks.
    router.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    return router;
}
//# sourceMappingURL=index.js.map