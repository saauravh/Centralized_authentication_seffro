import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticate } from '../middleware/authenticate';
import { serviceAuth } from '../middleware/serviceAuth';
import { rateLimit, rateLimitClient } from '../middleware/rateLimiter';
import { TokenService } from '../services/TokenService';
import { ServiceClientRepository } from '../repositories/ServiceClientRepository';

/**
 * The service's entire surface.
 *
 * Everything here is called by our own Laravel backends, never by a browser.
 * There is deliberately no hosted login page, no authorization endpoint and no
 * redirect flow: users stay on the application they started from.
 */
export function createRoutes(
  authController: AuthController,
  tokenService: TokenService,
  clientRepo: ServiceClientRepository
) {
  const router = Router();

  // Guards the whole surface: these endpoints trust their caller to be one of
  // our own backends, identified by its own service client secret. The client
  // quota runs after, so it can key on the identified caller.
  router.use('/api/auth', serviceAuth(clientRepo), rateLimitClient());

  // Identity lifecycle. register creates the account but issues no session —
  // login is the only path that does, and the only place verification is checked.
  router.post('/api/auth/register', rateLimit('register'), authController.register);
  router.post('/api/auth/login', rateLimit('login'), authController.login);
  router.post('/api/auth/refresh', authController.refresh);
  router.post('/api/auth/logout', authController.logout);

  // One inspection endpoint, not two. A signature-only check was easy to reach
  // for by mistake and would happily accept a token belonging to a banned
  // account; this always consults revocation and account status as well.
  router.post('/api/auth/validate-token', authController.validate);

  // Profile.
  router.get('/api/auth/me', authenticate(tokenService), authController.me);
  router.patch('/api/auth/profile', authenticate(tokenService), authController.updateProfile);
  router.post('/api/auth/change-password', authenticate(tokenService), authController.changePassword);

  // Account recovery and verification.
  router.post('/api/auth/forgot-password', rateLimit('sendMail'), authController.forgotPassword);
  router.post('/api/auth/reset-password', rateLimit('redeem'), authController.resetPassword);
  router.post('/api/auth/verify-email', rateLimit('redeem'), authController.verifyEmail);
  router.post('/api/auth/resend-verification', rateLimit('sendMail'), authController.resendVerification);

  // Unauthenticated: used by load balancers and deploy checks.
  router.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return router;
}
