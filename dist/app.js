"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const config_1 = require("./config");
const logger_1 = require("./utils/logger");
const errorHandler_1 = require("./middleware/errorHandler");
const UserRepository_1 = require("./repositories/UserRepository");
const TokenRepository_1 = require("./repositories/TokenRepository");
const AuthTokenRepository_1 = require("./repositories/AuthTokenRepository");
const SsoTicketRepository_1 = require("./repositories/SsoTicketRepository");
const LoginHistoryRepository_1 = require("./repositories/LoginHistoryRepository");
const RevocationRepository_1 = require("./repositories/RevocationRepository");
const ServiceClientRepository_1 = require("./repositories/ServiceClientRepository");
const TokenService_1 = require("./services/TokenService");
const EmailService_1 = require("./services/EmailService");
const AuthService_1 = require("./services/AuthService");
const AuthController_1 = require("./controllers/AuthController");
const routes_1 = require("./routes");
/**
 * Headless identity service.
 *
 * No view engine and no session middleware: this process serves JSON to our own
 * Laravel backends and nothing else. Users never reach it with a browser.
 */
async function createApp() {
    const app = (0, express_1.default)();
    // Requests arrive from the Laravel backends, which forward the end user's
    // address. Without this, req.ip is always the app server and the per-IP rate
    // limits are meaningless.
    app.set('trust proxy', true);
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)({
        origin: config_1.config.cors.origin || true,
        credentials: true,
    }));
    app.use((0, morgan_1.default)('combined', { stream: { write: (msg) => logger_1.logger.info(msg.trim()) } }));
    app.use(express_1.default.json());
    app.use(express_1.default.urlencoded({ extended: true }));
    // Services
    const userRepo = new UserRepository_1.UserRepository();
    const tokenRepo = new TokenRepository_1.TokenRepository();
    const authTokenRepo = new AuthTokenRepository_1.AuthTokenRepository();
    const ssoTicketRepo = new SsoTicketRepository_1.SsoTicketRepository();
    const historyRepo = new LoginHistoryRepository_1.LoginHistoryRepository();
    const revocationRepo = new RevocationRepository_1.RevocationRepository();
    const clientRepo = new ServiceClientRepository_1.ServiceClientRepository();
    const tokenService = new TokenService_1.TokenService();
    const emailService = new EmailService_1.EmailService();
    const authService = new AuthService_1.AuthService(userRepo, tokenRepo, tokenService, authTokenRepo, emailService, historyRepo, revocationRepo, ssoTicketRepo);
    const authController = new AuthController_1.AuthController(authService);
    app.use((0, routes_1.createRoutes)(authController, tokenService, clientRepo));
    app.use(errorHandler_1.errorHandler);
    return app;
}
//# sourceMappingURL=app.js.map