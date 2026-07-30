"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadJwtKeys = loadJwtKeys;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const index_1 = require("./index");
function loadJwtKeys() {
    const privateKeyPath = path_1.default.resolve(index_1.config.jwt.privateKeyPath);
    const publicKeyPath = path_1.default.resolve(index_1.config.jwt.publicKeyPath);
    if (!fs_1.default.existsSync(privateKeyPath) || !fs_1.default.existsSync(publicKeyPath)) {
        console.error('JWT keys not found. Run: npm run generate-keys');
        process.exit(1);
    }
    const privateKey = fs_1.default.readFileSync(privateKeyPath, 'utf8');
    const publicKey = fs_1.default.readFileSync(publicKeyPath, 'utf8');
    return { privateKey, publicKey };
}
//# sourceMappingURL=jwt.js.map