// Types
export type { CacheOptions, CacheProvider, CacheStats } from './types.js';

// Errors
export { CacheError, CacheConnectionError, CacheSerializationError } from './errors.js';

// Logger
export { createLogger } from './logger.js';
export type { Logger, LogLevel } from './logger.js';

// Providers
export { MemoryCache } from './providers/memory-cache.js';
export type { MemoryCacheOptions } from './providers/memory-cache.js';

export { RedisCache } from './providers/redis-cache.js';
export type { RedisCacheOptions } from './providers/redis-cache.js';

export { NullCache } from './providers/null-cache.js';

// Multi-layer
export { MultiLayerCache } from './multi-layer-cache.js';

// Cache key utilities
export { generateCacheKey, buildCacheKeyLabel } from './cache-key.js';
export type { CacheKeyParts } from './cache-key.js';

// Decorators / HOFs
export { withCache, invalidateCache, invalidateCacheNamespace } from './decorators/cacheable.js';
