# Central Identity Service

A standalone Node.js identity server for the Seffro ecosystem. Handles authentication only — no business logic, no roles, no permissions.

## Architecture

```
auth.seffro.com (Node.js)
     │
     │  server-to-server HTTP
     │
     ├── seffro.com (Laravel)
     ├── hellpu.com (Laravel)
     └── provider.seffro.com (Laravel)
```

The identity server only knows: `email`, `password`, `name`, `phone`, `email_verified`, `status`.

Each Laravel app manages its own local users table linked by `central_user_id`.

## Quick Start

```bash
# Install dependencies
npm install

# Generate RS256 keys
bash scripts/generate-keys.sh

# Copy env and configure
cp .env.example .env

# Create database and run migrations
npm run migrate

# Seed OAuth clients
npm run seed

# Start server
npm run dev
```

## API Endpoints

### Auth (server-to-server)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create central user |
| POST | `/api/auth/login` | Authenticate, get JWT |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/verify` | Verify JWT validity |
| POST | `/api/auth/logout` | Revoke refresh token |
| GET | `/api/auth/me` | Current user info |
| POST | `/api/auth/change-password` | Change password |
| POST | `/api/auth/forgot-password` | Send reset email |
| POST | `/api/auth/reset-password` | Reset with token |

### OAuth 2.1

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/oauth/authorize` | Authorization (with PKCE) |
| POST | `/oauth/token` | Exchange code/tokens |
| POST | `/oauth/revoke` | Revoke token |
| POST | `/oauth/introspect` | Validate token |

### OIDC Discovery

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/.well-known/openid-configuration` | OIDC metadata |
| GET | `/.well-known/jwks.json` | Public keys |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `DB_HOST` | `127.0.0.1` | MySQL host |
| `DB_NAME` | `central_auth` | Database name |
| `JWT_ACCESS_TTL` | `900` | Access token TTL (seconds) |
| `JWT_REFRESH_TTL` | `604800` | Refresh token TTL (seconds) |
| `JWT_PRIVATE_KEY_PATH` | `./keys/private.pem` | RS256 private key |
| `JWT_PUBLIC_KEY_PATH` | `./keys/public.pem` | RS256 public key |
| `SMTP_HOST` | — | SMTP server for emails |
| `COOKIE_DOMAIN` | `.seffro.com` | Parent domain for SSO cookie |

## JWT Payload

```json
{
  "iss": "seffro-identity",
  "sub": 84,
  "email": "john@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "email_verified": true,
  "iat": 1720000000,
  "exp": 1720003600,
  "jti": "550e8400-e29b-41d4-a716-446655440000"
}
```

Algorithm: **RS256**. No shared secrets. No roles. No permissions. Pure identity.

## Laravel Integration

### 1. Add to composer.json

```json
{
    "require": {
        "firebase/php-jwt": "^6.0"
    }
}
```

### 2. Publish config

Copy `central-auth-integration/config/central-auth.php` to your Laravel app's `config/` directory.

### 3. Register service provider

Add to `config/app.php` providers array:
```php
Seffro\Providers\SeffroAuthServiceProvider::class,
```

### 4. Configure auth guard

In `config/auth.php`:
```php
'guards' => [
    'seffro' => [
        'driver' => 'seffro',
        'provider' => 'users',
    ],
],
```

### 5. Add `central_user_id` column to local users table

```sql
ALTER TABLE users ADD COLUMN central_user_id INT UNSIGNED UNIQUE AFTER id;
```

### 6. Modify login controller

```php
use Seffro\Auth\CentralAuthService;

class LoginController
{
    public function login(Request $request)
    {
        $auth = app(CentralAuthService::class);
        $result = $auth->login($request->email, $request->password);

        // Store JWT in SSO cookie
        Cookie::queue('seffro_token', $result['access_token'], 15, '/', '.seffro.com');

        // Find or create local user
        $user = User::firstOrCreate(
            ['central_user_id' => $result['user']['id']],
            ['role' => 'user', 'name' => $result['user']['first_name'] . ' ' . $result['user']['last_name']]
        );

        Auth::login($user);
    }
}
```

## SSO Flow

1. User logs in on any app → JWT stored in cookie on `.seffro.com`
2. User visits another app → cookie is sent to the app
3. App's `SeffroGuard` reads JWT from cookie, verifies RS256 signature locally
4. Looks up local user by `central_user_id` → if not found, auto-creates
5. User is logged in — no redirect, no login screen

## User Migration

```bash
npm run migrate-users
```

This script reads users from both helppu-1 and seffro_jun databases, deduplicates by email, and inserts them into `central_users`.

---

## Deployment

### Prerequisites (production server)

| Requirement | Minimum |
|---|---|
| Node.js | 18.x LTS |
| MySQL | 8.x |
| Redis | 7.x |
| OpenSSL | (for key generation) |

### Step-by-Step

```bash
# 1. Clone & install
git clone <repo> /opt/central-auth
cd /opt/central-auth
npm install --production

# 2. Build TypeScript
npm run build

# 3. Set up environment
cp .env.example .env
# Edit .env with production values (see below)

# 4. Generate RS256 keys
bash scripts/generate-keys.sh
# Creates ./keys/private.pem and ./keys/public.pem

# 5. Create MySQL database & run migrations
mysql -u root -p -e "CREATE DATABASE central_auth CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
npm run migrate

# 6. Start with PM2
npm install -g pm2
pm2 start dist/index.js --name central-auth
pm2 save
pm2 startup systemd
```

### Production .env

```ini
# Server
PORT=3001
NODE_ENV=production

# Database
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=central_auth_user
DB_PASSWORD=<strong-random-password>
DB_NAME=central_auth

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# Session
SESSION_SECRET=<openssl rand -hex 32>
SESSION_TTL=86400000

# JWT (paths relative to project root)
JWT_ISSUER=seffro-identity
JWT_ACCESS_TTL=900
JWT_REFRESH_TTL=604800
JWT_PRIVATE_KEY_PATH=./keys/private.pem
JWT_PUBLIC_KEY_PATH=./keys/public.pem

# SMTP (for forgot-password emails)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<sendgrid-api-key>
SMTP_FROM=noreply@seffro.com

# CORS — list the Laravel app domains
CORS_ORIGIN=https://in.seffro.com,http://admin.helppu.com

# Cookie — parent domain for SSO cookies
COOKIE_DOMAIN=.seffro.com
COOKIE_SECRET=<different-random-secret>
```

### PM2 Ecosystem File (optional)

Create `ecosystem.config.js`:

```js
module.exports = {
  apps: [{
    name: 'central-auth',
    script: 'dist/index.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '/var/log/central-auth/error.log',
    out_file: '/var/log/central-auth/out.log',
    merge_logs: true,
  }],
};
```

Then:

```bash
pm2 start ecosystem.config.js
pm2 save
```

### Docker Deployment

No Dockerfile included — create one in the project root:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

Build and run:

```bash
docker build -t central-auth .
docker run -d --name central-auth \
  -p 3001:3001 \
  --env-file .env \
  -v $(pwd)/keys:/app/keys \
  central-auth
```

### One-Click Platforms

| Platform | Notes |
|---|---|
| Railway | Set build = `npm run build`, start = `node dist/index.js` |
| Render | Type = Web Service, build = `npm run build`, start = `node dist/index.js` |
| Fly.io | Use `fly launch`, configure with `fly.toml` |
| VPS (any) | Use PM2 (above) or systemd directly |

### Health Check

After deployment, verify:

```bash
curl https://auth.seffro.com/api/health
# → { "status": "ok", "uptime": 1234 }
```

### Firewall

| Port | Source | Purpose |
|---|---|---|
| 3001 (or custom) | Laravel app servers only | API |
| 3306 | localhost only | MySQL |
| 6379 | localhost only | Redis |

> ⚠️ **Never expose port 3001 to the public internet.** The identity server should only be reachable from your Laravel application servers. Use a firewall (UFW, security group, etc.) to restrict access.

### Backup

```bash
# Daily cron: backup MySQL + keys
0 3 * * * mysqldump -u root -p central_auth > /backups/central_auth/$(date +\%F).sql
0 4 * * * cp -r /opt/central-auth/keys /backups/central_auth/keys-$(date +\%F)
```
# Centralized_authentication_seffro
