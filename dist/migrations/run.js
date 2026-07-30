"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promise_1 = __importDefault(require("mysql2/promise"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
async function runMigrations() {
    const connection = await promise_1.default.createConnection({
        host: config_1.config.db.host,
        port: config_1.config.db.port,
        user: config_1.config.db.user,
        password: config_1.config.db.password,
        multipleStatements: true,
    });
    const sqlPath = path_1.default.resolve(__dirname, '../../migrations/001_initial_schema.sql');
    const sql = fs_1.default.readFileSync(sqlPath, 'utf8');
    logger_1.logger.info('Running migrations...');
    await connection.query(sql);
    logger_1.logger.info('Migrations complete.');
    await connection.end();
    process.exit(0);
}
runMigrations().catch((err) => {
    logger_1.logger.error('Migration failed', { error: err.message });
    process.exit(1);
});
//# sourceMappingURL=run.js.map