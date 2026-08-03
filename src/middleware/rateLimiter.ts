import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';

export type LimitType = 'login' | 'register' | 'sendMail' | 'redeem' | 'global';

const limiters: Record<LimitType, RateLimiterMemory> = {
  login: new RateLimiterMemory({ points: 5, duration: 60, blockDuration: 300 }),
  register: new RateLimiterMemory({ points: 3, duration: 60 }),
  // Endpoints that send mail. Tight, because the cost of abuse lands on the
  // account owner's inbox and our sending reputation.
  sendMail: new RateLimiterMemory({ points: 3, duration: 900 }),
  // Endpoints that redeem an emailed token. Looser: the token is 256 bits, so
  // guessing is not the threat, and a tight limit here would let an attacker
  // lock a legitimate user out of their own reset link.
  redeem: new RateLimiterMemory({ points: 15, duration: 900 }),
  global: new RateLimiterMemory({ points: 100, duration: 60 }),
};

/**
 * Per-calling-application ceiling, applied on top of the per-account limits.
 *
 * The account-keyed limiters stop one user's credentials being ground through;
 * this stops one misbehaving or compromised application saturating the service
 * for the others. Generous by design — it is a backstop, not a throttle.
 */
const clientLimiter = new RateLimiterMemory({ points: 600, duration: 60 });

export function rateLimitClient() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const client = req.serviceClient;

    // Unidentified callers are already refused by serviceAuth.
    if (!client) return next();

    try {
      await clientLimiter.consume(client);
      return next();
    } catch (rejection: any) {
      const retryAfter = Math.ceil((rejection?.msBeforeNext ?? 60000) / 1000);
      res.set('Retry-After', String(retryAfter));

      return res.status(429).json({
        error: {
          code: 'CLIENT_RATE_LIMIT',
          message: 'This application has exceeded its request quota',
          retry_after: retryAfter,
        },
      });
    }
  };
}

/**
 * Chooses what to count per request.
 *
 * Every call reaches this service from one of our Laravel backends, so `req.ip`
 * is the same handful of app servers for the entire user base — keying on it
 * alone would let one attacker lock out everybody. Where the request names an
 * account, that account is the bucket instead; the end-user IP is only
 * meaningful when the app forwards it (see `trust proxy` in app.ts).
 */
function keyFor(req: Request, type: LimitType): string {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : null;
  const ip = req.ip || 'unknown';

  if (type === 'global' || !email) return `${type}:ip:${ip}`;
  return `${type}:email:${email}`;
}

export function rateLimit(type: LimitType) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await limiters[type].consume(keyFor(req, type));
      return next();
    } catch (rejection: any) {
      const retryAfter = Math.ceil((rejection?.msBeforeNext ?? 60000) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: {
          code: 'RATE_LIMIT',
          message: 'Too many requests, please try again later',
          retry_after: retryAfter,
        },
      });
    }
  };
}
