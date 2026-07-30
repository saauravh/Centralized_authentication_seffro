import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { UserRepository } from './repositories/UserRepository';
import { TokenRepository } from './repositories/TokenRepository';
import { TokenService } from './services/TokenService';
import { AuthService } from './services/AuthService';
import { AuthController } from './controllers/AuthController';
import { OAuthController } from './controllers/OAuthController';
import { createRoutes } from './routes';

export async function createApp() {
  const app = express();

  // View engine for auth pages
  app.set('view engine', 'ejs');
  app.set('views', path.resolve(__dirname, '../views'));

  // Middleware
  app.use(helmet());
  app.use(cors({
    origin: config.cors.origin || true,
    credentials: true,
  }));
  app.use(morgan('combined', { stream: { write: (msg: string) => logger.info(msg.trim()) } }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Session (for OAuth authorization page)
  app.use(session({
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.nodeEnv === 'production',
      httpOnly: true,
      maxAge: config.session.ttl,
      sameSite: 'lax',
      domain: config.nodeEnv === 'production' ? config.cookie.domain : undefined,
    },
  }));

  // Services
  const userRepo = new UserRepository();
  const tokenRepo = new TokenRepository();
  const tokenService = new TokenService();
  const authService = new AuthService(userRepo, tokenRepo, tokenService);

  // Controllers
  const authController = new AuthController(authService);
  const oauthController = new OAuthController(authService, tokenService, userRepo);

  // Routes
  app.use(createRoutes(authController, oauthController, tokenService));

  // Error handler
  app.use(errorHandler);

  return app;
}
