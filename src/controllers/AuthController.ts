import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const refreshSchema = z.object({
  refresh_token: z.string().uuid(),
});

const changePasswordSchema = z.object({
  current_password: z.string(),
  new_password: z.string().min(8).max(128),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  token: z.string(),
  new_password: z.string().min(8).max(128),
});

export class AuthController {
  constructor(private authService: AuthService) {}

  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = registerSchema.parse(req.body);
      const user = await this.authService.register(data);
      return res.status(201).json({ user });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: err.errors } });
      }
      next(err);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = loginSchema.parse(req.body);
      const result = await this.authService.login(data.email, data.password, req.headers['user-agent']);
      return res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: err.errors } });
      }
      next(err);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = refreshSchema.parse(req.body);
      const result = await this.authService.refresh(data.refresh_token);
      return res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: err.errors } });
      }
      next(err);
    }
  };

  verify = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
      }
      const token = authHeader.substring(7);
      const user = await this.authService.verifyToken(token);
      return res.json({ valid: true, user });
    } catch (err) {
      return res.status(401).json({ valid: false, error: (err as Error).message });
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refresh_token } = req.body;
      if (refresh_token) {
        await this.authService.logout(refresh_token);
      }
      return res.json({ success: true });
    } catch (err) {
      next(err);
    }
  };

  me = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
      }
      const token = authHeader.substring(7);
      const user = await this.authService.verifyToken(token);
      return res.json({ user });
    } catch (err) {
      next(err);
    }
  };

  changePassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = changePasswordSchema.parse(req.body);
      if (!req.userId) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      await this.authService.changePassword(req.userId, data.current_password, data.new_password);
      return res.json({ success: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: err.errors } });
      }
      next(err);
    }
  };

  forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = forgotPasswordSchema.parse(req.body);
      await this.authService.forgotPassword(data.email);
      return res.json({ success: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: err.errors } });
      }
      next(err);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = resetPasswordSchema.parse(req.body);
      await this.authService.resetPassword(data.email, data.token, data.new_password);
      return res.json({ success: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: err.errors } });
      }
      next(err);
    }
  };
}
