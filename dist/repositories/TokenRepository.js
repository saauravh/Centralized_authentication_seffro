"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenRepository = void 0;
const database_1 = require("../config/database");
const crypto_1 = __importDefault(require("crypto"));
class TokenRepository {
    /** 256 bits of CSPRNG output. Opaque to clients; only its hash is stored. */
    generateRefreshToken() {
        return crypto_1.default.randomBytes(32).toString('hex');
    }
    hashToken(token) {
        return crypto_1.default.createHash('sha256').update(token).digest('hex');
    }
    async create(userId, tokenHash, deviceName, ipAddress, ttlSeconds) {
        await (0, database_1.query)(`INSERT INTO refresh_tokens (user_id, token_hash, device_name, ip_address, expires_at)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`, [userId, tokenHash, deviceName, ipAddress, ttlSeconds]);
    }
    async findByHash(tokenHash) {
        return (0, database_1.queryOne)('SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()', [tokenHash]);
    }
    async revoke(tokenHash) {
        await (0, database_1.query)('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL', [tokenHash]);
    }
    async revokeAllForUser(userId) {
        await (0, database_1.query)('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [userId]);
    }
}
exports.TokenRepository = TokenRepository;
//# sourceMappingURL=TokenRepository.js.map