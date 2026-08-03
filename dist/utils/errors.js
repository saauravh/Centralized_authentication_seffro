"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitError = exports.AccountLockedError = exports.EmailNotVerifiedError = exports.ConflictError = exports.NotFoundError = exports.UnauthorizedError = exports.BadRequestError = exports.AppError = void 0;
class AppError extends Error {
    statusCode;
    code;
    isOperational;
    constructor(message, statusCode, code = 'INTERNAL_ERROR') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
        Object.setPrototypeOf(this, AppError.prototype);
    }
}
exports.AppError = AppError;
class BadRequestError extends AppError {
    constructor(message = 'Bad request') {
        super(message, 400, 'BAD_REQUEST');
    }
}
exports.BadRequestError = BadRequestError;
class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized') {
        super(message, 401, 'UNAUTHORIZED');
    }
}
exports.UnauthorizedError = UnauthorizedError;
class NotFoundError extends AppError {
    constructor(message = 'Not found') {
        super(message, 404, 'NOT_FOUND');
    }
}
exports.NotFoundError = NotFoundError;
class ConflictError extends AppError {
    constructor(message = 'Conflict') {
        super(message, 409, 'CONFLICT');
    }
}
exports.ConflictError = ConflictError;
/**
 * Distinct from a plain 401 so the application can offer to re-send the
 * verification email rather than telling the user their password is wrong.
 */
class EmailNotVerifiedError extends AppError {
    constructor(message = 'Please verify your email address before signing in') {
        super(message, 403, 'EMAIL_NOT_VERIFIED');
    }
}
exports.EmailNotVerifiedError = EmailNotVerifiedError;
/**
 * Distinct from a bad password so the application can tell the user to wait
 * rather than letting them keep guessing against a lock they cannot see.
 */
class AccountLockedError extends AppError {
    constructor(message = 'Too many failed attempts. Please try again later.') {
        super(message, 423, 'ACCOUNT_LOCKED');
    }
}
exports.AccountLockedError = AccountLockedError;
class RateLimitError extends AppError {
    constructor(message = 'Too many requests') {
        super(message, 429, 'RATE_LIMIT');
    }
}
exports.RateLimitError = RateLimitError;
//# sourceMappingURL=errors.js.map