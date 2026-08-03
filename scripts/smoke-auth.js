// End-to-end smoke test against a running identity service + real MySQL.
const BASE = 'http://localhost:3001';
const SECRET = process.env.SERVICE_SECRET;
const mysql = require('mysql2/promise');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' -> ' + JSON.stringify(detail) : ''}`); }
}

async function call(path, { method = 'POST', body, token, secret = SECRET } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['X-Service-Secret'] = secret;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

// Reach into the DB to read the raw token the "email" would have carried.
async function latestToken(table, email) {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: 'central_auth',
  });
  const [rows] = await c.query(
    `SELECT t.token_hash FROM ${table} t JOIN central_users u ON u.id = t.user_id
     WHERE u.email = ? AND t.used_at IS NULL ORDER BY t.id DESC LIMIT 1`, [email]);
  await c.end();
  return rows[0] ? rows[0].token_hash : null;
}

(async () => {
  const stamp = Date.now();
  const email = `smoke${stamp}@example.com`;
  const other = `other${stamp}@example.com`;
  const password = 'OriginalPass123';

  console.log('\n== service auth ==');
  const noSecret = await call('/api/auth/login', { body: { email, password }, secret: null });
  check('rejects request with no service secret', noSecret.status === 401, noSecret.body);
  const badSecret = await call('/api/auth/login', { body: { email, password }, secret: 'wrong' });
  check('rejects request with wrong service secret', badSecret.status === 401, badSecret.body);

  console.log('\n== register ==');
  const reg = await call('/api/auth/register', {
    body: { email, password, first_name: 'Smoke', last_name: 'Test', phone: '5551234' },
  });
  check('register returns 201', reg.status === 201, reg.body);
  check('register returns central_user_id', typeof reg.body?.central_user_id === 'number', reg.body);
  // Registration and authentication are separate steps — see AuthService.register.
  check('register issues no session', !reg.body?.access_token && !reg.body?.refresh_token, reg.body);
  const userId = reg.body?.central_user_id;

  const dup = await call('/api/auth/register', {
    body: { email, password, first_name: 'Dupe', last_name: 'Test' },
  });
  check('existing email returns 200, not an error', dup.status === 200, dup.body);
  check('existing email reports user_exists', dup.body?.user_exists === true, dup.body);
  check('existing email leaks no central id', dup.body?.central_user_id === undefined, dup.body);

  // Registering over an existing address must not change its password.
  const stillOriginal = await call('/api/auth/login', { body: { email, password } });
  check('existing password survives a re-register attempt', stillOriginal.status === 200, stillOriginal.body);

  const weak = await call('/api/auth/register', {
    body: { email: `w${stamp}@example.com`, password: 'short', first_name: 'A', last_name: 'B' },
  });
  check('short password returns 400', weak.status === 400, weak.body);

  console.log('\n== login ==');
  const badLogin = await call('/api/auth/login', { body: { email, password: 'WrongPass123' } });
  check('wrong password returns 401', badLogin.status === 401, badLogin.body);

  const login = await call('/api/auth/login', { body: { email, password } });
  check('login returns 200', login.status === 200, login.body);
  check('login returns access_token (snake_case)', typeof login.body?.access_token === 'string', Object.keys(login.body || {}));
  check('login returns refresh_token (snake_case)', typeof login.body?.refresh_token === 'string');
  check('login returns expires_in from config', login.body?.expires_in === 900, login.body?.expires_in);
  check('login returns user object', login.body?.user?.id === userId);
  const { access_token, refresh_token } = login.body || {};

  console.log('\n== jwt shape ==');
  const claims = JSON.parse(Buffer.from(access_token.split('.')[1], 'base64').toString());
  const header = JSON.parse(Buffer.from(access_token.split('.')[0], 'base64').toString());
  check('signed with RS256', header.alg === 'RS256', header);
  check('iss is seffro-identity', claims.iss === 'seffro-identity', claims.iss);
  check('sub is the central user id', claims.sub === userId, claims.sub);
  check('carries identity claims', claims.email === email && claims.first_name === 'Smoke');
  check('carries no roles/permissions', !claims.roles && !claims.permissions && !claims.scope, claims);
  check('has jti', typeof claims.jti === 'string');
  check('expires in 15 min', claims.exp - claims.iat === 900);

  console.log('\n== verify ==');
  const ver = await call('/api/auth/validate-token', { token: access_token });
  check('verify returns valid:true', ver.body?.valid === true, ver.body);
  check('verify returns user', ver.body?.user?.id === userId);
  const badVer = await call('/api/auth/validate-token', { token: access_token.slice(0, -3) + 'aaa' });
  check('tampered token rejected', badVer.status === 401 && badVer.body?.valid === false, badVer.body);
  const noVer = await call('/api/auth/validate-token', {});
  check('missing token rejected', noVer.status === 401);

  console.log('\n== me ==');
  const me = await call('/api/auth/me', { method: 'GET', token: access_token });
  check('me returns user', me.body?.user?.email === email, me.body);

  console.log('\n== refresh (rotation) ==');
  const ref = await call('/api/auth/refresh', { body: { refresh_token } });
  check('refresh returns 200', ref.status === 200, ref.body);
  check('refresh returns new access_token', typeof ref.body?.access_token === 'string');
  check('refresh rotates the refresh token', ref.body?.refresh_token !== refresh_token);
  const replay = await call('/api/auth/refresh', { body: { refresh_token } });
  check('old refresh token cannot be replayed', replay.status === 401, replay.body);
  const rotated = ref.body?.refresh_token;

  console.log('\n== email verification ==');
  const vHash = await latestToken('email_verification_tokens', email);
  check('verification token was issued on register', !!vHash);

  console.log('\n== forgot / reset password ==');
  const forgot = await call('/api/auth/forgot-password', { body: { email } });
  check('forgot-password returns success', forgot.body?.success === true, forgot.body);
  const unknown = await call('/api/auth/forgot-password', { body: { email: other } });
  check('unknown email returns identical response (no enumeration)',
    unknown.status === forgot.status && JSON.stringify(unknown.body) === JSON.stringify(forgot.body),
    { known: forgot.body, unknown: unknown.body });

  process.env.SMOKE_STATE = JSON.stringify({ email, userId, rotated, password });
  console.log(`\n---- ${pass} passed, ${fail} failed ----`);
  require('fs').writeFileSync(
    process.argv[2] || 'state.json',
    JSON.stringify({ email, userId, rotated, password, access_token, pass, fail })
  );
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('SMOKE ERROR', e); process.exit(2); });
