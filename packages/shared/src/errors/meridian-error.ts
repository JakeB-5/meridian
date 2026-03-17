/**
 * Base error class for all Meridian application errors.
 * Provides structured error information including error code and HTTP status.
 */
export class MeridianError extends Error {
  public readonly timestamp: Date;

  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MeridianError';
    this.timestamp = new Date();

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

/**
 * Resource not found (HTTP 404)
 */
export class NotFoundError extends MeridianError {
  constructor(resource: string, id?: string, details?: Record<string, unknown>) {
    const message = id
      ? `${resource} with id '${id}' not found`
      : `${resource} not found`;
    super(message, 'ERR_NOT_FOUND', 404, details);
    this.name = 'NotFoundError';
  }
}

/**
 * Validation failure (HTTP 400)
 */
export class ValidationError extends MeridianError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'ERR_VALIDATION', 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Authentication failure — invalid or missing credentials (HTTP 401)
 */
export class AuthenticationError extends MeridianError {
  constructor(message: string = 'Authentication required', details?: Record<string, unknown>) {
    super(message, 'ERR_AUTHENTICATION', 401, details);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization failure — insufficient permissions (HTTP 403)
 */
export class AuthorizationError extends MeridianError {
  constructor(message: string = 'Insufficient permissions', details?: Record<string, unknown>) {
    super(message, 'ERR_AUTHORIZATION', 403, details);
    this.name = 'AuthorizationError';
  }
}

/**
 * Resource conflict (HTTP 409)
 */
export class ConflictError extends MeridianError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'ERR_CONFLICT', 409, details);
    this.name = 'ConflictError';
  }
}

/**
 * Rate limit exceeded (HTTP 429)
 */
export class RateLimitError extends MeridianError {
  public readonly retryAfterMs?: number;

  constructor(message: string = 'Rate limit exceeded', retryAfterMs?: number, details?: Record<string, unknown>) {
    super(message, 'ERR_RATE_LIMIT', 429, { ...details, retryAfterMs });
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Connection failure to external service (HTTP 503)
 */
export class ConnectionError extends MeridianError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'ERR_CONNECTION', 503, details);
    this.name = 'ConnectionError';
  }
}

/**
 * Query execution failure (HTTP 500)
 */
export class QueryExecutionError extends MeridianError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'ERR_QUERY_EXECUTION', 500, details);
    this.name = 'QueryExecutionError';
  }
}
