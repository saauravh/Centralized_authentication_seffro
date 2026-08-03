/**
 * Mints a new signing key and makes it active.
 *
 *   npm run rotate-keys 2026-08
 *   npm run rotate-keys              (kid defaults to the current YYYY-MM)
 *
 * Previous *public* keys are left in place, so tokens already in circulation
 * keep verifying until they expire. That is what makes a rotation a deploy
 * instead of a forced logout — see src/config/jwt.ts.
 *
 * The private half of the retired key is deleted: nothing signs with it again,
 * and leaving it on disk is pure risk.
 *
 * To stop trusting a key entirely — a compromise, rather than routine rotation —
 * delete its public-<kid>.pem too. Every token it signed is refused immediately.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config';

function defaultKid(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function main() {
  const kid = (process.argv[2] || defaultKid()).trim();

  if (!/^[A-Za-z0-9._-]{1,64}$/.test(kid)) {
    console.error('Usage: npm run rotate-keys <kid>   (letters, digits, . _ or -)');
    process.exit(1);
  }

  const dir = path.resolve(config.jwt.keysDir);
  fs.mkdirSync(dir, { recursive: true });

  const privatePath = path.join(dir, `private-${kid}.pem`);
  const publicPath = path.join(dir, `public-${kid}.pem`);

  if (fs.existsSync(privatePath)) {
    console.error(`Refusing to overwrite ${privatePath}.`);
    console.error('Pick a different kid — reusing one would invalidate its live tokens.');
    process.exit(1);
  }

  const previous = fs.existsSync(path.join(dir, 'active.key'))
    ? fs.readFileSync(path.join(dir, 'active.key'), 'utf8').trim()
    : null;

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  fs.writeFileSync(privatePath, privateKey, { mode: 0o600 });
  fs.writeFileSync(publicPath, publicKey, { mode: 0o644 });
  fs.writeFileSync(path.join(dir, 'active.key'), kid + '\n');

  // Retire the previous private key. Its public half stays for verification.
  if (previous && previous !== kid) {
    const retired = path.join(dir, `private-${previous}.pem`);
    if (fs.existsSync(retired)) {
      fs.rmSync(retired);
    }
  }

  const trusted = fs
    .readdirSync(dir)
    .map((f) => /^public-(.+)\.pem$/.exec(f)?.[1])
    .filter(Boolean)
    .sort();

  console.log('');
  console.log(`  Active kid:      ${kid}`);
  if (previous) {
    console.log(`  Previous kid:    ${previous}  (public key kept; private key deleted)`);
  }
  console.log(`  Trusted for verification: ${trusted.join(', ')}`);
  console.log('');
  console.log('  Deploy this to every application as CENTRAL_AUTH_PUBLIC_KEYS:');
  console.log('');
  console.log('    ' + envLine(dir, trusted as string[]));
  console.log('');
  console.log('  Then restart the identity service. Tokens signed by the previous');
  console.log('  key keep working until they expire — no forced logout.');
  console.log('');
  console.log('  Once nothing the old key signed is still live, delete');
  console.log(`  keys/public-${previous ?? '<old-kid>'}.pem to stop trusting it.`);
  console.log('');

  process.exit(0);
}

/** Builds the single-line env value the Laravel apps consume. */
function envLine(dir: string, kids: string[]): string {
  const map: Record<string, string> = {};
  for (const kid of kids) {
    map[kid] = fs.readFileSync(path.join(dir, `public-${kid}.pem`), 'utf8').trim();
  }

  return `CENTRAL_AUTH_PUBLIC_KEYS='${JSON.stringify(map)}'`;
}

main();
