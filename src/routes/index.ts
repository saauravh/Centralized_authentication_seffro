import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { OAuthController } from '../controllers/OAuthController';
import { authenticate } from '../middleware/authenticate';
import { rateLimit } from '../middleware/rateLimiter';
import { TokenService } from '../services/TokenService';
import { AuthService } from '../services/AuthService';
import { UserRepository } from '../repositories/UserRepository';
import { TokenRepository } from '../repositories/TokenRepository';

export function createRoutes(
  authController: AuthController,
  oauthController: OAuthController,
  tokenService: TokenService
) {
  const router = Router();

  // Auth API (server-to-server from Laravel apps)
  router.post('/api/auth/register', rateLimit('register'), authController.register);
  router.post('/api/auth/login', rateLimit('login'), authController.login);
  router.post('/api/auth/refresh', authController.refresh);
  router.post('/api/auth/verify', authController.verify);
  router.post('/api/auth/logout', authController.logout);
  router.get('/api/auth/me', authenticate(tokenService), authController.me);
  router.post('/api/auth/change-password', authenticate(tokenService), authController.changePassword);
  router.post('/api/auth/forgot-password', rateLimit('global'), authController.forgotPassword);
  router.post('/api/auth/reset-password', rateLimit('global'), authController.resetPassword);

  // OAuth 2.1
  router.get('/oauth/authorize', oauthController.authorize);
  router.post('/oauth/authorize', oauthController.authorize);
  router.post('/oauth/token', oauthController.token);
  router.post('/oauth/revoke', oauthController.revoke);
  router.post('/oauth/introspect', oauthController.introspect);

  // OIDC Discovery
  router.get('/.well-known/openid-configuration', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      revocation_endpoint: `${baseUrl}/oauth/revoke`,
      introspection_endpoint: `${baseUrl}/oauth/introspect`,
      jwks_uri: `${baseUrl}/.well-known/jwks.json`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
    });
  });

  router.get('/.well-known/jwks.json', (req, res) => {
    res.json(tokenService.getJwks());
  });

  // Health check
  router.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return router;
}
