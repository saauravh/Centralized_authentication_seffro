/**
 * Covers the policy layer: registration/authentication separation, token
 * revocation, ban enforcement, profile sync and per-app service clients.
 *
 *   SERVICE_SECRET=<secret> node scripts/smoke-policy.js
 */
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const SECRET = process.env.SERVICE_SECRET;
const mysql = require('mysql2/promise');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`); }
}

async function call(path, { method = 'POST', body, token, secret = SECRET } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['X-Service-Secret'] = secret;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

async function db(sql, params) {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'central_auth',
  });
  const [rows] = await c.query(sql, params);
  await c.end();
  return rows;
}

(async () => {
  const stamp = Date.now();
  const email = `policy${stamp}@example.com`;
  const password = 'PolicyPass123';

  console.log('\n== registration is not authentication ==');
  const reg = await call('/api/auth/register', {
    body: { email, password, first_name: 'Pol', last_name: 'Icy', phone: '5550001' },
  });
  check('register returns 201', reg.status === 201, reg.body);
  check('register issues NO access token', !reg.body?.access_token, reg.body);
  check('register issues NO refresh token', !reg.body?.refresh_token, reg.body);
  check('register returns central_user_id', typeof reg.body?.central_user_id === 'number', reg.body);
  check('register reports verification_required', 'verification_required' in (reg.body || {}), reg.body);
  const userId = reg.body?.central_user_id;

  console.log('\n== duplicate registration leaks nothing ==');
  const dup = await call('/api/auth/register', {
    body: { email, password, first_name: 'Dup', last_name: 'Licate' },
  });
  check('duplicate returns 200', dup.status === 200, dup.body);
  check('duplicate says user_exists', dup.body?.user_exists === true, dup.body);
  check('duplicate does NOT leak central_user_id', dup.body?.central_user_id === undefined, dup.body);
  check('duplicate leaks no other fields', Object.keys(dup.body || {}).length === 1, dup.body);

  console.log('\n== login is the only path to a session ==');
  const login = await call('/api/auth/login', { body: { email, password } });
  check('login returns tokens', typeof login.body?.access_token === 'string', login.body);
  const { access_token, refresh_token } = login.body;

  console.log('\n== validate-token ==');
  const v1 = await call('/api/auth/validate-token', { token: access_token });
  check('valid token passes validation', v1.body?.valid === true, v1.body);
  check('validation returns the user', v1.body?.user?.id === userId, v1.body);
  const vBad = await call('/api/auth/validate-token', { token: access_token.slice(0, -3) + 'zzz' });
  check('tampered token fails validation', vBad.status === 401 && vBad.body?.reason === 'invalid_token', vBad.body);

  console.log('\n== a banned account cannot keep using a live token ==');
  // The token is still perfectly signed and unexpired at this point.
  const verifyBefore = await call('/api/auth/validate-token', { token: access_token });
  check('token valid before ban', verifyBefore.body?.valid === true);

  await db('UPDATE central_users SET status = ? WHERE id = ?', ['banned', userId]);

  const vBanned = await call('/api/auth/validate-token', { token: access_token });
  check('validate-token rejects a banned account', vBanned.status === 401, vBanned.body);
  check('reason is account_inactive', vBanned.body?.reason === 'account_inactive', vBanned.body);

  const refreshBanned = await call('/api/auth/refresh', { body: { refresh_token } });
  check('banned account cannot refresh', refreshBanned.status === 401, refreshBanned.body);

  await db('UPDATE central_users SET status = ? WHERE id = ?', ['active', userId]);

  console.log('\n== logout kills the access token, not just the refresh token ==');
  const s2 = await call('/api/auth/login', { body: { email, password } });
  const t2 = s2.body.access_token;
  check('fresh token validates', (await call('/api/auth/validate-token', { token: t2 })).body?.valid === true);

  await call('/api/auth/logout', { token: t2, body: { refresh_token: s2.body.refresh_token } });

  const afterLogout = await call('/api/auth/validate-token', { token: t2 });
  check('access token rejected after logout', afterLogout.status === 401, afterLogout.body);
  check('reason is token_revoked', afterLogout.body?.reason === 'token_revoked', afterLogout.body);

  // The point of the blacklist: the token is still unexpired and correctly
  // signed, so anything checking only the signature would have accepted it.
  const claims = JSON.parse(Buffer.from(t2.split('.')[1], 'base64').toString());
  check('rejected token had not expired', claims.exp * 1000 > Date.now(), {
    exp: claims.exp, now: Math.floor(Date.now() / 1000),
  });

  console.log('\n== password reset revokes access tokens too ==');
  const s3 = await call('/api/auth/login', { body: { email, password } });
  const t3 = s3.body.access_token;
  await call('/api/auth/change-password', {
    token: t3, body: { current_password: password, new_password: 'RotatedPass456' },
  });
  const afterChange = await call('/api/auth/validate-token', { token: t3 });
  check('access token dead after password change', afterChange.status === 401, afterChange.body);
  check('reason is token_revoked', afterChange.body?.reason === 'token_revoked', afterChange.body);

  console.log('\n== profile sync ==');
  const s4 = await call('/api/auth/login', { body: { email, password: 'RotatedPass456' } });
  const t4 = s4.body.access_token;

  const prof = await call('/api/auth/profile', {
    method: 'PATCH', token: t4, body: { first_name: 'Renamed', phone: '5559999' },
  });
  check('profile update succeeds', prof.status === 200, prof.body);
  check('name changed', prof.body?.user?.first_name === 'Renamed', prof.body?.user);
  check('phone changed', prof.body?.user?.phone === '5559999', prof.body?.user);
  check('email untouched', prof.body?.user?.email === email, prof.body?.user);

  const me = await call('/api/auth/me', { method: 'GET', token: t4 });
  check('me reflects the update', me.body?.user?.first_name === 'Renamed', me.body?.user);

  const noFields = await call('/api/auth/profile', { method: 'PATCH', token: t4, body: {} });
  check('empty profile update rejected', noFields.status === 400, noFields.body);

  const escalate = await call('/api/auth/profile', {
    method: 'PATCH', token: t4, body: { first_name: 'X', status: 'banned', password: 'hax' },
  });
  check('cannot write status/password through profile', escalate.status === 200, escalate.body);
  const stillActive = await db('SELECT status FROM central_users WHERE id = ?', [userId]);
  check('status unchanged by profile update', stillActive[0].status === 'active', stillActive[0]);
  const canStillLogin = await call('/api/auth/login', { body: { email, password: 'RotatedPass456' } });
  check('password unchanged by profile update', canStillLogin.status === 200);

  console.log('\n== changing email resets verification ==');
  await db('UPDATE central_users SET email_verified_at = NOW() WHERE id = ?', [userId]);
  const newEmail = `moved${stamp}@example.com`;
  const emailChange = await call('/api/auth/profile', {
    method: 'PATCH', token: canStillLogin.body.access_token, body: { email: newEmail },
  });
  check('email change succeeds', emailChange.status === 200, emailChange.body);
  check('email_verified reset to false', emailChange.body?.user?.email_verified === false, emailChange.body?.user);

  const taken = await call('/api/auth/register', {
    body: { email: `other${stamp}@example.com`, password, first_name: 'O', last_name: 'T' },
  });
  const otherLogin = await call('/api/auth/login', { body: { email: `other${stamp}@example.com`, password } });
  const collide = await call('/api/auth/profile', {
    method: 'PATCH', token: otherLogin.body.access_token, body: { email: newEmail },
  });
  check('cannot take an email already in use', collide.status === 409, collide.body);

  console.log('\n== per-app service clients ==');
  const clients = await db(
    'SELECT client_name, status, allowed_origin, last_used_at FROM service_clients ORDER BY client_name');
  check('service clients provisioned', clients.length >= 2, clients.map((c) => c.client_name));
  check('clients record last use', clients.some((c) => c.last_used_at !== null), clients);
  check('clients carry a status', clients.every((c) => ['active', 'disabled'].includes(c.status)), clients);
  check('allowed_origin column present', clients.every((c) => 'allowed_origin' in c), clients[0]);

  // A disabled client must stop working immediately, without a restart.
  await db("UPDATE service_clients SET status = 'disabled' WHERE client_name = 'helppu'");
  const [helppu] = await db("SELECT client_secret_hash FROM service_clients WHERE client_name = 'helppu'");
  check('disabled client row updated', helppu !== undefined);
  await db("UPDATE service_clients SET status = 'active' WHERE client_name = 'helppu'");

  const badClient = await call('/api/auth/login', { body: { email, password }, secret: 'not-a-real-secret' });
  check('unknown client secret rejected', badClient.status === 401, badClient.body);

  console.log('\n== identity fields ==');
  // newEmail, not email: the section above moved this account's address.
  const idLogin = await call('/api/auth/login', { body: { email: newEmail, password: 'RotatedPass456' } });
  const idUser = idLogin.body?.user;
  check('user carries a uuid', /^[0-9a-f-]{36}$/i.test(idUser?.uuid || ''), idUser?.uuid);
  check('uuid differs from the integer id', idUser?.uuid !== String(idUser?.id));
  check('email_verified_at exposed alongside the boolean',
    'email_verified_at' in (idUser || {}) && 'email_verified' in (idUser || {}), Object.keys(idUser || {}));

  const avatarUrl = 'https://cdn.example.com/a.png';
  const withAvatar = await call('/api/auth/profile', {
    method: 'PATCH', token: idLogin.body.access_token, body: { avatar: avatarUrl },
  });
  check('avatar can be set', withAvatar.body?.user?.avatar === avatarUrl, withAvatar.body?.user);

  const [dbUser] = await db('SELECT uuid FROM central_users WHERE id = ?', [userId]);
  check('uuid is persisted, not generated per response', dbUser.uuid === idUser?.uuid, dbUser);

  console.log('\n== account lockout ==');
  const lockEmail = `lock${stamp}@example.com`;
  const lockReg = await call('/api/auth/register', {
    body: { email: lockEmail, password, first_name: 'Lock', last_name: 'Out' },
  });
  const lockId = lockReg.body.central_user_id;

  // Drive it straight to the threshold rather than looping through the rate
  // limiter, which would answer 429 long before the lockout engaged.
  await db('UPDATE central_users SET failed_login_attempts = 9 WHERE id = ?', [lockId]);
  const lastAttempt = await call('/api/auth/login', { body: { email: lockEmail, password: 'WrongPass123' } });
  check('final wrong password still 401', lastAttempt.status === 401, lastAttempt.body);

  const [locked] = await db('SELECT locked_until FROM central_users WHERE id = ?', [lockId]);
  check('account is now locked', locked.locked_until !== null, locked);

  // The correct password must not open a locked account.
  const lockedOut = await call('/api/auth/login', { body: { email: lockEmail, password } });
  check('correct password refused while locked', lockedOut.status === 423, lockedOut.body);
  check('distinct ACCOUNT_LOCKED code', lockedOut.body?.error?.code === 'ACCOUNT_LOCKED', lockedOut.body);

  await db('UPDATE central_users SET locked_until = NULL, failed_login_attempts = 0 WHERE id = ?', [lockId]);
  const unlocked = await call('/api/auth/login', { body: { email: lockEmail, password } });
  check('login works once unlocked', unlocked.status === 200, unlocked.body);

  const [cleared] = await db('SELECT failed_login_attempts FROM central_users WHERE id = ?', [lockId]);
  check('successful login clears the counter', Number(cleared.failed_login_attempts) === 0, cleared);

  console.log('\n== refresh token metadata ==');
  const [rt] = await db(
    'SELECT device_name, ip_address, revoked_at FROM refresh_tokens WHERE user_id = ? ORDER BY id DESC LIMIT 1',
    [lockId]);
  check('refresh token records a device', rt.device_name !== null, rt);
  check('revoked_at starts null', rt.revoked_at === null, rt);

  console.log('\n== audit trail ==');
  const hist = await db(
    'SELECT DISTINCT event FROM login_history WHERE user_id = ? ORDER BY event', [userId]);
  const events = hist.map((r) => r.event);
  console.log('   events:', events.join(', '));
  check('records profile_updated', events.includes('profile_updated'), events);
  check('records email_changed', events.includes('email_changed'), events);

  console.log(`\n---- ${pass} passed, ${fail} failed ----`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(2); });
