import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { config } from '../src/config';
import { logger } from '../src/utils/logger';

interface SourceUser {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  role: string;
  platform: string;
  local_id: number;
}

async function migrateUsers() {
  const centralConn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
  });

  logger.info('Starting user migration...');

  // --- Migrate from helppu-1 ---
  try {
    const helppuConn = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: 'helou',
    });

    logger.info('Connected to helppu-1 database');

    // Migrate regular users
    const [users] = await helppuConn.execute(
      'SELECT id, email, password, name, mobile FROM users'
    ) as any;

    for (const user of users) {
      const nameParts = (user.name || 'User').split(' ');
      const firstName = nameParts[0] || 'User';
      const lastName = nameParts.slice(1).join(' ') || 'Unknown';

      const centralId = await upsertCentralUser(centralConn, {
        email: user.email,
        password: user.password,
        first_name: firstName,
        last_name: lastName,
        phone: user.mobile || null,
        role: 'customer',
        platform: 'hellpu',
        local_id: user.id,
      });

      // Add central_user_id to helppu users table
      await helppuConn.execute(
        'UPDATE users SET central_user_id = ? WHERE id = ?',
        [centralId, user.id]
      );

      logger.info(`Migrated helppu user ${user.email} → central_id ${centralId}`);
    }

    // Migrate providers
    const [providers] = await helppuConn.execute(
      'SELECT id, email, password, name, mobile FROM providers'
    ) as any;

    for (const provider of providers) {
      const nameParts = (provider.name || 'Provider').split(' ');
      const firstName = nameParts[0] || 'Provider';
      const lastName = nameParts.slice(1).join(' ') || 'Unknown';

      const centralId = await upsertCentralUser(centralConn, {
        email: provider.email,
        password: provider.password,
        first_name: firstName,
        last_name: lastName,
        phone: provider.mobile || null,
        role: 'provider',
        platform: 'hellpu',
        local_id: provider.id,
      });

      await helppuConn.execute(
        'UPDATE providers SET central_user_id = ? WHERE id = ?',
        [centralId, provider.id]
      );

      logger.info(`Migrated helppu provider ${provider.email} → central_id ${centralId}`);
    }

    // Migrate handymen
    const [handymen] = await helppuConn.execute(
      'SELECT id, email, password, name, mobile FROM handymen'
    ) as any;

    for (const handyman of handymen) {
      const nameParts = (handyman.name || 'Handyman').split(' ');
      const firstName = nameParts[0] || 'Handyman';
      const lastName = nameParts.slice(1).join(' ') || 'Unknown';

      const centralId = await upsertCentralUser(centralConn, {
        email: handyman.email,
        password: handyman.password,
        first_name: firstName,
        last_name: lastName,
        phone: handyman.mobile || null,
        role: 'handyman',
        platform: 'hellpu',
        local_id: handyman.id,
      });

      await helppuConn.execute(
        'UPDATE handymen SET central_user_id = ? WHERE id = ?',
        [centralId, handyman.id]
      );

      logger.info(`Migrated helppu handyman ${handyman.email} → central_id ${centralId}`);
    }

    await helppuConn.end();
    logger.info('helppu-1 migration complete');
  } catch (err: any) {
    logger.error('helppu-1 migration failed', { error: err.message });
  }

  // --- Migrate from seffro_jun ---
  try {
    const seffroConn = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: 'seffro_db',
    });

    logger.info('Connected to seffro_jun database');

    // Migrate users
    const [sUsers] = await seffroConn.execute(
      'SELECT id, email, password, first_name, last_name, phone FROM users'
    ) as any;

    for (const user of sUsers) {
      const centralId = await upsertCentralUser(centralConn, {
        email: user.email,
        password: user.password,
        first_name: user.first_name || 'User',
        last_name: user.last_name || 'Unknown',
        phone: user.phone || null,
        role: 'user',
        platform: 'seffro',
        local_id: user.id,
      });

      await seffroConn.execute(
        'UPDATE users SET central_user_id = ? WHERE id = ?',
        [centralId, user.id]
      );

      logger.info(`Migrated seffro user ${user.email} → central_id ${centralId}`);
    }

    // Migrate vendors
    const [vendors] = await seffroConn.execute(
      'SELECT id, email, password, first_name, last_name, phone FROM vendors'
    ) as any;

    for (const vendor of vendors) {
      const centralId = await upsertCentralUser(centralConn, {
        email: vendor.email,
        password: vendor.password,
        first_name: vendor.first_name || 'Vendor',
        last_name: vendor.last_name || 'Unknown',
        phone: vendor.phone || null,
        role: 'vendor',
        platform: 'seffro',
        local_id: vendor.id,
      });

      await seffroConn.execute(
        'UPDATE vendors SET central_user_id = ? WHERE id = ?',
        [centralId, vendor.id]
      );

      logger.info(`Migrated seffro vendor ${vendor.email} → central_id ${centralId}`);
    }

    // Migrate agents
    const [agents] = await seffroConn.execute(
      'SELECT id, email, password, first_name, last_name, phone FROM agents'
    ) as any;

    for (const agent of agents) {
      const centralId = await upsertCentralUser(centralConn, {
        email: agent.email,
        password: agent.password,
        first_name: agent.first_name || 'Agent',
        last_name: agent.last_name || 'Unknown',
        phone: agent.phone || null,
        role: 'agent',
        platform: 'seffro',
        local_id: agent.id,
      });

      await seffroConn.execute(
        'UPDATE agents SET central_user_id = ? WHERE id = ?',
        [centralId, agent.id]
      );

      logger.info(`Migrated seffro agent ${agent.email} → central_id ${centralId}`);
    }

    await seffroConn.end();
    logger.info('seffro_jun migration complete');
  } catch (err: any) {
    logger.error('seffro_jun migration failed', { error: err.message });
  }

  await centralConn.end();
  logger.info('User migration complete!');
  process.exit(0);
}

async function upsertCentralUser(
  conn: mysql.Connection,
  user: SourceUser
): Promise<number> {
  const [existing] = await conn.execute(
    'SELECT id FROM central_users WHERE email = ?',
    [user.email]
  ) as any;

  if (existing.length > 0) {
    return existing[0].id;
  }

  // Password is already bcrypt-hashed from Laravel, store as-is
  const [result] = await conn.execute(
    `INSERT INTO central_users (email, password, first_name, last_name, phone, email_verified)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [user.email, user.password, user.first_name || 'User', user.last_name || 'Unknown', user.phone || null]
  ) as any;

  return result.insertId;
}

migrateUsers().catch((err) => {
  logger.error('Migration failed', { error: err.message });
  process.exit(1);
});
