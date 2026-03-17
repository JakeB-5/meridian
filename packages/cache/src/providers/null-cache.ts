import type { CacheOptions, CacheProvider } from '../types.js';

/**
 * No-op cache provider.
 *
 * Every get() returns null, every set/delete/clear is a silent no-op.
 * Useful in tests and development environments where caching should be
 * completely disabled without altering calling code.
 */
export class NullCache implements CacheProvider {
  async get<T>(_key: string): Promise<T | null> {
    return null;
  }

  async set<T>(_key: string, _value: T, _options?: CacheOptions): Promise<void> {
    // intentional no-op
  }

  async delete(_key: string): Promise<boolean> {
    return false;
  }

  async has(_key: string): Promise<boolean> {
    return false;
  }

  async clear(_namespace?: string): Promise<void> {
    // intentional no-op
  }

  async keys(_pattern?: string): Promise<string[]> {
    return [];
  }
}
