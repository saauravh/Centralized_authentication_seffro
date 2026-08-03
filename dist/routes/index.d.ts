import { AuthController } from '../controllers/AuthController';
import { TokenService } from '../services/TokenService';
import { ServiceClientRepository } from '../repositories/ServiceClientRepository';
/**
 * The service's entire surface.
 *
 * Everything here is called by our own Laravel backends, never by a browser.
 * There is deliberately no hosted login page, no authorization endpoint and no
 * redirect flow: users stay on the application they started from.
 */
export declare function createRoutes(authController: AuthController, tokenService: TokenService, clientRepo: ServiceClientRepository): import("express-serve-static-core").Router;
//# sourceMappingURL=index.d.ts.map