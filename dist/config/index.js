"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    db: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        name: process.env.DB_NAME || 'central_auth',
    },
    redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
    },
    session: {
        secret: process.env.SESSION_SECRET || 'dev-secret',
        ttl: parseInt(process.env.SESSION_TTL || '86400000', 10),
    },
    jwt: {
        issuer: process.env.JWT_ISSUER || 'seffro-identity',
        accessTtl: parseInt(process.env.JWT_ACCESS_TTL || '900', 10),
        refreshTtl: parseInt(process.env.JWT_REFRESH_TTL || '604800', 10),
        privateKeyPath: process.env.JWT_PRIVATE_KEY_PATH || './keys/private.pem',
        publicKeyPath: process.env.JWT_PUBLIC_KEY_PATH || './keys/public.pem',
        privateKey: '',
        publicKey: '',
    },
    smtp: {
        host: process.env.SMTP_HOST || '',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
        from: process.env.SMTP_FROM || 'noreply@seffro.com',
    },
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
    },
    cookie: {
        domain: process.env.COOKIE_DOMAIN || '.seffro.com',
        secret: process.env.COOKIE_SECRET || 'cookie-secret',
    },
};
//# sourceMappingURL=index.js.map