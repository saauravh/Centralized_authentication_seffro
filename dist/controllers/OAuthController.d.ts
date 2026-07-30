import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';
import { TokenService } from '../services/TokenService';
import { UserRepository } from '../repositories/UserRepository';
declare module 'express-session' {
    interface SessionData {
        userId?: number;
    }
}
export declare class OAuthController {
    private authService;
    private tokenService;
    private userRepo;
    constructor(authService: AuthService, tokenService: TokenService, userRepo: UserRepository);
    authorize: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
    token: (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
    revoke: (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
    introspect: (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
}
//# sourceMappingURL=OAuthController.d.ts.map