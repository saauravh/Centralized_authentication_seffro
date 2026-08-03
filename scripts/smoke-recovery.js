// Focused test of the reset/verification token flows — the code path that
// previously accepted any token and reset any account.
const BASE = 'http://localhost:3001';
const SECRET = process.env.SERVICE_SECRET;
const mysql = require('mysql2/promise');
const fs = require('fs');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`); }
}

async function call(path, { method = 'POST', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Service-Secret': SECRET };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function linksFor(email) {
  // stdout to a redirected file is buffered; callers sleep before reading.
  const log = fs.readFileSync(process.env.SERVICE_LOG || 'svc.log', 'utf8');
  const enc = encodeURIComponent(email);
  const grab = (kind) => {
    const re = new RegExp(`http://localhost:8000/${kind}\\?token=([a-f0-9]+)&email=${enc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    const all = [...log.matchAll(re)];
    return all.length ? all[all.length - 1][1] : null;
  };
  return { reset: grab('central/password/reset'), verify: grab('central/email/verify') };
}

async function db(sql, params) {
  const c = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: 'central_auth' });
  const [rows] = await c.query(sql, params);
  await c.end();
  return rows;
}

(async () => {
  const stamp = Date.now();
  const email = `reset${stamp}@example.com`;
  const victim = `victim${stamp}@example.com`;
  const password = 'OriginalPass123';

  for (const e of [email, victim]) {
    await call('/api/auth/register', { body: { email: e, password, first_name: 'R', last_name: 'T' } });
  }

  // A live session, to prove a reset kills it.
  const session = await call('/api/auth/login', { body: { email, password } });
  const oldRefresh = session.body.refresh_token;

  console.log('\n== reset requires a real token ==');
  await call('/api/auth/forgot-password', { body: { email } });
  await sleep(400);
  const { reset: token } = linksFor(email);
  check('reset token was emailed', !!token);

  const forged = await call('/api/auth/reset-password', {
    body: { email, token: 'f'.repeat(64), new_password: 'AttackerPass123' },
  });
  check('forged token is rejected', forged.status === 400, forged.body);

  const stillOld = await call('/api/auth/login', { body: { email, password } });
  check('password unchanged after forged attempt', stillOld.status === 200);

  console.log('\n== token is bound to its own account ==');
  const crossed = await call('/api/auth/reset-password', {
    body: { email: victim, token, new_password: 'AttackerPass123' },
  });
  check("cannot redeem one user's token against another account", crossed.status === 400, crossed.body);
  const victimSafe = await call('/api/auth/login', { body: { email: victim, password } });
  check('victim password untouched', victimSafe.status === 200);

  console.log('\n== legitimate reset ==');
  const good = await call('/api/auth/reset-password', {
    body: { email, token, new_password: 'BrandNewPass456' },
  });
  check('valid token resets the password', good.status === 200 && good.body?.success === true, good.body);
  const newLogin = await call('/api/auth/login', { body: { email, password: 'BrandNewPass456' } });
  check('can log in with the new password', newLogin.status === 200);
  const oldLogin = await call('/api/auth/login', { body: { email, password } });
  check('old password no longer works', oldLogin.status === 401);

  console.log('\n== single use + session invalidation ==');
  const replay = await call('/api/auth/reset-password', {
    body: { email, token, new_password: 'ThirdPass789' },
  });
  check('token cannot be redeemed twice', replay.status === 400, replay.body);
  const revoked = await call('/api/auth/refresh', { body: { refresh_token: oldRefresh } });
  check('reset revoked pre-existing refresh tokens', revoked.status === 401, revoked.body);

  console.log('\n== expiry is enforced ==');
  await call('/api/auth/forgot-password', { body: { email } });
  await sleep(400);
  const { reset: freshToken } = linksFor(email);
  const rows = await db(
    `SELECT t.id FROM password_reset_tokens t JOIN central_users u ON u.id=t.user_id
     WHERE u.email=? AND t.used_at IS NULL ORDER BY t.id DESC LIMIT 1`, [email]);
  await db('UPDATE password_reset_tokens SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?', [rows[0].id]);
  const expired = await call('/api/auth/reset-password', {
    body: { email, token: freshToken, new_password: 'ExpiredPass123' },
  });
  check('expired token is rejected', expired.status === 400, expired.body);

  console.log('\n== email verification ==');
  const vEmail = `verify${stamp}@example.com`;
  await call('/api/auth/register', { body: { email: vEmail, password, first_name: 'V', last_name: 'T' } });
  await sleep(400);
  const { verify: vToken } = linksFor(vEmail);
  check('verification token emailed on register', !!vToken);
  const badVerify = await call('/api/auth/verify-email', { body: { email: vEmail, token: 'a'.repeat(64) } });
  check('forged verification token rejected', badVerify.status === 400, badVerify.body);
  const okVerify = await call('/api/auth/verify-email', { body: { email: vEmail, token: vToken } });
  check('valid verification token accepted', okVerify.status === 200, okVerify.body);
  check('user reports email_verified', okVerify.body?.user?.email_verified === true, okVerify.body?.user);
  const vLogin = await call('/api/auth/login', { body: { email: vEmail, password } });
  const vClaims = JSON.parse(Buffer.from(vLogin.body.access_token.split('.')[1], 'base64').toString());
  check('email_verified reflected in new JWT', vClaims.email_verified === true, vClaims.email_verified);
  const reVerify = await call('/api/auth/verify-email', { body: { email: vEmail, token: vToken } });
  check('verification token is single-use', reVerify.status === 400);

  console.log('\n== change password ==');
  const cpLogin = await call('/api/auth/login', { body: { email: vEmail, password } });
  const cpWrong = await call('/api/auth/change-password', {
    token: cpLogin.body.access_token,
    body: { current_password: 'NotThePassword', new_password: 'Changed123456' },
  });
  check('wrong current password rejected', cpWrong.status === 400, cpWrong.body);
  const cpOk = await call('/api/auth/change-password', {
    token: cpLogin.body.access_token,
    body: { current_password: password, new_password: 'Changed123456' },
  });
  check('change-password succeeds', cpOk.status === 200, cpOk.body);
  const cpRevoked = await call('/api/auth/refresh', { body: { refresh_token: cpLogin.body.refresh_token } });
  check('change-password revoked existing sessions', cpRevoked.status === 401);

  console.log('\n== logout ==');
  const lo = await call('/api/auth/login', { body: { email: vEmail, password: 'Changed123456' } });
  const loOut = await call('/api/auth/logout', { token: lo.body.access_token, body: { refresh_token: lo.body.refresh_token } });
  check('logout succeeds', loOut.status === 200, loOut.body);
  const loAfter = await call('/api/auth/refresh', { body: { refresh_token: lo.body.refresh_token } });
  check('refresh token dead after logout', loAfter.status === 401);

  console.log('\n== audit trail ==');
  const hist = await db(
    `SELECT event, COUNT(*) c FROM login_history h JOIN central_users u ON u.id=h.user_id
     WHERE u.email IN (?,?) GROUP BY event ORDER BY event`, [email, vEmail]);
  const events = Object.fromEntries(hist.map((r) => [r.event, r.c]));
  console.log('   events:', JSON.stringify(events));
  check('records register', events.register >= 2, events);
  check('records login', events.login >= 3, events);
  check('records login_failed', events.login_failed >= 1, events);
  check('records password_reset', events.password_reset >= 1, events);
  check('records password_change', events.password_change >= 1, events);
  check('records logout', events.logout >= 1, events);
  check('records email_verified', events.email_verified >= 1, events);

  console.log(`\n---- ${pass} passed, ${fail} failed ----`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(2); });
