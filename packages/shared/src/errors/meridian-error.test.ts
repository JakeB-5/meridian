import { describe, it, expect } from 'vitest';
import {
  MeridianError,
  NotFoundError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  RateLimitError,
  ConnectionError,
  QueryExecutionError,
} from './meridian-error.js';

describe('MeridianError', () => {
  it('should create a base error with all fields', () => {
    const err = new MeridianError('Something failed', 'ERR_TEST', 500, { key: 'value' });
    expect(err.message).toBe('Something failed');
    expect(err.code).toBe('ERR_TEST');
    expect(err.statusCode).toBe(500);
    expect(err.details).toEqual({ key: 'value' });
    expect(err.name).toBe('MeridianError');
    expect(err.timestamp).toBeInstanceOf(Date);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(MeridianError);
  });

  it('should default statusCode to 500', () => {
    const err = new MeridianError('fail', 'ERR_X');
    expect(err.statusCode).toBe(500);
  });

  it('should serialize to JSON', () => {
    const err = new MeridianError('fail', 'ERR_X', 400, { foo: 'bar' });
    const json = err.toJSON();
    expect(json.name).toBe('MeridianError');
    expect(json.message).toBe('fail');
    expect(json.code).toBe('ERR_X');
    expect(json.statusCode).toBe(400);
    expect(json.details).toEqual({ foo: 'bar' });
    expect(typeof json.timestamp).toBe('string');
  });

  it('should have proper stack trace', () => {
    const err = new MeridianError('fail', 'ERR_X');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('MeridianError');
  });
});

describe('NotFoundError', () => {
  it('should create with resource and id', () => {
    const err = new NotFoundError('User', '123');
    expect(err.message).toBe("User with id '123' not found");
    expect(err.code).toBe('ERR_NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.name).toBe('NotFoundError');
    expect(err).toBeInstanceOf(MeridianError);
    expect(err).toBeInstanceOf(NotFoundError);
  });

  it('should create with resource only', () => {
    const err = new NotFoundError('Dashboard');
    expect(err.message).toBe('Dashboard not found');
  });

  it('should accept details', () => {
    const err = new NotFoundError('User', '123', { searched: 'everywhere' });
    expect(err.details).toEqual({ searched: 'everywhere' });
  });
});

describe('ValidationError', () => {
  it('should create with message and details', () => {
    const err = new ValidationError('Invalid email', { field: 'email' });
    expect(err.message).toBe('Invalid email');
    expect(err.code).toBe('ERR_VALIDATION');
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe('ValidationError');
    expect(err.details).toEqual({ field: 'email' });
    expect(err).toBeInstanceOf(MeridianError);
  });
});

describe('AuthenticationError', () => {
  it('should use default message', () => {
    const err = new AuthenticationError();
    expect(err.message).toBe('Authentication required');
    expect(err.code).toBe('ERR_AUTHENTICATION');
    expect(err.statusCode).toBe(401);
    expect(err.name).toBe('AuthenticationError');
  });

  it('should accept custom message', () => {
    const err = new AuthenticationError('Token expired');
    expect(err.message).toBe('Token expired');
  });
});

describe('AuthorizationError', () => {
  it('should use default message', () => {
    const err = new AuthorizationError();
    expect(err.message).toBe('Insufficient permissions');
    expect(err.code).toBe('ERR_AUTHORIZATION');
    expect(err.statusCode).toBe(403);
    expect(err.name).toBe('AuthorizationError');
  });
});

describe('ConflictError', () => {
  it('should create with message', () => {
    const err = new ConflictError('Email already exists');
    expect(err.message).toBe('Email already exists');
    expect(err.code).toBe('ERR_CONFLICT');
    expect(err.statusCode).toBe(409);
    expect(err.name).toBe('ConflictError');
  });
});

describe('RateLimitError', () => {
  it('should create with defaults', () => {
    const err = new RateLimitError();
    expect(err.message).toBe('Rate limit exceeded');
    expect(err.code).toBe('ERR_RATE_LIMIT');
    expect(err.statusCode).toBe(429);
    expect(err.name).toBe('RateLimitError');
  });

  it('should include retryAfterMs', () => {
    const err = new RateLimitError('Slow down', 5000);
    expect(err.retryAfterMs).toBe(5000);
    expect(err.details).toEqual({ retryAfterMs: 5000 });
  });
});

describe('ConnectionError', () => {
  it('should create with message', () => {
    const err = new ConnectionError('Cannot reach database');
    expect(err.message).toBe('Cannot reach database');
    expect(err.code).toBe('ERR_CONNECTION');
    expect(err.statusCode).toBe(503);
    expect(err.name).toBe('ConnectionError');
  });
});

describe('QueryExecutionError', () => {
  it('should create with message and details', () => {
    const err = new QueryExecutionError('Syntax error near SELECT', { sql: 'SELCT *' });
    expect(err.message).toBe('Syntax error near SELECT');
    expect(err.code).toBe('ERR_QUERY_EXECUTION');
    expect(err.statusCode).toBe(500);
    expect(err.name).toBe('QueryExecutionError');
    expect(err.details).toEqual({ sql: 'SELCT *' });
  });
});
