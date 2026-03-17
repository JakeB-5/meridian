import { describe, it, expect } from 'vitest';
import { NullCache } from './null-cache.js';

describe('NullCache', () => {
  const cache = new NullCache();

  it('get always returns null', async () => {
    await cache.set('k', 'v');
    expect(await cache.get('k')).toBeNull();
  });

  it('has always returns false', async () => {
    await cache.set('k', 'v');
    expect(await cache.has('k')).toBe(false);
  });

  it('delete always returns false', async () => {
    expect(await cache.delete('k')).toBe(false);
  });

  it('keys always returns empty array', async () => {
    await cache.set('k', 'v');
    expect(await cache.keys()).toEqual([]);
  });

  it('keys with pattern returns empty array', async () => {
    expect(await cache.keys('*')).toEqual([]);
  });

  it('clear resolves without throwing', async () => {
    await expect(cache.clear()).resolves.toBeUndefined();
    await expect(cache.clear('ns')).resolves.toBeUndefined();
  });

  it('set resolves without throwing', async () => {
    await expect(cache.set('k', { any: 'value' }, { ttlSeconds: 60 })).resolves.toBeUndefined();
  });

  it('stores nothing — repeated sets do not change get result', async () => {
    for (let i = 0; i < 10; i++) {
      await cache.set(`k${i}`, i);
    }
    for (let i = 0; i < 10; i++) {
      expect(await cache.get(`k${i}`)).toBeNull();
    }
  });
});
