import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';

// Migrations that target the *consumer* app databases (seffro, helou) rather than
// central_auth. They are applied by each Laravel app, not by this runner.
const APP_MIGRATIONS = new Set(['002_add_central_user_id_apps.sql']);

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

async function runMigrations() {
  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !APP_MIGRATIONS.has(f))
    .sort();

  if (files.length === 0) {
    logger.warn('No migrations found');
    await connection.end();
    return;
  }

  // Bootstrap the database and the ledger before anything else, so that every
  // migration file — including the first — goes through the same applied/skipped
  // check. Re-running the first file unconditionally would undo later ones: it
  // uses CREATE TABLE IF NOT EXISTS, so it silently recreates tables a
  // subsequent migration had dropped.
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.db.name}\`
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await connection.query(`USE \`${config.db.name}\``);
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  const [applied] = await connection.query('SELECT filename FROM schema_migrations');
  const done = new Set((applied as { filename: string }[]).map((r) => r.filename));

  for (const file of files) {
    if (done.has(file)) {
      logger.info(`Skipping ${file} (already applied)`);
      continue;
    }

    logger.info(`Applying ${file}`);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await connection.query(sql);
    await connection.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
  }

  logger.info('Migrations complete.');
  await connection.end();
}

runMigrations()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Migration failed', { error: err.message });
    process.exit(1);
  });
