import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { assertServiceCredentials } from './middleware/serviceAuth';
import { ServiceClientRepository } from './repositories/ServiceClientRepository';

async function main() {
  try {
    await assertServiceCredentials(new ServiceClientRepository());

    const app = await createApp();

    app.listen(config.port, () => {
      logger.info(`Central Identity Service running on port ${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
    });
  } catch (err) {
    logger.error('Failed to start server', { error: (err as Error).message });
    process.exit(1);
  }
}

main();
