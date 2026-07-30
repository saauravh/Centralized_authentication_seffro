"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
const logger_1 = require("./utils/logger");
const errorHandler_1 = require("./middleware/errorHandler");
const UserRepository_1 = require("./repositories/UserRepository");
const TokenRepository_1 = require("./repositories/TokenRepository");
const TokenService_1 = require("./services/TokenService");
const AuthService_1 = require("./services/AuthService");
const AuthController_1 = require("./controllers/AuthController");
const OAuthController_1 = require("./controllers/OAuthController");
const routes_1 = require("./routes");
async function createApp() {
    const app = (0, express_1.default)();
    // View engine for auth pages
    app.set('view engine', 'ejs');
    app.set('views', path_1.default.resolve(__dirname, '../views'));
    // Middleware
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)({
        origin: config_1.config.cors.origin || true,
        credentials: true,
    }));
    app.use((0, morgan_1.default)('combined', { stream: { write: (msg) => logger_1.logger.info(msg.trim()) } }));
    app.use(express_1.default.json());
    app.use(express_1.default.urlencoded({ extended: true }));
    // Session (for OAuth authorization page)
    app.use((0, express_session_1.default)({
        secret: config_1.config.session.secret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: config_1.config.nodeEnv === 'production',
            httpOnly: true,
            maxAge: config_1.config.session.ttl,
            sameSite: 'lax',
            domain: config_1.config.nodeEnv === 'production' ? config_1.config.cookie.domain : undefined,
        },
    }));
    // Services
    const userRepo = new UserRepository_1.UserRepository();
    const tokenRepo = new TokenRepository_1.TokenRepository();
    const tokenService = new TokenService_1.TokenService();
    const authService = new AuthService_1.AuthService(userRepo, tokenRepo, tokenService);
    // Controllers
    const authController = new AuthController_1.AuthController(authService);
    const oauthController = new OAuthController_1.OAuthController(authService, tokenService, userRepo);
    // Routes
    app.use((0, routes_1.createRoutes)(authController, oauthController, tokenService));
    // Error handler
    app.use(errorHandler_1.errorHandler);
    return app;
}
//# sourceMappingURL=app.js.map