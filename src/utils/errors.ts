export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;

  constructor(message: string, statusCode: number, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request') {
    super(message, 400, 'BAD_REQUEST');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Conflict') {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * Distinct from a plain 401 so the application can offer to re-send the
 * verification email rather than telling the user their password is wrong.
 */
export class EmailNotVerifiedError extends AppError {
  constructor(message: string = 'Please verify your email address before signing in') {
    super(message, 403, 'EMAIL_NOT_VERIFIED');
  }
}

/**
 * Distinct from a bad password so the application can tell the user to wait
 * rather than letting them keep guessing against a lock they cannot see.
 */
export class AccountLockedError extends AppError {
  constructor(message: string = 'Too many failed attempts. Please try again later.') {
    super(message, 423, 'ACCOUNT_LOCKED');
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT');
  }
}
