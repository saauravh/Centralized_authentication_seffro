/**
 * Proves the verification gate, which is why registration issues no session.
 *
 * Needs a second instance booted with the gate on:
 *   PORT=3002 REQUIRE_EMAIL_VERIFICATION=true npm run dev > gate.log
 *   SERVICE_SECRET=<s> SERVICE_LOG=gate.log node scripts/smoke-verification-gate.js
 */
const BASE = process.env.BASE_URL || 'http://localhost:3002';
const SECRET = process.env.SERVICE_SECRET;
const fs = require('fs');

let pass = 0, fail = 0;
const check = (n, c, d) => c ? (pass++, console.log('  PASS  ' + n))
  : (fail++, console.log('  FAIL  ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d) : '')));

async function call(path, { method = 'POST', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Service-Secret': SECRET };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const stamp = Date.now();
  const email = `gate${stamp}@example.com`;
  const password = 'GatePass123';

  console.log('\n== verification gate ==');
  const reg = await call('/api/auth/register', {
    body: { email, password, first_name: 'Gate', last_name: 'Test' },
  });
  check('register succeeds', reg.status === 201, reg.body);
  check('register flags verification_required', reg.body?.verification_required === true, reg.body);
  check('register still issues no session', !reg.body?.access_token, reg.body);

  // This is the hole that returning a token from register would have opened.
  const blocked = await call('/api/auth/login', { body: { email, password } });
  check('unverified account cannot log in', blocked.status === 403, blocked.body);
  check('distinct error code, not "wrong password"',
    blocked.body?.error?.code === 'EMAIL_NOT_VERIFIED', blocked.body);

  await sleep(500);
  const log = fs.readFileSync(process.env.SERVICE_LOG, 'utf8');
  const m = [...log.matchAll(new RegExp(
    'email/verify\\?token=([a-f0-9]+)&email=' + encodeURIComponent(email).replace(/\./g, '\\.'), 'g'))];
  check('verification link was emailed', m.length > 0);
  const token = m.length ? m[m.length - 1][1] : null;

  const verified = await call('/api/auth/verify-email', { body: { email, token } });
  check('verification succeeds', verified.status === 200, verified.body);

  const allowed = await call('/api/auth/login', { body: { email, password } });
  check('verified account can log in', allowed.status === 200, allowed.body);
  check('and receives a session', typeof allowed.body?.access_token === 'string');

  const validated = await call('/api/auth/validate-token', { token: allowed.body.access_token });
  check('validate-token accepts verified user', validated.body?.valid === true, validated.body);

  console.log(`\n---- ${pass} passed, ${fail} failed ----`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(2); });
