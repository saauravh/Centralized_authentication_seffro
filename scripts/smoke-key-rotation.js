/**
 * Proves a key rotation is a deploy, not a forced logout.
 *
 * Runs entirely in a temporary key directory, so it never touches keys/.
 *
 *   SERVICE_SECRET=<secret> node scripts/smoke-key-rotation.js
 *
 * Needs a service on BASE_URL only for the final live check; the key mechanics
 * are exercised directly against TokenService.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

let pass = 0, fail = 0;
const check = (n, c, d) => c ? (pass++, console.log('  PASS  ' + n))
  : (fail++, console.log('  FAIL  ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d) : '')));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keyrot-'));
process.env.JWT_KEYS_DIR = dir;
process.env.JWT_ISSUER = 'seffro-identity';

// Loaded after JWT_KEYS_DIR is set, since config reads env at import time.
const { execFileSync } = require('child_process');

const USER = {
  id: 42, email: 'rot@example.com', first_name: 'Rot', last_name: 'Ate',
  email_verified_at: new Date(),
};

function rotate(kid) {
  execFileSync(process.execPath, [
    require.resolve('ts-node/dist/bin'), path.join(__dirname, '../src/cli/rotate-keys.ts'), kid,
  ], { env: { ...process.env, JWT_KEYS_DIR: dir }, stdio: 'pipe' });
}

// Fresh TokenService each time — it reads the key set at construction, the same
// as the real service does at boot.
function tokenService() {
  for (const k of Object.keys(require.cache)) {
    if (k.includes('TokenService') || k.includes('config')) delete require.cache[k];
  }
  const { TokenService } = require('../src/services/TokenService');
  return new TokenService();
}

require('ts-node').register({ transpileOnly: true });

(async () => {
  console.log('\n== first rotation: legacy layout becomes a named key ==');
  rotate('2026-01');
  check('active.key written', fs.readFileSync(path.join(dir, 'active.key'), 'utf8').trim() === '2026-01');
  check('private key created', fs.existsSync(path.join(dir, 'private-2026-01.pem')));
  check('public key created', fs.existsSync(path.join(dir, 'public-2026-01.pem')));

  const svc1 = tokenService();
  const tokenV1 = svc1.generateAccessToken(USER);
  const header1 = JSON.parse(Buffer.from(tokenV1.split('.')[0], 'base64url').toString());
  check('kid stamped in the header', header1.kid === '2026-01', header1);
  check('still RS256', header1.alg === 'RS256', header1);
  check('token verifies', svc1.verifyAccessToken(tokenV1).sub === 42);

  console.log('\n== second rotation: the overlap window ==');
  rotate('2026-08');
  const svc2 = tokenService();

  check('active kid moved', svc2.getActiveKid() === '2026-08', svc2.getActiveKid());
  check('old private key deleted', !fs.existsSync(path.join(dir, 'private-2026-01.pem')));
  check('old public key retained', fs.existsSync(path.join(dir, 'public-2026-01.pem')));

  // The whole point: a token issued a minute before the rotation must survive.
  let survived = true;
  try { svc2.verifyAccessToken(tokenV1); } catch (e) { survived = false; }
  check('token from the OLD key still verifies (no forced logout)', survived);

  const tokenV2 = svc2.generateAccessToken(USER);
  const header2 = JSON.parse(Buffer.from(tokenV2.split('.')[0], 'base64url').toString());
  check('new tokens carry the new kid', header2.kid === '2026-08', header2);
  check('new token verifies', svc2.verifyAccessToken(tokenV2).sub === 42);

  console.log('\n== retiring a key stops trusting it ==');
  fs.rmSync(path.join(dir, 'public-2026-01.pem'));
  const svc3 = tokenService();

  let stillWorks = true;
  try { svc3.verifyAccessToken(tokenV1); } catch { stillWorks = false; }
  check('token from the retired key is now refused', !stillWorks);
  check('current token unaffected', svc3.verifyAccessToken(tokenV2).sub === 42);

  console.log('\n== a token naming an unknown kid is refused ==');
  const foreign = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const forged = jwt.sign({ iss: 'seffro-identity', sub: 42 }, foreign.privateKey, {
    algorithm: 'RS256', expiresIn: 900, keyid: '2026-08',
  });
  let accepted = true;
  try { svc3.verifyAccessToken(forged); } catch { accepted = false; }
  check('token claiming a known kid but signed by a foreign key is refused', !accepted);

  const unknownKid = jwt.sign({ iss: 'seffro-identity', sub: 42 }, foreign.privateKey, {
    algorithm: 'RS256', expiresIn: 900, keyid: 'not-a-real-kid',
  });
  let accepted2 = true;
  try { svc3.verifyAccessToken(unknownKid); } catch { accepted2 = false; }
  check('token naming an unknown kid is refused', !accepted2);

  console.log('\n== the env line for the applications ==');
  const out = execFileSync(process.execPath, [
    require.resolve('ts-node/dist/bin'), path.join(__dirname, '../src/cli/rotate-keys.ts'), '2026-09',
  ], { env: { ...process.env, JWT_KEYS_DIR: dir }, encoding: 'utf8' });
  // Match the assignment, not the prose line above it that names the variable.
  const line = out.split('\n').find((l) => l.includes("CENTRAL_AUTH_PUBLIC_KEYS='"));
  check('rotate-keys prints the env line', !!line);
  const json = line && line.slice(line.indexOf("'") + 1, line.lastIndexOf("'"));
  let parsed = null;
  try { parsed = JSON.parse(json); } catch {}
  check('env line is valid JSON', parsed !== null);
  check('map contains both live kids', parsed && parsed['2026-08'] && parsed['2026-09'], parsed && Object.keys(parsed));
  check('map excludes the deleted kid', parsed && !parsed['2026-01'], parsed && Object.keys(parsed));

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n---- ${pass} passed, ${fail} failed ----`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(2); });
