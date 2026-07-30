import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';

async function runMigrations() {
  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });

  const sqlPath = path.resolve(__dirname, '../../migrations/001_initial_schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  logger.info('Running migrations...');
  await connection.query(sql);
  logger.info('Migrations complete.');

  await connection.end();
  process.exit(0);
}

runMigrations().catch((err) => {
  logger.error('Migration failed', { error: err.message });
  process.exit(1);
});
