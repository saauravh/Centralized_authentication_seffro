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
// Migrations that target the *consumer* app databases (seffro, helou) rather than
// central_auth. They are applied by each Laravel app, not by this runner.
const APP_MIGRATIONS = new Set(['002_add_central_user_id_apps.sql']);
const MIGRATIONS_DIR = path_1.default.resolve(__dirname, '../../migrations');
async function runMigrations() {
    const connection = await promise_1.default.createConnection({
        host: config_1.config.db.host,
        port: config_1.config.db.port,
        user: config_1.config.db.user,
        password: config_1.config.db.password,
        multipleStatements: true,
    });
    const files = fs_1.default
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql') && !APP_MIGRATIONS.has(f))
        .sort();
    if (files.length === 0) {
        logger_1.logger.warn('No migrations found');
        await connection.end();
        return;
    }
    // Bootstrap the database and the ledger before anything else, so that every
    // migration file — including the first — goes through the same applied/skipped
    // check. Re-running the first file unconditionally would undo later ones: it
    // uses CREATE TABLE IF NOT EXISTS, so it silently recreates tables a
    // subsequent migration had dropped.
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${config_1.config.db.name}\`
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.query(`USE \`${config_1.config.db.name}\``);
    await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
    const [applied] = await connection.query('SELECT filename FROM schema_migrations');
    const done = new Set(applied.map((r) => r.filename));
    for (const file of files) {
        if (done.has(file)) {
            logger_1.logger.info(`Skipping ${file} (already applied)`);
            continue;
        }
        logger_1.logger.info(`Applying ${file}`);
        const sql = fs_1.default.readFileSync(path_1.default.join(MIGRATIONS_DIR, file), 'utf8');
        await connection.query(sql);
        await connection.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
    }
    logger_1.logger.info('Migrations complete.');
    await connection.end();
}
runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
    logger_1.logger.error('Migration failed', { error: err.message });
    process.exit(1);
});
//# sourceMappingURL=run.js.map