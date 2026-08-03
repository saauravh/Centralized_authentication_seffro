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
    keys;
    constructor() {
        this.keys = (0, jwt_1.loadKeySet)();
    }
    generateAccessToken(user) {
        const now = Math.floor(Date.now() / 1000);
        const payload = {
            iss: config_1.config.jwt.issuer,
            sub: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            email_verified: user.email_verified_at !== null,
            iat: now,
            exp: now + config_1.config.jwt.accessTtl,
            jti: (0, uuid_1.v4)(),
        };
        return jsonwebtoken_1.default.sign(payload, this.keys.privateKey, {
            algorithm: 'RS256',
            // The internal placeholder never goes on the wire — a token from the
            // pre-rotation layout stays header-less, exactly as it was before.
            ...(this.keys.activeKid === jwt_1.LEGACY_KID ? {} : { keyid: this.keys.activeKid }),
        });
    }
    /**
     * Verifies against the key the token names.
     *
     * `kid` selects which of our public keys to try — it is a lookup, not a
     * credential. An unrecognised or absent kid falls back to the single trusted
     * key when there is exactly one, which is what lets tokens minted before
     * rotation survive the cutover; with several keys loaded, a token that names
     * none of them is rejected rather than tried against each in turn.
     */
    verifyAccessToken(token) {
        const key = this.publicKeyFor(token);
        if (!key) {
            throw new Error('Invalid token');
        }
        try {
            const decoded = jsonwebtoken_1.default.verify(token, key, {
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
    publicKeyFor(token) {
        const kid = readKid(token);
        if (kid) {
            return this.keys.publicKeys.get(kid) ?? null;
        }
        // No kid: either a pre-rotation token, or a forged header. Only unambiguous
        // when we trust exactly one key.
        if (this.keys.publicKeys.size === 1) {
            return [...this.keys.publicKeys.values()][0];
        }
        return this.keys.publicKeys.get(jwt_1.LEGACY_KID) ?? null;
    }
    /** kid of the key currently signing tokens. Exposed for diagnostics. */
    getActiveKid() {
        return this.keys.activeKid;
    }
    /**
     * The apps verify tokens with these, deployed as CENTRAL_AUTH_PUBLIC_KEYS.
     * There is no JWKS endpoint: JWKS exists so unknown third-party clients can
     * discover a key, and every consumer here is one of ours, configured at
     * deploy time.
     */
    getPublicKeys() {
        return Object.fromEntries(this.keys.publicKeys);
    }
}
exports.TokenService = TokenService;
/** Reads the kid from the JWT header without verifying anything. */
function readKid(token) {
    const segment = token.split('.')[0];
    if (!segment)
        return null;
    try {
        const header = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
        return typeof header.kid === 'string' ? header.kid : null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=TokenService.js.map