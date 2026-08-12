import { Request, Response, NextFunction } from 'express';
import { AuthService, AuthResult, isExistingIdentity } from '../services/AuthService';
import { RequestContext } from '../repositories/LoginHistoryRepository';
import { UserPublic } from '../models/User';
import { z } from 'zod';

/** Roles an identity may hold. Each application maps these onto its own actors
 *  (Seffro: users/vendors/agents; Helppu: customers/providers/handymen). */
const ROLES = ['user', 'vendor', 'agent', 'provider', 'handyman', 'admin'] as const;

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  phone: z.string().max(20).optional(),
  role: z.enum(ROLES).default('user').optional(),
});

/**
 * Login takes one identifier, which may be an email address or a mobile number.
 *
 * `email` is not validated as an address any more and `phone` is accepted as an
 * alias, so every existing client keeps working whichever field name it already
 * sends and whichever of the two the user typed into it.
 */
const loginSchema = z
  .object({
    identifier: z.string().min(3).max(255).optional(),
    email: z.string().min(3).max(255).optional(),
    phone: z.string().min(3).max(255).optional(),
    password: z.string(),
  })
  .refine((data) => loginIdentifier(data) !== null, {
    message: 'An email address or mobile number is required',
    path: ['identifier'],
  });

function loginIdentifier(data: {
  identifier?: string;
  email?: string;
  phone?: string;
}): string | null {
  for (const value of [data.identifier, data.email, data.phone]) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return null;
}

const refreshSchema = z.object({
  refresh_token: z.string().min(32).max(128),
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
  token: z.string().min(32).max(128),
  new_password: z.string().min(8).max(128),
});

const verifyEmailSchema = z.object({
  email: z.string().email(),
  token: z.string().min(32).max(128),
});

const resendVerificationSchema = z.object({
  email: z.string().email(),
});

const ssoTicketSchema = z.object({
  target: z.enum(['seffro', 'helppu']),
});

const ssoRedeemSchema = z.object({
  token: z.string().min(32).max(128),
  app: z.enum(['seffro', 'helppu']),
});

// Only the identity fields this service owns. Password has its own endpoint, and
// status is never client-writable.
const updateProfileSchema = z
  .object({
    first_name: z.string().min(1).max(100).optional(),
    last_name: z.string().min(1).max(100).optional(),
    phone: z.string().max(20).nullable().optional(),
    email: z.string().email().optional(),
    avatar: z.string().max(500).nullable().optional(),
    role: z.enum(ROLES).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export class AuthController {
  constructor(private authService: AuthService) {}

  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = registerSchema.parse(req.body);
      const result = await this.authService.register(data, context(req));

      // 200, not 409: an existing identity is a normal outcome the application
      // handles in its own UI. The central id is withheld — see
      // AuthService.register for why.
      if (isExistingIdentity(result)) {
        return res.status(200).json({ user_exists: true });
      }

      // No session here by design. The application sends the user to log in.
      return res.status(201).json({
        central_user_id: result.centralUserId,
        verification_required: result.verificationRequired,
      });
    } catch (err) {
      return handle(err, res, next);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = loginSchema.parse(req.body);
      const result = await this.authService.login(
        loginIdentifier(data) as string,
        data.password,
        req.headers['user-agent'],
        context(req)
      );
      return res.json(serializeAuthResult(result));
    } catch (err) {
      return handle(err, res, next);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = refreshSchema.parse(req.body);
      const result = await this.authService.refresh(data.refresh_token, context(req));
      return res.json(serializeAuthResult(result));
    } catch (err) {
      return handle(err, res, next);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refresh_token } = req.body;
      if (refresh_token) {
        // The access token is optional but worth sending: without it the token
        // already in the user's hands stays usable until it expires.
        await this.authService.logout(refresh_token, bearer(req) ?? undefined, context(req));
      }
      return res.json({ success: true });
    } catch (err) {
      return handle(err, res, next);
    }
  };

  /**
   * The only token-inspection endpoint.
   *
   * Checks the signature and then everything a signature cannot know: whether
   * this token was revoked, whether all the user's tokens were revoked, whether
   * the account is still active and verified.
   */
  validate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = bearer(req) ?? (typeof req.body?.token === 'string' ? req.body.token : null);
      if (!token) {
        return res.status(401).json({ valid: false, reason: 'invalid_token' });
      }

      const result = await this.authService.validateToken(token);

      if (!result.valid) {
        return res.status(401).json({ valid: false, reason: result.reason });
      }

      return res.json({ valid: true, user: serializeUser(result.user!) });
    } catch (err) {
      return handle(err, res, next);
    }
  };

  updateProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = updateProfileSchema.parse(req.body);
      if (!req.userId) {
        return res
          .status(401)
          .json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }

      const user = await this.authService.updateProfile(req.userId, data, context(req));

      return res.json({ user: serializeUser(user) });
    } catch (err) {
      return handle(err, res, next);
    }
  };

  me = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = bearer(req);
      if (!token) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
      }
      const user = await this.authService.verifyToken(token);
      return res.json({ user: serializeUser(user) });
    } catch (err) {
      return handle(err, res, next);
    }
  };

  changePassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = changePasswordSchema.parse(req.body);
      if (!req.userId) {
        return res
          .status(401)
          .json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      await this.authService.changePassword(
        req.userId,
        data.current_password,
        data.new_password,
        context(req)
      );
      return res.json({ success: true });
    } catch (err) {
      return handle(err, res, next);
    }
  };

  forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = forgotPasswordSchema.parse(req.body);
      await this.authService.forgotPassword(data.email, context(req));
      return res.json({ success: true });
    } catch (err) {
      return handle(err, res, next);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = resetPasswordSchema.parse(req.body);
      await this.authService.resetPassword(data.email, data.token, data.new_password, context(req));
      return res.json({ success: true });
    } catch (err) {
      return handle(err, res, next);
    }
  };

  verifyEmail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = verifyEmailSchema.parse({ ...req.query, ...req.body });
      const user = await this.authService.verifyEmail(data.email, data.token, context(req));
      return res.json({ success: true, user: serializeUser(user) });
    } catch (err) {
      return handle(err, res, next);
    }
  };

  resendVerification = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = resendVerificationSchema.parse(req.body);
      await this.authService.resendVerification(data.email);
      return res.json({ success: true });
    } catch (err) {
      return handle(err, res, next);
    }
  };

  /** Mints a single-use ticket for cross-application sign-on. */
  createSsoTicket = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = ssoTicketSchema.parse(req.body);
      if (!req.userId) {
        return res
          .status(401)
          .json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }

      const issued = await this.authService.createSsoTicket(req.userId, data.target, context(req));

      return res.json({ token: issued.token, expires_in: issued.expiresIn });
    } catch (err) {
      return handle(err, res, next);
    }
  };

  /** Redeems a ticket for a fresh session, letting the user in without a password. */
  redeemSsoTicket = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = ssoRedeemSchema.parse(req.body);
      const result = await this.authService.redeemSsoTicket(data.token, data.app, context(req));

      return res.json(serializeAuthResult(result));
    } catch (err) {
      return handle(err, res, next);
    }
  };
}

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.substring(7).trim() || null;
}

function context(req: Request): RequestContext {
  return { ip: req.ip, userAgent: req.headers['user-agent'] || null };
}

function handle(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: err.errors } });
  }
  return next(err);
}

/** Wire format is snake_case throughout, matching the Laravel consumers. */
function serializeUser(user: UserPublic) {
  return {
    id: user.id,
    uuid: user.uuid,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    phone: user.phone,
    avatar: user.avatar,
    email_verified: user.email_verified,
    email_verified_at: user.email_verified_at,
    status: user.status,
    role: user.role,
  };
}

function serializeAuthResult(result: AuthResult) {
  return {
    access_token: result.accessToken,
    refresh_token: result.refreshToken,
    expires_in: result.expiresIn,
    token_type: 'Bearer',
    user: serializeUser(result.user),
  };
}
