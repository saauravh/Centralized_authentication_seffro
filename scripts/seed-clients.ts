import { query } from '../src/config/database';
import { config } from '../src/config';
import { logger } from '../src/utils/logger';

const clients = [
  {
    client_id: 'seffro_client',
    client_secret: 'seffro-secret-change-in-production',
    name: 'Seffro Real Estate',
    redirect_uris: ['http://localhost:8000/auth/callback'],
    allowed_scopes: ['openid', 'profile', 'email'],
  },
  {
    client_id: 'hellpu_client',
    client_secret: 'hellpu-secret-change-in-production',
    name: 'Hellpu Handyman',
    redirect_uris: ['http://localhost:8080/auth/callback'],
    allowed_scopes: ['openid', 'profile', 'email'],
  },
  {
    client_id: 'provider_client',
    client_secret: 'provider-secret-change-in-production',
    name: 'Provider Portal',
    redirect_uris: ['http://localhost:8000/provider/auth/callback'],
    allowed_scopes: ['openid', 'profile', 'email'],
  },
];

async function seed() {
  logger.info('Seeding OAuth clients...');

  for (const client of clients) {
    await query(
      `INSERT INTO oauth_clients (client_id, client_secret, name, redirect_uris, allowed_scopes)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [
        client.client_id,
        client.client_secret,
        client.name,
        JSON.stringify(client.redirect_uris),
        JSON.stringify(client.allowed_scopes),
      ]
    );
    logger.info(`Client seeded: ${client.client_id}`);
  }

  logger.info('Seeding complete.');
  process.exit(0);
}

seed().catch((err) => {
  logger.error('Seed failed', { error: err.message });
  process.exit(1);
});
