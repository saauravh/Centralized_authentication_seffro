"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimit = rateLimit;
const rate_limiter_flexible_1 = require("rate-limiter-flexible");
const loginLimiter = new rate_limiter_flexible_1.RateLimiterMemory({
    points: 5,
    duration: 60,
});
const registerLimiter = new rate_limiter_flexible_1.RateLimiterMemory({
    points: 3,
    duration: 60,
});
const globalLimiter = new rate_limiter_flexible_1.RateLimiterMemory({
    points: 100,
    duration: 1,
});
function rateLimit(type) {
    return async (req, res, next) => {
        const key = req.ip || 'unknown';
        const limiter = type === 'login' ? loginLimiter
            : type === 'register' ? registerLimiter
                : globalLimiter;
        try {
            await limiter.consume(key);
            next();
        }
        catch {
            return res.status(429).json({
                error: { code: 'RATE_LIMIT', message: 'Too many requests, please try again later' },
            });
        }
    };
}
//# sourceMappingURL=rateLimiter.js.map