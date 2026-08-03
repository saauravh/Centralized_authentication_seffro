/**
 * Provisions a service client and prints its secret.
 *
 *   npm run create-client seffro
 *   npm run create-client helppu
 *
 * The secret is shown once and only its hash is stored — there is no way to read
 * it back. Re-running for an existing name rotates the secret.
 */
import { ServiceClientRepository } from '../repositories/ServiceClientRepository';
import { logger } from '../utils/logger';

async function main() {
  const name = process.argv[2];

  if (!name || !/^[a-z0-9_-]{2,100}$/i.test(name)) {
    console.error('Usage: npm run create-client <name>   (letters, digits, _ or -)');
    process.exit(1);
  }

  const repo = new ServiceClientRepository();
  const { secret } = await repo.create(name);

  console.log('');
  console.log(`  Service client:  ${name}`);
  console.log(`  Secret:          ${secret}`);
  console.log('');
  console.log('  Add to that application\'s .env:');
  console.log(`    CENTRAL_AUTH_SERVICE_SECRET=${secret}`);
  console.log('');
  console.log('  Shown once — it is stored only as a hash.');
  console.log('');

  process.exit(0);
}

main().catch((err) => {
  logger.error('Failed to create service client', { error: err.message });
  process.exit(1);
});
