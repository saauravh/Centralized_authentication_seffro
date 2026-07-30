"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
const errors_1 = require("../utils/errors");
function authenticate(tokenService) {
    return (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new errors_1.UnauthorizedError('Missing or invalid authorization header');
        }
        const token = authHeader.substring(7);
        try {
            const payload = tokenService.verifyAccessToken(token);
            req.userId = payload.sub;
            req.userEmail = payload.email;
            req.userFirstName = payload.first_name;
            req.userLastName = payload.last_name;
            next();
        }
        catch (err) {
            throw new errors_1.UnauthorizedError('Invalid or expired token');
        }
    };
}
//# sourceMappingURL=authenticate.js.map