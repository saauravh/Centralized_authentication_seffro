import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';
import { TokenService } from '../services/TokenService';
import { UserRepository } from '../repositories/UserRepository';
import { query, queryOne } from '../config/database';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { BadRequestError, UnauthorizedError } from '../utils/errors';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
  }
}

const CODE_TTL = 600;

export class OAuthController {
  constructor(
    private authService: AuthService,
    private tokenService: TokenService,
    private userRepo: UserRepository
  ) {}

  authorize = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { client_id, redirect_uri, response_type, code_challenge, code_challenge_method, state } = req.query;

      if (response_type !== 'code') {
        return res.status(400).json({ error: 'unsupported_response_type' });
      }

      if (!client_id || !redirect_uri) {
        return res.status(400).json({ error: 'invalid_request' });
      }

      const client = await queryOne(
        'SELECT * FROM oauth_clients WHERE client_id = ?',
        [client_id]
      );
      if (!client) {
        return res.status(400).json({ error: 'invalid_client' });
      }

      const uris: string[] = JSON.parse(client.redirect_uris || '[]');
      if (!uris.includes(redirect_uri as string)) {
        return res.status(400).json({ error: 'invalid_redirect_uri' });
      }

      if (req.session?.userId) {
        const user = await this.userRepo.findById(req.session.userId);
        if (!user) {
          return res.redirect(`${redirect_uri}?error=invalid_user&state=${state || ''}`);
        }

        const code = uuidv4();
        await query(
          `INSERT INTO oauth_authorization_codes (code, client_id, user_id, redirect_uri, code_challenge,
            code_challenge_method, scopes, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
          [code, client.client_id, user.id, redirect_uri, code_challenge || null,
           code_challenge_method || null, JSON.stringify([]), CODE_TTL]
        );

        return res.redirect(`${redirect_uri}?code=${code}&state=${state || ''}`);
      }

      const { email, password } = req.body;
      if (!email || !password) {
        return res.render('login', {
          client_id,
          redirect_uri,
          code_challenge,
          code_challenge_method,
          state,
          error: null,
        });
      }

      const result = await this.authService.login(email as string, password as string);
      req.session.userId = result.user.id;

      const code = uuidv4();
      await query(
        `INSERT INTO oauth_authorization_codes (code, client_id, user_id, redirect_uri, code_challenge,
          code_challenge_method, scopes, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
        [code, client.client_id, result.user.id, redirect_uri, code_challenge || null,
         code_challenge_method || null, JSON.stringify([]), CODE_TTL]
      );

      return res.redirect(`${redirect_uri}?code=${code}&state=${state || ''}`);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return res.render('login', {
          client_id: req.query.client_id,
          redirect_uri: req.query.redirect_uri,
          code_challenge: req.query.code_challenge,
          code_challenge_method: req.query.code_challenge_method,
          state: req.query.state,
          error: 'Invalid email or password',
        });
      }
      next(err);
    }
  };

  token = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { grant_type, code, redirect_uri, client_id, client_secret, code_verifier, refresh_token } = req.body;

      if (grant_type === 'authorization_code') {
        if (!code || !client_id || !client_secret) {
          return res.status(400).json({ error: 'invalid_request' });
        }

        const storedCode = await queryOne(
          'SELECT * FROM oauth_authorization_codes WHERE code = ? AND client_id = ? AND used = 0 AND expires_at > NOW()',
          [code, client_id]
        );
        if (!storedCode) {
          return res.status(400).json({ error: 'invalid_grant' });
        }

        if (storedCode.code_challenge && code_verifier) {
          const verifierHash = crypto
            .createHash('sha256')
            .update(code_verifier)
            .digest('base64url');
          if (verifierHash !== storedCode.code_challenge) {
            return res.status(400).json({ error: 'invalid_grant', message: 'PKCE verification failed' });
          }
        }

        await query('UPDATE oauth_authorization_codes SET used = 1 WHERE code = ?', [code]);

        const user = await this.userRepo.findById(storedCode.user_id);
        if (!user || user.status !== 'active') {
          return res.status(400).json({ error: 'invalid_grant' });
        }

        const accessToken = this.tokenService.generateAccessToken(user);
        const refreshTokenValue = crypto.randomUUID();
        const tokenHash = crypto.createHash('sha256').update(refreshTokenValue).digest('hex');
        await query(
          `INSERT INTO refresh_tokens (user_id, token_hash, device, expires_at)
           VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 604800 SECOND))`,
          [user.id, tokenHash, req.headers['user-agent'] || null]
        );

        return res.json({
          access_token: accessToken,
          refresh_token: refreshTokenValue,
          token_type: 'Bearer',
          expires_in: 900,
        });
      }

      if (grant_type === 'refresh_token') {
        if (!refresh_token) {
          return res.status(400).json({ error: 'invalid_request' });
        }

        const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');
        const stored = await queryOne(
          'SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked = 0 AND expires_at > NOW()',
          [tokenHash]
        );
        if (!stored) {
          return res.status(400).json({ error: 'invalid_grant' });
        }

        await query('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?', [tokenHash]);

        const user = await this.userRepo.findById(stored.user_id);
        if (!user || user.status !== 'active') {
          return res.status(400).json({ error: 'invalid_grant' });
        }

        const accessToken = this.tokenService.generateAccessToken(user);
        const newRefreshToken = crypto.randomUUID();
        const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
        await query(
          `INSERT INTO refresh_tokens (user_id, token_hash, device, expires_at)
           VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 604800 SECOND))`,
          [user.id, newHash, stored.device]
        );

        return res.json({
          access_token: accessToken,
          refresh_token: newRefreshToken,
          token_type: 'Bearer',
          expires_in: 900,
        });
      }

      return res.status(400).json({ error: 'unsupported_grant_type' });
    } catch (err) {
      next(err);
    }
  };

  revoke = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refresh_token } = req.body;
      if (refresh_token) {
        const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');
        await query('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?', [tokenHash]);
      }
      return res.json({ success: true });
    } catch (err) {
      next(err);
    }
  };

  introspect = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.body;
      if (!token) {
        return res.json({ active: false });
      }
      try {
        this.tokenService.verifyAccessToken(token);
        return res.json({ active: true });
      } catch {
        return res.json({ active: false });
      }
    } catch (err) {
      next(err);
    }
  };
}
