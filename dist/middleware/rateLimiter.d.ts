import { Request, Response, NextFunction } from 'express';
export declare function rateLimit(type: 'login' | 'register' | 'global'): (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=rateLimiter.d.ts.map