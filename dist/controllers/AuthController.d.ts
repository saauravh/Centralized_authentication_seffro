import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
    register: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
    login: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
    refresh: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
    logout: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
    /**
     * The only token-inspection endpoint.
     *
     * Checks the signature and then everything a signature cannot know: whether
     * this token was revoked, whether all the user's tokens were revoked, whether
     * the account is still active and verified.
     */
    validate: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
    updateProfile: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
    me: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
    changePassword: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
    forgotPassword: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
    resetPassword: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
    verifyEmail: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
    resendVerification: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
    /** Mints a single-use ticket for cross-application sign-on. */
    createSsoTicket: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
    /** Redeems a ticket for a fresh session, letting the user in without a password. */
    redeemSsoTicket: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
}
//# sourceMappingURL=AuthController.d.ts.map