import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';

const loginLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60,
});

const registerLimiter = new RateLimiterMemory({
  points: 3,
  duration: 60,
});

const globalLimiter = new RateLimiterMemory({
  points: 100,
  duration: 1,
});

export function rateLimit(type: 'login' | 'register' | 'global') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const limiter = type === 'login' ? loginLimiter
      : type === 'register' ? registerLimiter
      : globalLimiter;

    try {
      await limiter.consume(key);
      next();
    } catch {
      return res.status(429).json({
        error: { code: 'RATE_LIMIT', message: 'Too many requests, please try again later' },
      });
    }
  };
}
