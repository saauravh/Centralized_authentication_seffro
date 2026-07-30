import { Request, Response, NextFunction } from 'express';
import { TokenService } from '../services/TokenService';
declare global {
    namespace Express {
        interface Request {
            userId?: number;
            userEmail?: string;
            userFirstName?: string;
            userLastName?: string;
        }
    }
}
export declare function authenticate(tokenService: TokenService): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=authenticate.d.ts.map