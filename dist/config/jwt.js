"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_KID = void 0;
exports.loadKeySet = loadKeySet;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const index_1 = require("./index");
const logger_1 = require("../utils/logger");
/**
 * Stands in for the absent `kid` on tokens minted before rotation support.
 * Never appears in a JWT header — see TokenService.
 */
exports.LEGACY_KID = '__legacy__';
/**
 * Layout:
 *
 *   keys/
 *     active.key             ← contains the active kid, e.g. "2026-08"
 *     private-2026-08.pem
 *     public-2026-08.pem
 *     public-2026-02.pem     ← retired, still trusted until its tokens expire
 *
 * Retaining old *public* keys is the point of the arrangement. During a rotation,
 * tokens signed by the previous key are still in circulation for up to one
 * access-token lifetime; keeping their public half lets those verify until they
 * expire, so a rotation is a deploy rather than a forced logout.
 *
 * Delete a retired public key once nothing it signed is still live — which is
 * also how you stop trusting a compromised key.
 */
function loadKeySet() {
    const dir = path_1.default.resolve(index_1.config.jwt.keysDir);
    if (fs_1.default.existsSync(path_1.default.join(dir, 'active.key'))) {
        return loadKeyed(dir);
    }
    return loadLegacy();
}
function loadKeyed(dir) {
    const activeKid = fs_1.default.readFileSync(path_1.default.join(dir, 'active.key'), 'utf8').trim();
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(activeKid)) {
        logger_1.logger.error('active.key must contain a single kid matching [A-Za-z0-9._-]', { activeKid });
        process.exit(1);
    }
    const privatePath = path_1.default.join(dir, `private-${activeKid}.pem`);
    if (!fs_1.default.existsSync(privatePath)) {
        logger_1.logger.error(`active.key names "${activeKid}" but ${privatePath} does not exist`);
        process.exit(1);
    }
    const publicKeys = new Map();
    for (const file of fs_1.default.readdirSync(dir)) {
        const match = /^public-(.+)\.pem$/.exec(file);
        if (match) {
            publicKeys.set(match[1], fs_1.default.readFileSync(path_1.default.join(dir, file), 'utf8'));
        }
    }
    if (!publicKeys.has(activeKid)) {
        logger_1.logger.error(`No public-${activeKid}.pem to match the active private key`);
        process.exit(1);
    }
    logger_1.logger.info('Loaded signing keys', {
        active: activeKid,
        trusted: [...publicKeys.keys()].sort().join(', '),
    });
    return {
        activeKid,
        privateKey: fs_1.default.readFileSync(privatePath, 'utf8'),
        publicKeys,
    };
}
/**
 * Pre-rotation layout: a single unnamed pair. Supported so the service keeps
 * running before the first rotation, and so tokens minted without a `kid` header
 * still verify afterwards.
 */
function loadLegacy() {
    const privatePath = path_1.default.resolve(index_1.config.jwt.privateKeyPath);
    const publicPath = path_1.default.resolve(index_1.config.jwt.publicKeyPath);
    if (!fs_1.default.existsSync(privatePath) || !fs_1.default.existsSync(publicPath)) {
        logger_1.logger.error('No signing keys found. Run: npm run generate-keys');
        process.exit(1);
    }
    logger_1.logger.warn('Using the legacy single-key layout. Run `npm run rotate-keys <kid>` to move to ' +
        'named keys, which makes future rotations a deploy rather than a cutover.');
    return {
        activeKid: exports.LEGACY_KID,
        privateKey: fs_1.default.readFileSync(privatePath, 'utf8'),
        publicKeys: new Map([[exports.LEGACY_KID, fs_1.default.readFileSync(publicPath, 'utf8')]]),
    };
}
//# sourceMappingURL=jwt.js.map