import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { UserRepository } from './repositories/UserRepository';
import { TokenRepository } from './repositories/TokenRepository';
import { AuthTokenRepository } from './repositories/AuthTokenRepository';
import { SsoTicketRepository } from './repositories/SsoTicketRepository';
import { LoginHistoryRepository } from './repositories/LoginHistoryRepository';
import { RevocationRepository } from './repositories/RevocationRepository';
import { ServiceClientRepository } from './repositories/ServiceClientRepository';
import { TokenService } from './services/TokenService';
import { EmailService } from './services/EmailService';
import { AuthService } from './services/AuthService';
import { AuthController } from './controllers/AuthController';
import { createRoutes } from './routes';

/**
 * Headless identity service.
 *
 * No view engine and no session middleware: this process serves JSON to our own
 * Laravel backends and nothing else. Users never reach it with a browser.
 */
export async function createApp() {
  const app = express();

  // Requests arrive from the Laravel backends, which forward the end user's
  // address. Without this, req.ip is always the app server and the per-IP rate
  // limits are meaningless.
  app.set('trust proxy', true);

  app.use(helmet());
  app.use(cors({
    origin: config.cors.origin || true,
    credentials: true,
  }));
  app.use(morgan('combined', { stream: { write: (msg: string) => logger.info(msg.trim()) } }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Services
  const userRepo = new UserRepository();
  const tokenRepo = new TokenRepository();
  const authTokenRepo = new AuthTokenRepository();
  const ssoTicketRepo = new SsoTicketRepository();
  const historyRepo = new LoginHistoryRepository();
  const revocationRepo = new RevocationRepository();
  const clientRepo = new ServiceClientRepository();
  const tokenService = new TokenService();
  const emailService = new EmailService();
  const authService = new AuthService(
    userRepo,
    tokenRepo,
    tokenService,
    authTokenRepo,
    emailService,
    historyRepo,
    revocationRepo,
    ssoTicketRepo
  );

  const authController = new AuthController(authService);

  app.use(createRoutes(authController, tokenService, clientRepo));

  app.use(errorHandler);

  return app;
}
