import fs from 'fs';
import path from 'path';
import { config } from './index';
import { logger } from '../utils/logger';

/**
 * Stands in for the absent `kid` on tokens minted before rotation support.
 * Never appears in a JWT header — see TokenService.
 */
export const LEGACY_KID = '__legacy__';

export interface KeySet {
  /** kid of the key new tokens are signed with. */
  activeKid: string;
  /** Private key for the active kid. Only one is ever loaded. */
  privateKey: string;
  /** Every public key we still trust, by kid. */
  publicKeys: Map<string, string>;
}

/**
 * Layout:
 *
 *   keys/
 *     active.key             ← contains the active kid, e.g. "2026-08"
 *     private-2026-08.pem
 *     public-2026-08.pem
 *     public-2026-02.pem     ← retired, still trusted until its tokens expire
 *
 * Retaining old *public* keys is the point of the arrangement. During a rotation,
 * tokens signed by the previous key are still in circulation for up to one
 * access-token lifetime; keeping their public half lets those verify until they
 * expire, so a rotation is a deploy rather than a forced logout.
 *
 * Delete a retired public key once nothing it signed is still live — which is
 * also how you stop trusting a compromised key.
 */
export function loadKeySet(): KeySet {
  const dir = path.resolve(config.jwt.keysDir);

  if (fs.existsSync(path.join(dir, 'active.key'))) {
    return loadKeyed(dir);
  }

  return loadLegacy();
}

function loadKeyed(dir: string): KeySet {
  const activeKid = fs.readFileSync(path.join(dir, 'active.key'), 'utf8').trim();

  if (!/^[A-Za-z0-9._-]{1,64}$/.test(activeKid)) {
    logger.error('active.key must contain a single kid matching [A-Za-z0-9._-]', { activeKid });
    process.exit(1);
  }

  const privatePath = path.join(dir, `private-${activeKid}.pem`);
  if (!fs.existsSync(privatePath)) {
    logger.error(`active.key names "${activeKid}" but ${privatePath} does not exist`);
    process.exit(1);
  }

  const publicKeys = new Map<string, string>();
  for (const file of fs.readdirSync(dir)) {
    const match = /^public-(.+)\.pem$/.exec(file);
    if (match) {
      publicKeys.set(match[1], fs.readFileSync(path.join(dir, file), 'utf8'));
    }
  }

  if (!publicKeys.has(activeKid)) {
    logger.error(`No public-${activeKid}.pem to match the active private key`);
    process.exit(1);
  }

  logger.info('Loaded signing keys', {
    active: activeKid,
    trusted: [...publicKeys.keys()].sort().join(', '),
  });

  return {
    activeKid,
    privateKey: fs.readFileSync(privatePath, 'utf8'),
    publicKeys,
  };
}

/**
 * Pre-rotation layout: a single unnamed pair. Supported so the service keeps
 * running before the first rotation, and so tokens minted without a `kid` header
 * still verify afterwards.
 */
function loadLegacy(): KeySet {
  const privatePath = path.resolve(config.jwt.privateKeyPath);
  const publicPath = path.resolve(config.jwt.publicKeyPath);

  if (!fs.existsSync(privatePath) || !fs.existsSync(publicPath)) {
    logger.error('No signing keys found. Run: npm run generate-keys');
    process.exit(1);
  }

  logger.warn(
    'Using the legacy single-key layout. Run `npm run rotate-keys <kid>` to move to ' +
      'named keys, which makes future rotations a deploy rather than a cutover.'
  );

  return {
    activeKid: LEGACY_KID,
    privateKey: fs.readFileSync(privatePath, 'utf8'),
    publicKeys: new Map([[LEGACY_KID, fs.readFileSync(publicPath, 'utf8')]]),
  };
}
