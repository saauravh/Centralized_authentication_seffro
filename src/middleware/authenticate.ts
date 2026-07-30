import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../utils/errors';
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

export function authenticate(tokenService: TokenService) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);
    try {
      const payload = tokenService.verifyAccessToken(token);
      req.userId = payload.sub;
      req.userEmail = payload.email;
      req.userFirstName = payload.first_name;
      req.userLastName = payload.last_name;
      next();
    } catch (err) {
      throw new UnauthorizedError('Invalid or expired token');
    }
  };
}
