export declare class AppError extends Error {
    statusCode: number;
    code: string;
    isOperational: boolean;
    constructor(message: string, statusCode: number, code?: string);
}
export declare class BadRequestError extends AppError {
    constructor(message?: string);
}
export declare class UnauthorizedError extends AppError {
    constructor(message?: string);
}
export declare class NotFoundError extends AppError {
    constructor(message?: string);
}
export declare class ConflictError extends AppError {
    constructor(message?: string);
}
/**
 * Distinct from a plain 401 so the application can offer to re-send the
 * verification email rather than telling the user their password is wrong.
 */
export declare class EmailNotVerifiedError extends AppError {
    constructor(message?: string);
}
/**
 * Distinct from a bad password so the application can tell the user to wait
 * rather than letting them keep guessing against a lock they cannot see.
 */
export declare class AccountLockedError extends AppError {
    constructor(message?: string);
}
export declare class RateLimitError extends AppError {
    constructor(message?: string);
}
//# sourceMappingURL=errors.d.ts.map