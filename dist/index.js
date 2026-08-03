"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const config_1 = require("./config");
const logger_1 = require("./utils/logger");
const serviceAuth_1 = require("./middleware/serviceAuth");
const ServiceClientRepository_1 = require("./repositories/ServiceClientRepository");
async function main() {
    try {
        await (0, serviceAuth_1.assertServiceCredentials)(new ServiceClientRepository_1.ServiceClientRepository());
        const app = await (0, app_1.createApp)();
        app.listen(config_1.config.port, () => {
            logger_1.logger.info(`Central Identity Service running on port ${config_1.config.port}`);
            logger_1.logger.info(`Environment: ${config_1.config.nodeEnv}`);
        });
    }
    catch (err) {
        logger_1.logger.error('Failed to start server', { error: err.message });
        process.exit(1);
    }
}
main();
//# sourceMappingURL=index.js.map