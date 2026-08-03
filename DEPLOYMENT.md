# Deploying the Central Identity Service

This service holds every password in the ecosystem. Deploy it accordingly.

The single most important rule: **the identity service must not be reachable from
the public internet.** Nothing about its design assumes a hostile caller can reach
it — the service-client secret is the only gate, and it travels in a header. Bind
it to a private interface and let only the application servers route to it.

---

## 1. Prerequisites

| Requirement | Notes |
|---|---|
| Node.js 20 LTS or newer | Built and tested on 24.x |
| MySQL 8.0 or MariaDB 10.6+ | Needs `CREATE DATABASE` on first run only |
| A private network path from each app server | See §6 |
| SMTP credentials | Password reset and verification depend on it |

No C++ toolchain is required — password hashing uses `bcryptjs`, which is pure
JavaScript and produces the same `$2b$` hashes as native bcrypt.

---

## 2. Build

```bash
npm ci
```

```bash
npm run build
```

```bash
npm prune --omit=dev
```

Order matters. `npm run build` needs TypeScript, which is a dev dependency, so
prune only after compiling. After pruning, use the `:prod` script variants — they
run compiled JavaScript and do not need `ts-node`:

| Development | Production |
|---|---|
| `npm run dev` | `npm start` |
| `npm run migrate` | `npm run migrate:prod` |
| `npm run create-client <name>` | `npm run create-client:prod <name>` |

---

## 3. Signing keys

Keys are named. Each carries a `kid` that goes in the JWT header, so verifiers can
tell which key signed a token — which is what makes a rotation a deploy instead of
a forced logout.

```bash
npm run rotate-keys 2026-08
```

```
keys/
  active.key             ← "2026-08"; the key new tokens are signed with
  private-2026-08.pem    ← never leaves this server
  public-2026-08.pem     ← deployed to every application
  public-2026-02.pem     ← retired, still trusted until its tokens expire
```

- **The private key never leaves this server.** Anyone holding it can mint a valid
  token for any account, and nothing detects it (see §10).
- **Public keys go to every application** as `CENTRAL_AUTH_PUBLIC_KEYS`. They are
  not secrets; they only verify.

`rotate-keys` prints the exact env line to paste into each application. It also
deletes the *private* half of the outgoing key — nothing signs with it again —
while keeping its public half so tokens already in circulation stay valid.

```bash
chmod 600 keys/private-*.pem
```

Back the keys up somewhere you can restore from.

### Rotating

1. `npm run rotate-keys <new-kid>` on the identity service
2. Paste the printed `CENTRAL_AUTH_PUBLIC_KEYS` into every application, and
   `php artisan config:cache`
3. Restart the identity service

Between 1 and 3 the apps trust both keys, so nothing breaks in either order. Once
the old access tokens have expired — one `JWT_ACCESS_TTL`, 15 minutes by default —
delete `keys/public-<old-kid>.pem` and drop that kid from the apps' env.

**To stop trusting a key immediately** — a compromise rather than a routine
rotation — remove its `public-<kid>.pem` and its entry in the apps' env at step 2
instead of waiting. Every token it signed is refused at once, and those users log
in again.

### The pre-rotation layout

A single unnamed `keys/private.pem` + `keys/public.pem` still works, and tokens
minted from it carry no `kid`. The service logs a warning at boot and keeps going,
so you can adopt named keys whenever suits. Applications configured with the old
single `CENTRAL_AUTH_PUBLIC_KEY` also keep working.

---

## 4. Environment

Copy `.env.example` and fill it in. The values that matter most in production:

```ini
NODE_ENV=production
PORT=3001

DB_HOST=10.0.0.20
DB_NAME=central_auth
DB_USER=central_auth
DB_PASSWORD=<strong, unique>

# Refuses to boot in production with neither this nor an active service client.
SERVICE_SECRET=

REQUIRE_EMAIL_VERIFICATION=true

JWT_ACCESS_TTL=900
JWT_REFRESH_TTL=2592000

LOCKOUT_THRESHOLD=10
LOCKOUT_DURATION=900

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=<user>
SMTP_PASS=<pass>
SMTP_FROM="Seffro <noreply@seffro.com>"

PASSWORD_RESET_URL=https://in.seffro.com/central/password/reset
EMAIL_VERIFY_URL=https://in.seffro.com/central/email/verify
```

Notes:

- **`SMTP_HOST` empty means emails are printed to stdout instead of sent.** That is
  the development fallback. In production an empty value silently breaks password
  reset — set it, and send a test reset before going live.
- **`.env` must not be in Git.** See §10.
- Give MySQL a dedicated user scoped to `central_auth`, not root.

---

## 5. Database

Create the user and grant it only what it needs:

```sql
CREATE USER 'central_auth'@'10.0.0.%' IDENTIFIED BY '<strong>';
GRANT ALL PRIVILEGES ON central_auth.* TO 'central_auth'@'10.0.0.%';
```

`ALL PRIVILEGES` on that one schema is deliberate — the migration runner issues
`CREATE DATABASE`, `CREATE TABLE` and `ALTER TABLE`.

Then run migrations:

```bash
npm run migrate:prod
```

Idempotent: every applied file is recorded in `schema_migrations` and skipped on
subsequent runs. Safe to run on every deploy, and that is the recommended habit.

Provision one client per application:

```bash
npm run create-client:prod seffro
```

Each prints its secret **once**. Put it in that application's
`CENTRAL_AUTH_SERVICE_SECRET`. Re-running for an existing name rotates the secret.

---

## 6. Network isolation

This is the part that matters most.

```
   in.seffro.com          admin.helppu.com
   (app server)             (app server)
        │                        │
        └────────┬───────────────┘
                 │  private network only
                 ▼
        identity service :3001
                 │
              MySQL :3306
```

Choose one:

- **Same host** — bind to loopback. Nothing outside the machine can reach it.
- **Private subnet** — bind to the private interface, and use a security group or
  firewall that allows :3001 only from the app servers' addresses.
- **Public host (not recommended)** — if you have no private path, terminate TLS at
  a reverse proxy and restrict by source IP there. Also set `allowed_origin` on each
  service client so a leaked secret is only usable from the expected address.

Never publish :3001 through your public load balancer alongside the applications.

`app.set('trust proxy', true)` is enabled so the end user's address arrives via
`X-Forwarded-For` — the applications forward it. That header is trusted, which is
safe on a private network and **is not** if the port is publicly reachable.

---

## 7. Running it

### systemd

`/etc/systemd/system/central-auth.service`:

```ini
[Unit]
Description=Central Identity Service
After=network.target mysql.service

[Service]
Type=simple
User=central-auth
WorkingDirectory=/srv/central-auth
EnvironmentFile=/srv/central-auth/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/srv/central-auth/logs

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now central-auth
```

### pm2

```bash
pm2 start dist/index.js --name central-auth --time
```

```bash
pm2 save
```

Run it as a dedicated unprivileged user that owns `keys/` and `.env`, and nothing
else on the box.

---

## 8. Deploy order

Because the applications verify tokens with the public key and authenticate with a
client secret, order matters when either changes.

**Routine deploy** (no key or secret change):

1. `npm ci && npm run build && npm prune --omit=dev`
2. `npm run migrate:prod`
3. Restart the service
4. Verify (§9)

Applications need no coordination — their sessions survive a restart because
tokens are stateless and refresh tokens live in MySQL.

**Rotating a client secret:**

1. `npm run create-client:prod seffro` — the old secret stops working immediately
2. Update that app's `CENTRAL_AUTH_SERVICE_SECRET`
3. `php artisan config:clear` on the app

There is a gap between 1 and 3 where that application gets `401` from the identity
service. Keep it short, or add a second client name, cut over, then disable the old
row.

**Rotating signing keys** invalidates every access token in circulation. Users stay
signed in — the middleware silently refreshes — but do it in a quiet window.

---

## 9. Verifying a deploy

```bash
curl -fsS http://127.0.0.1:3001/api/health
```

Then prove the auth path actually works, not just that the process is up:

```bash
SERVICE_SECRET=<secret> node scripts/smoke-auth.js
```

The smoke suites create real users in whatever database they point at. **Run them
against staging, not production.** For production, a single authenticated call is
the right check:

```bash
curl -fsS -X POST https://<internal>/api/auth/validate-token \
  -H "X-Service-Secret: $SERVICE_SECRET" \
  -H "Authorization: Bearer <a token from a real login>"
```

A `401 SERVICE_UNAUTHORIZED` means the client secret is wrong. A `503` from the
same endpoint means the service cannot reach MySQL.

Use `/api/health` for the load balancer probe: it is the only unauthenticated
route, and it does not touch the database.

---

## 10. Secrets hygiene

Two files in this repository are tracked in Git and contain live secrets. Both
were committed before `.gitignore` covered them.

### `keys/private.pem` — fix this first

**The JWT signing key currently in use is in Git history.** Verified: the committed
key mints tokens the running service accepts.

This is worse than a leaked password. Anyone with repository access can forge a
token for **any account** — no password, no database access, no failed-login trace.
A forged token is cryptographically indistinguishable from a real one, so nothing
in the audit trail will show it happened. Lockout, rate limiting and revocation all
sit on paths a forger never touches.

**The periodic revalidation tick does not help.** This was tested directly: a token
forged with the committed key, for a real active account, returns
`200 { valid: true }` from `/api/auth/validate-token` along with the genuine user
record. Every check passes, because none of them is looking for this:

| Check | Why it passes |
|---|---|
| Signature | The key is legitimate — that is the whole problem |
| `revoked_tokens` | A forged `jti` was never issued, so it was never revoked |
| Account status | The victim's account really is active |
| `tokens_valid_from` | The forger sets `iat`, so it is always after the cutoff |

That last row matters most: because the attacker controls `iat`, even "revoke every
session for this user" is stepped over by minting a fresh token. There is no window
during which a forgery is detected, and no remediation short of rotating the key.

Remediation, in order. This is a compromise, not a routine rotation, so the old
key must stop being trusted rather than being left to expire gracefully:

**0. Inventory.** List every environment and confirm which public key it currently
trusts. Anything still holding the old one keeps accepting forged tokens after the
cutover.

**1. Untrack the keys.**

```bash
git rm --cached keys/private.pem keys/public.pem
```

`keys/` and `*.pem` are now in `.gitignore`, so replacements will not be
re-committed.

**2. Mint a named replacement.**

```bash
npm run rotate-keys 2026-08
```

**3. Delete the compromised public key** so nothing it signed verifies any longer:

```bash
rm keys/public.pem keys/private.pem
```

**4. Deploy** the printed `CENTRAL_AUTH_PUBLIC_KEYS` to every application, remove
any `CENTRAL_AUTH_PUBLIC_KEY` entry, and `php artisan config:cache`.

**5. Restart** the identity service.

Every access token signed by the old key is now refused. Users are not signed out —
`CentralAuthMiddleware` trades the refresh token for a new pair on the next request —
but do it in a quiet window regardless.

**6. Rotate the remaining secrets** (§8 for clients, below for the database).

### `.env`

Contains the database password and the service-client secrets:

```bash
git rm --cached .env
```

Then rotate everything that has ever been in it. Rotating a service client is one
command (§8); the DB password means updating `.env` and restarting.

### History

Removing a file from future commits does not remove it from history. Anyone who
has cloned this repository already has both files. Treat every secret that has
ever been in them as public and rotate all of them — the key pair, the database
password, and every service-client secret.

Rewriting history (`git filter-repo`, BFG) removes them from the repository but
not from existing clones, forks or CI caches. Worth doing, but rotation is what
actually closes the exposure.

---

## 11. Operating it

**Logs.** Winston writes to stdout; systemd or pm2 captures it. Worth alerting on:

| Log line | Means |
|---|---|
| `Rejected request` | Bad or missing service secret — misconfigured app, or probing |
| `Email send failed` | SMTP broken; resets are silently not arriving |
| `Failed to record login history` | Audit trail is dropping rows |
| `SERVICE_SECRET must be set` | Refused to boot; check env |

**Backups.** `central_auth` holds every credential in the ecosystem. Back it up on
the same schedule as your most important application database, and test a restore.
Back up `keys/` separately.

**Housekeeping.** `revoked_tokens`, `password_reset_tokens` and
`email_verification_tokens` accumulate expired rows. `RevocationRepository.purgeExpired()`
and `AuthTokenRepository.purgeExpired()` exist for this; there is no scheduler yet,
so run them from a cron job or accept slow table growth. Nothing breaks either way —
expired rows are never treated as valid.

**Monitoring.** Rising `login_failed` or `account_locked` counts in `login_history`
are the signal worth watching:

```sql
SELECT event, COUNT(*) FROM login_history
WHERE created_at > NOW() - INTERVAL 1 HOUR
GROUP BY event;
```

---

## 12. Application-side checklist

Per Laravel application:

- [ ] `composer require firebase/php-jwt` (helppu already has it)
- [ ] `CENTRAL_AUTH_URL` points at the private address
- [ ] `CENTRAL_AUTH_SERVICE_SECRET` is that app's own client secret
- [ ] `CENTRAL_AUTH_PUBLIC_KEY` set, so tokens verify locally
- [ ] `CENTRAL_AUTH_REVALIDATE_EVERY` set (300 is a sensible default)
- [ ] `central_user_id` column added (`migrations/002_add_central_user_id_apps.sql`)
- [ ] `php artisan config:cache` after changing any of the above
- [ ] `PASSWORD_RESET_URL` / `EMAIL_VERIFY_URL` on the service point at real pages
      on this app, over HTTPS

Test the full loop on staging before cutting over: register, receive the
verification email, verify, log in, change the password, log out.
