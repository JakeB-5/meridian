// ── Async Utilities ─────────────────────────────────────────────────

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Base delay between retries in ms. Default: 1000 */
  delayMs?: number;
  /** Backoff multiplier applied to delay after each retry. Default: 2 */
  backoffFactor?: number;
  /** Optional predicate to decide if a specific error should be retried. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Optional callback invoked before each retry. */
  onRetry?: (error: unknown, attempt: number) => void;
}

/**
 * Retry an async function with exponential backoff.
 */
export const retry = async <T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> => {
  const {
    maxAttempts = 3,
    delayMs = 1_000,
    backoffFactor = 2,
    shouldRetry,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        break;
      }

      if (shouldRetry && !shouldRetry(error, attempt)) {
        break;
      }

      onRetry?.(error, attempt);

      const waitMs = delayMs * Math.pow(backoffFactor, attempt - 1);
      await delay(waitMs);
    }
  }

  throw lastError;
};

/**
 * Wrap a promise with a timeout. Rejects with a TimeoutError if the
 * promise does not resolve within `timeoutMs` milliseconds.
 */
export const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number,
  message?: string,
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message ?? `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
};

/**
 * Delay execution for `ms` milliseconds.
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Concurrent map — process items with limited concurrency.
 * Similar to p-map but minimal.
 */
export const pMap = async <T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency: number = Infinity,
): Promise<R[]> => {
  if (items.length === 0) return [];
  if (concurrency <= 0) throw new Error('Concurrency must be a positive number');

  const results: R[] = new Array(items.length);
  let currentIndex = 0;
  let activeCount = 0;
  let resolveAll: (() => void) | undefined;
  let rejectAll: ((err: unknown) => void) | undefined;
  let hasRejected = false;

  const allDone = new Promise<void>((resolve, reject) => {
    resolveAll = resolve;
    rejectAll = reject;
  });

  const runNext = (): void => {
    if (hasRejected) return;
    if (currentIndex >= items.length && activeCount === 0) {
      resolveAll?.();
      return;
    }

    while (activeCount < concurrency && currentIndex < items.length) {
      const index = currentIndex++;
      activeCount++;

      mapper(items[index]!, index)
        .then((result) => {
          results[index] = result;
          activeCount--;
          runNext();
        })
        .catch((error) => {
          if (!hasRejected) {
            hasRejected = true;
            rejectAll?.(error);
          }
        });
    }
  };

  runNext();
  await allDone;
  return results;
};

/**
 * Execute multiple async functions and collect all results,
 * even if some fail. Returns an array of settled outcomes.
 */
export interface SettledResult<T> {
  status: 'fulfilled' | 'rejected';
  value?: T;
  reason?: unknown;
}

export const allSettled = async <T>(
  fns: Array<() => Promise<T>>,
): Promise<Array<SettledResult<T>>> => {
  return Promise.all(
    fns.map(async (fn) => {
      try {
        const value = await fn();
        return { status: 'fulfilled' as const, value };
      } catch (reason) {
        return { status: 'rejected' as const, reason };
      }
    }),
  );
};
