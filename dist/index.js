"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const config_1 = require("./config");
const logger_1 = require("./utils/logger");
async function main() {
    try {
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