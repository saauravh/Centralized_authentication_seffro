"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRepository = void 0;
const database_1 = require("../config/database");
const bcrypt_1 = __importDefault(require("bcrypt"));
const SALT_ROUNDS = 10;
class UserRepository {
    async findByEmail(email) {
        return (0, database_1.queryOne)('SELECT * FROM central_users WHERE email = ?', [email]);
    }
    async findById(id) {
        return (0, database_1.queryOne)('SELECT * FROM central_users WHERE id = ?', [id]);
    }
    async create(input) {
        const hashedPassword = await bcrypt_1.default.hash(input.password, SALT_ROUNDS);
        const result = await (0, database_1.query)(`INSERT INTO central_users (email, password, first_name, last_name, phone)
       VALUES (?, ?, ?, ?, ?)`, [input.email, hashedPassword, input.first_name, input.last_name, input.phone || null]);
        return this.findById(result.insertId);
    }
    async updateLastLogin(id) {
        await (0, database_1.query)('UPDATE central_users SET last_login_at = NOW() WHERE id = ?', [id]);
    }
    async verifyEmail(id) {
        await (0, database_1.query)('UPDATE central_users SET email_verified = 1 WHERE id = ?', [id]);
    }
    async updatePassword(id, newPassword) {
        const hashed = await bcrypt_1.default.hash(newPassword, SALT_ROUNDS);
        await (0, database_1.query)('UPDATE central_users SET password = ? WHERE id = ?', [hashed, id]);
    }
    async comparePassword(plain, hashed) {
        return bcrypt_1.default.compare(plain, hashed);
    }
    toPublic(user) {
        return {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            phone: user.phone,
            email_verified: user.email_verified === 1,
            status: user.status,
        };
    }
}
exports.UserRepository = UserRepository;
//# sourceMappingURL=UserRepository.js.map