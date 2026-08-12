# Central Identity Service

Authentication only — no business logic, no roles, no permissions.

A headless Node.js service that owns one thing: who a person is and whether they
can prove it. Every application shares the account; each keeps its own users table
linked by `central_user_id`.

## Architecture

```
   in.seffro.com                    admin.helppu.com
      (Laravel)                        (Laravel)
          │                                │
          │        server-to-server        │
          └──────────────┬─────────────────┘
                         ▼
            Central Identity Service (Node)
                    :3001, internal
                         │
                    central_users
```

**There is no hosted login page.** Users fill in the login and registration forms
belonging to the application they are already on. That application's backend calls
this service, receives an identity, and starts its own session. No redirect, no
`auth.` domain, no browser ever reaching this process.

**There is no cookie shared between applications.** Each app holds the central
tokens in its own server-side session. The account and password are shared; the
session is not.

The service knows only: `email`, `password`, `first_name`, `last_name`, `phone`,
`avatar`, `email_verified_at`, `status`. It answers exactly one question —
*is this person who they claim to be?* — and never "is this user an agent" or
"can they approve bookings". Those belong to the applications.

## Local setup

```bash
npm install
npm run rotate-keys 2026-08    # names the signing key; prints the apps' env line
cp .env.example .env           # then set DB credentials
npm run migrate
npm run create-client seffro   # once per application; prints its secret
npm run dev
```

Migrations are tracked in `schema_migrations` and safe to re-run.

For deployment, see [DEPLOYMENT.md](./DEPLOYMENT.md).
For how the whole system fits together, see [HOW-IT-WORKS.md](../HOW-IT-WORKS.md).

## Endpoints

Everything lives under `/api/auth` and requires the `X-Service-Secret` header.
These are called by your Laravel backends, never by a browser.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create identity — issues no session |
| POST | `/api/auth/login` | Authenticate, return a session |
| POST | `/api/auth/validate-token` | Signature, revocation, account status and verification |
| POST | `/api/auth/refresh` | Rotate a refresh token for a new pair |
| POST | `/api/auth/logout` | Revoke the refresh token and blacklist the access token |
| GET | `/api/auth/me` | Current user from a Bearer token |
| PATCH | `/api/auth/profile` | Update name, phone or email (authenticated) |
| POST | `/api/auth/change-password` | Change password (authenticated) |
| POST | `/api/auth/forgot-password` | Email a reset link |
| POST | `/api/auth/reset-password` | Redeem a reset token |
| POST | `/api/auth/verify-email` | Redeem a verification token |
| POST | `/api/auth/resend-verification` | Re-send a verification link |
| POST | `/api/auth/check-verification` | Is an address registered, and is it verified? |
| GET | `/api/health` | Health check (unauthenticated) |

**Registration is not authentication.** `register` returns `201` with
`{ central_user_id, verification_required }` and no session — the application sends
the user to log in next. If signing up handed back a token, a user could use the
account forever without opening the verification email. Login is the single path
that issues a session, and the single place verification is enforced.

An address that is already registered returns `200 { user_exists: true }`, with no
central id: nothing in a registration request proves the caller owns that address.
See INTEGRATION.md.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3001` | |
| `DB_*` | | MySQL connection for `central_auth` |
| `SERVICE_SECRET` | *(empty)* | Fallback shared secret; prefer `npm run create-client`. Production needs one or the other |
| `REQUIRE_EMAIL_VERIFICATION` | `false` | `true` refuses login until the address is verified |
| `LOCKOUT_THRESHOLD` | `10` | Failed logins before the account locks |
| `LOCKOUT_DURATION` | `900` | Lock duration in seconds |
| `JWT_ISSUER` | `seffro-identity` | Validated by the apps |
| `JWT_ACCESS_TTL` | `900` | Access token seconds |
| `JWT_REFRESH_TTL` | `604800` | Refresh token seconds |
| `RESET_TOKEN_TTL` | `3600` | Password reset link lifetime |
| `VERIFY_TOKEN_TTL` | `86400` | Email verification link lifetime |
| `JWT_KEYS_DIR` | `./keys` | Holds active.key and the named key pairs |
| `SMTP_HOST` | *(empty)* | Empty logs emails to the console instead of sending |
| `PASSWORD_RESET_URL` | | Page in the consumer app the reset email links to |
| `EMAIL_VERIFY_URL` | | Same, for verification |

## Database

```
central_users              uuid, email, password, name, phone, avatar,
                           email_verified_at, status, lockout, tokens_valid_from
refresh_tokens             hashed, rotating, with device_name + ip_address
password_reset_tokens      hashed, single-use, expiring
email_verification_tokens  hashed, single-use, expiring
revoked_tokens             access-token deny list, purged on expiry
login_history              audit trail with device and browser
service_clients            per-application credentials
```

No roles, no permissions, no platforms, no application data — those belong to each
application.

`revoked_tokens` is the one table beyond the six-table sketch, and it earns its
place: without a per-token deny list, "log out this one device" cannot be
expressed. Revoking *everything* for a user is a single `tokens_valid_from` cutoff
on `central_users`; revoking *one* token needs its `jti` recorded somewhere.

`uuid` is the public identifier. Sequential integer ids leak how many users exist
and are guessable in a URL, so applications should reference the uuid anywhere a
value travels outside the server-to-server channel.

## Testing

```bash
SERVICE_SECRET=<secret> node scripts/smoke-auth.js
```

```bash
SERVICE_SECRET=<secret> node scripts/smoke-policy.js
```

```bash
SERVICE_SECRET=<secret> SERVICE_LOG=<stdout-log-path> node scripts/smoke-recovery.js
```

120 checks, all against a live service and a real database. `smoke-recovery.js`
reads emailed tokens from the service's stdout, so redirect its output to the file
named by `SERVICE_LOG`.

Key rotation has its own suite. It works in a temporary key directory and needs no
running service, so it is safe to run anywhere:

```bash
node scripts/smoke-key-rotation.js
```

The verification gate changes login behaviour, so it needs its own instance:

```bash
PORT=3002 REQUIRE_EMAIL_VERIFICATION=true npm run dev > gate.log
```

```bash
SERVICE_SECRET=<secret> SERVICE_LOG=gate.log node scripts/smoke-verification-gate.js
```

## Integration

See [INTEGRATION.md](../INTEGRATION.md) for wiring the Laravel applications,
including the security reasoning behind the register contract and token handling.
