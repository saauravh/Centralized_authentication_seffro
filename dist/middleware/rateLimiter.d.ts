import { Request, Response, NextFunction } from 'express';
export type LimitType = 'login' | 'register' | 'sendMail' | 'redeem' | 'global';
export declare function rateLimitClient(): (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare function rateLimit(type: LimitType): (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
//# sourceMappingURL=rateLimiter.d.ts.map