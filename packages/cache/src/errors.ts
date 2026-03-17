import { MeridianError } from '@meridian/shared';

/**
 * Thrown when a cache provider fails to connect or execute an operation.
 */
export class CacheError extends MeridianError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'ERR_CACHE', 500, details);
    this.name = 'CacheError';
  }
}

/**
 * Thrown when a Redis connection cannot be established.
 */
export class CacheConnectionError extends MeridianError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'ERR_CACHE_CONNECTION', 503, details);
    this.name = 'CacheConnectionError';
  }
}

/**
 * Thrown when a serialization or deserialization step fails.
 */
export class CacheSerializationError extends MeridianError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'ERR_CACHE_SERIALIZATION', 500, details);
    this.name = 'CacheSerializationError';
  }
}
