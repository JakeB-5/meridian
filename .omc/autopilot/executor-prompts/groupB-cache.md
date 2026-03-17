# Group B2: @meridian/cache — Multi-Layer Cache System

## Task
Implement a flexible, multi-layer caching system with in-memory (LRU) and Redis providers.

## Files to Create

### src/types.ts
```typescript
export interface CacheOptions {
  ttlSeconds?: number;
  namespace?: string;
}

export interface CacheProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  clear(namespace?: string): Promise<void>;
  keys(pattern?: string): Promise<string[]>;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}
```

### src/providers/memory-cache.ts
LRU-based in-memory cache:
- Configurable maxSize (default 1000 entries)
- TTL support per entry
- Namespace support (prefix-based)
- Automatic eviction of expired entries
- Stats tracking (hits, misses)
- Thread-safe (no shared mutable state issues in Node.js, but proper cleanup)

### src/providers/redis-cache.ts
Redis-backed cache using ioredis:
- Connection management (connect, disconnect, health check)
- JSON serialization/deserialization
- TTL via Redis EXPIRE
- Pattern-based key deletion
- Namespace via key prefix
- Connection retry logic

### src/providers/null-cache.ts
No-op cache for testing/development:
- All gets return null
- All sets are no-ops
- Useful for disabling cache

### src/multi-layer-cache.ts
Cascading cache that checks multiple providers:
```typescript
export class MultiLayerCache implements CacheProvider {
  constructor(private layers: CacheProvider[]) {}
  // get: check L1 (memory) first, then L2 (redis), populate upper layers on hit
  // set: write to all layers
  // delete: delete from all layers
}
```

### src/cache-key.ts
```typescript
export function generateCacheKey(parts: {
  query: string;
  params?: unknown[];
  dataSourceId: string;
}): string;
// Uses SHA-256 hash of normalized query + params + datasource
```

### src/decorators/cacheable.ts
```typescript
// Decorator/wrapper for caching function results
export function withCache<T>(
  cache: CacheProvider,
  keyFn: (...args: any[]) => string,
  options?: CacheOptions,
): (fn: (...args: any[]) => Promise<T>) => (...args: any[]) => Promise<T>;
```

### src/index.ts — re-exports

## Tests
- src/providers/memory-cache.test.ts (LRU eviction, TTL expiry, namespace isolation)
- src/providers/redis-cache.test.ts (mock ioredis, connection handling)
- src/providers/null-cache.test.ts
- src/multi-layer-cache.test.ts (cascade behavior, populate-up)
- src/cache-key.test.ts (deterministic hashing)
- src/decorators/cacheable.test.ts

## Dependencies
- @meridian/shared (errors, logger, utils)
- ioredis

## Estimated LOC: ~2000 + ~800 tests
