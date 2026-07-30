"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const jwt_1 = require("../config/jwt");
const uuid_1 = require("uuid");
class TokenService {
    privateKey;
    publicKey;
    constructor() {
        const keys = (0, jwt_1.loadJwtKeys)();
        this.privateKey = keys.privateKey;
        this.publicKey = keys.publicKey;
    }
    generateAccessToken(user) {
        const now = Math.floor(Date.now() / 1000);
        const payload = {
            iss: config_1.config.jwt.issuer,
            sub: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            email_verified: user.email_verified === 1,
            iat: now,
            exp: now + config_1.config.jwt.accessTtl,
            jti: (0, uuid_1.v4)(),
        };
        return jsonwebtoken_1.default.sign(payload, this.privateKey, { algorithm: 'RS256' });
    }
    verifyAccessToken(token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, this.publicKey, {
                algorithms: ['RS256'],
                issuer: config_1.config.jwt.issuer,
            });
            return decoded;
        }
        catch (err) {
            if (err.name === 'TokenExpiredError') {
                throw new Error('Token expired');
            }
            throw new Error('Invalid token');
        }
    }
    getPublicKey() {
        return this.publicKey;
    }
    getJwks() {
        const pubKey = this.publicKey;
        const pemLines = pubKey
            .replace('-----BEGIN PUBLIC KEY-----', '')
            .replace('-----END PUBLIC KEY-----', '')
            .replace(/\n/g, '');
        const buf = Buffer.from(pemLines, 'base64');
        const modulusStart = 25; // ASN.1 offset for RSA public key
        const modulusLength = buf.readUInt32BE(modulusStart + 1);
        const modulus = buf.subarray(modulusStart + 5, modulusStart + 5 + modulusLength);
        const expStart = modulusStart + 5 + modulusLength + 4;
        const exponentLength = buf[expStart - 1];
        const exponent = buf.subarray(expStart, expStart + exponentLength);
        return {
            keys: [
                {
                    kty: 'RSA',
                    use: 'sig',
                    alg: 'RS256',
                    kid: 'key-2026-01',
                    n: this.base64url(modulus),
                    e: this.base64url(exponent),
                },
            ],
        };
    }
    base64url(buffer) {
        return buffer
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }
}
exports.TokenService = TokenService;
//# sourceMappingURL=TokenService.js.map