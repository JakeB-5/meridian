import { describe, it, expect, vi } from 'vitest';
import { retry, withTimeout, delay, pMap, allSettled } from './async.js';

describe('delay', () => {
  it('resolves after the specified time', async () => {
    const start = Date.now();
    await delay(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40); // allow timer imprecision
  });
});

describe('retry', () => {
  it('returns on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retry(fn, { maxAttempts: 3, delayMs: 10 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('ok');
    const result = await retry(fn, { maxAttempts: 3, delayMs: 10 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after max attempts exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));
    await expect(
      retry(fn, { maxAttempts: 3, delayMs: 10, backoffFactor: 1 }),
    ).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('respects shouldRetry predicate', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('no retry'));
    await expect(
      retry(fn, {
        maxAttempts: 5,
        delayMs: 10,
        shouldRetry: () => false,
      }),
    ).rejects.toThrow('no retry');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls onRetry callback', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');
    await retry(fn, { maxAttempts: 3, delayMs: 10, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
  });
});

describe('withTimeout', () => {
  it('resolves when promise completes in time', async () => {
    const result = await withTimeout(
      Promise.resolve('fast'),
      1000,
    );
    expect(result).toBe('fast');
  });

  it('rejects when promise exceeds timeout', async () => {
    await expect(
      withTimeout(delay(500), 50, 'too slow'),
    ).rejects.toThrow('too slow');
  });

  it('uses default timeout message', async () => {
    await expect(
      withTimeout(delay(500), 50),
    ).rejects.toThrow('Operation timed out after 50ms');
  });

  it('propagates original error if promise rejects before timeout', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('inner error')), 1000),
    ).rejects.toThrow('inner error');
  });
});

describe('pMap', () => {
  it('maps items concurrently', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await pMap(items, async (n) => n * 2, 3);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('handles empty array', async () => {
    const results = await pMap([], async (n: number) => n, 2);
    expect(results).toEqual([]);
  });

  it('respects concurrency limit', async () => {
    let activeCount = 0;
    let maxActive = 0;
    const items = [1, 2, 3, 4, 5, 6];

    await pMap(items, async (n) => {
      activeCount++;
      maxActive = Math.max(maxActive, activeCount);
      await delay(20);
      activeCount--;
      return n;
    }, 2);

    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('preserves order', async () => {
    const items = [3, 1, 2];
    const results = await pMap(items, async (n) => {
      await delay(n * 10);
      return n;
    }, 5);
    expect(results).toEqual([3, 1, 2]);
  });

  it('rejects if any mapper throws', async () => {
    await expect(
      pMap([1, 2, 3], async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      }, 1),
    ).rejects.toThrow('boom');
  });

  it('throws on zero concurrency', async () => {
    await expect(
      pMap([1], async (n) => n, 0),
    ).rejects.toThrow('Concurrency must be a positive number');
  });
});

describe('allSettled', () => {
  it('collects fulfilled and rejected results', async () => {
    const results = await allSettled([
      async () => 'a',
      async () => { throw new Error('b'); },
      async () => 'c',
    ]);
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ status: 'fulfilled', value: 'a' });
    expect(results[1]!.status).toBe('rejected');
    expect((results[1]!.reason as Error).message).toBe('b');
    expect(results[2]).toEqual({ status: 'fulfilled', value: 'c' });
  });

  it('handles all fulfilled', async () => {
    const results = await allSettled([
      async () => 1,
      async () => 2,
    ]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('handles all rejected', async () => {
    const results = await allSettled([
      async () => { throw new Error('a'); },
      async () => { throw new Error('b'); },
    ]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
  });

  it('handles empty array', async () => {
    const results = await allSettled([]);
    expect(results).toEqual([]);
  });
});
