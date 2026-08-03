import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';
import { ServiceClientRepository } from '../repositories/ServiceClientRepository';

declare global {
  namespace Express {
    interface Request {
      serviceClient?: string;
    }
  }
}

/**
 * Gate for the whole auth API.
 *
 * Every endpoint behind this can mint a session given a password, so reaching
 * port 3001 must not be sufficient on its own. Each application sends its own
 * secret as `X-Service-Secret`.
 *
 * Credentials live in the service_clients table. SERVICE_SECRET in the
 * environment still works as a single shared fallback, which keeps existing
 * deployments running while clients are provisioned, but per-client rows are
 * what allow one app's secret to be rotated without disturbing the others.
 */
export function serviceAuth(clientRepo: ServiceClientRepository) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const presented = req.headers['x-service-secret'];

    if (typeof presented !== 'string' || presented === '') {
      return reject(req, res, 'missing service secret');
    }

    // Table first, so a provisioned client always wins over the shared fallback.
    try {
      const client = await clientRepo.findBySecret(presented);

      if (client) {
        req.serviceClient = client.client_name;
        void clientRepo.touch(client.id);

        return next();
      }
    } catch (err) {
      logger.error('Service client lookup failed', { error: (err as Error).message });

      return res.status(503).json({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Unable to verify service credentials' },
      });
    }

    if (config.serviceSecret && timingSafeEqual(presented, config.serviceSecret)) {
      req.serviceClient = 'env';

      return next();
    }

    return reject(req, res, 'invalid service secret');
  };
}

/**
 * Refuses to start a production instance that anything can call.
 * A misconfiguration here is silent in every other respect.
 */
export async function assertServiceCredentials(clientRepo: ServiceClientRepository): Promise<void> {
  if (config.nodeEnv !== 'production') {
    return;
  }

  if (config.serviceSecret) {
    return;
  }

  const clients = await clientRepo.count().catch(() => 0);

  if (clients === 0) {
    logger.error(
      'No active service_clients and no SERVICE_SECRET set. ' +
        'Provision a client with: npm run create-client <name>'
    );
    process.exit(1);
  }
}

function reject(req: Request, res: Response, reason: string) {
  logger.warn('Rejected request', { reason, path: req.path, ip: req.ip });

  return res.status(401).json({
    error: { code: 'SERVICE_UNAUTHORIZED', message: 'Invalid service credentials' },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  // crypto.timingSafeEqual throws on length mismatch, which would itself leak
  // length. Compare digests so the inputs are always the same size.
  return crypto.timingSafeEqual(
    crypto.createHash('sha256').update(a).digest(),
    crypto.createHash('sha256').update(b).digest()
  );
}
