/** Base error class for all auth package errors */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = 'AuthError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TokenExpiredError extends AuthError {
  constructor(message = 'Token has expired') {
    super(message, 'TOKEN_EXPIRED', 401);
    this.name = 'TokenExpiredError';
  }
}

export class TokenInvalidError extends AuthError {
  constructor(message = 'Token is invalid') {
    super(message, 'TOKEN_INVALID', 401);
    this.name = 'TokenInvalidError';
  }
}

export class TokenMissingError extends AuthError {
  constructor(message = 'Authorization token is missing') {
    super(message, 'TOKEN_MISSING', 401);
    this.name = 'TokenMissingError';
  }
}

export class PermissionDeniedError extends AuthError {
  constructor(
    public readonly requiredPermission: string,
    message?: string,
  ) {
    super(
      message ?? `Permission denied: '${requiredPermission}' is required`,
      'PERMISSION_DENIED',
      403,
    );
    this.name = 'PermissionDeniedError';
  }
}

export class OrganizationAccessDeniedError extends AuthError {
  constructor(orgId: string) {
    super(
      `Access denied to organization '${orgId}'`,
      'ORG_ACCESS_DENIED',
      403,
    );
    this.name = 'OrganizationAccessDeniedError';
  }
}

export class PasswordWeakError extends AuthError {
  constructor(
    public readonly violations: string[],
    message?: string,
  ) {
    super(
      message ?? `Password does not meet strength requirements: ${violations.join(', ')}`,
      'PASSWORD_WEAK',
      400,
    );
    this.name = 'PasswordWeakError';
  }
}

export class SessionNotFoundError extends AuthError {
  constructor(sessionId: string) {
    super(`Session '${sessionId}' not found`, 'SESSION_NOT_FOUND', 401);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionRevokedError extends AuthError {
  constructor(sessionId: string) {
    super(`Session '${sessionId}' has been revoked`, 'SESSION_REVOKED', 401);
    this.name = 'SessionRevokedError';
  }
}

export class MaxSessionsExceededError extends AuthError {
  constructor(userId: string, maxSessions: number) {
    super(
      `User '${userId}' has reached the maximum of ${maxSessions} active sessions`,
      'MAX_SESSIONS_EXCEEDED',
      429,
    );
    this.name = 'MaxSessionsExceededError';
  }
}

export class RateLimitExceededError extends AuthError {
  constructor(
    identifier: string,
    public readonly retryAfterMs: number,
  ) {
    super(
      `Rate limit exceeded for '${identifier}'. Retry after ${Math.ceil(retryAfterMs / 1000)}s`,
      'RATE_LIMIT_EXCEEDED',
      429,
    );
    this.name = 'RateLimitExceededError';
  }
}

export class SSOError extends AuthError {
  constructor(provider: string, detail: string) {
    super(`SSO error from provider '${provider}': ${detail}`, 'SSO_ERROR', 502);
    this.name = 'SSOError';
  }
}
