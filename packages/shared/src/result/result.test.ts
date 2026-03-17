import { describe, it, expect } from 'vitest';
import { MeridianError } from '../errors/meridian-error.js';
import {
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  map,
  mapErr,
  flatMap,
  tryCatch,
  tryCatchSync,
} from './result.js';

describe('Result constructors', () => {
  it('ok() creates an Ok result', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it('err() creates an Err result', () => {
    const error = new MeridianError('fail', 'ERR_TEST');
    const result = err(error);
    expect(result.ok).toBe(false);
    expect(result).toEqual({ ok: false, error });
  });
});

describe('Type guards', () => {
  it('isOk returns true for Ok', () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isOk(err(new Error('x')))).toBe(false);
  });

  it('isErr returns true for Err', () => {
    expect(isErr(err(new Error('x')))).toBe(true);
    expect(isErr(ok(1))).toBe(false);
  });
});

describe('unwrap', () => {
  it('returns value from Ok', () => {
    expect(unwrap(ok('hello'))).toBe('hello');
  });

  it('throws Error from Err', () => {
    const error = new MeridianError('fail', 'ERR_TEST');
    expect(() => unwrap(err(error))).toThrow(error);
  });

  it('wraps non-Error in Error when throwing from Err', () => {
    const result = err('string error' as unknown as Error);
    expect(() => unwrap(result)).toThrow('string error');
  });
});

describe('unwrapOr', () => {
  it('returns value from Ok', () => {
    expect(unwrapOr(ok(42), 0)).toBe(42);
  });

  it('returns default from Err', () => {
    const error = new MeridianError('fail', 'ERR_TEST');
    expect(unwrapOr(err(error), 99)).toBe(99);
  });
});

describe('map', () => {
  it('transforms Ok value', () => {
    const result = map(ok(5), (n) => n * 2);
    expect(result).toEqual(ok(10));
  });

  it('passes through Err', () => {
    const error = new MeridianError('fail', 'ERR_TEST');
    const result = map(err(error), (n: number) => n * 2);
    expect(result).toEqual(err(error));
  });
});

describe('mapErr', () => {
  it('transforms Err value', () => {
    const original = new MeridianError('fail', 'ERR_A');
    const mapped = new MeridianError('transformed', 'ERR_B');
    const result = mapErr(err(original), () => mapped);
    expect(isErr(result) && result.error).toBe(mapped);
  });

  it('passes through Ok', () => {
    const result = mapErr(ok(42), () => new Error('nope'));
    expect(result).toEqual(ok(42));
  });
});

describe('flatMap', () => {
  it('chains Ok results', () => {
    const result = flatMap(ok(5), (n) => ok(n + 10));
    expect(result).toEqual(ok(15));
  });

  it('short-circuits on Err', () => {
    const error = new MeridianError('fail', 'ERR_TEST');
    const result = flatMap(err(error), (n: number) => ok(n + 10));
    expect(result).toEqual(err(error));
  });

  it('propagates Err from mapper', () => {
    const error = new MeridianError('inner fail', 'ERR_INNER');
    const result = flatMap(ok(5), () => err(error));
    expect(result).toEqual(err(error));
  });
});

describe('tryCatch (async)', () => {
  it('wraps successful async result', async () => {
    const result = await tryCatch(async () => 42);
    expect(result).toEqual(ok(42));
  });

  it('wraps MeridianError thrown async', async () => {
    const error = new MeridianError('async fail', 'ERR_ASYNC');
    const result = await tryCatch(async () => {
      throw error;
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBe(error);
    }
  });

  it('wraps generic Error thrown async', async () => {
    const result = await tryCatch(async () => {
      throw new Error('generic');
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toBe('generic');
      expect(result.error.code).toBe('ERR_UNEXPECTED');
    }
  });

  it('uses custom mapError function', async () => {
    const result = await tryCatch(
      async () => { throw new Error('raw'); },
      () => new MeridianError('mapped', 'ERR_CUSTOM', 400),
    );
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('ERR_CUSTOM');
      expect(result.error.statusCode).toBe(400);
    }
  });
});

describe('tryCatchSync', () => {
  it('wraps successful sync result', () => {
    const result = tryCatchSync(() => 42);
    expect(result).toEqual(ok(42));
  });

  it('wraps MeridianError thrown sync', () => {
    const error = new MeridianError('sync fail', 'ERR_SYNC');
    const result = tryCatchSync(() => {
      throw error;
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBe(error);
    }
  });

  it('wraps non-MeridianError thrown sync', () => {
    const result = tryCatchSync(() => {
      throw new Error('plain');
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toBe('plain');
      expect(result.error.code).toBe('ERR_UNEXPECTED');
    }
  });

  it('uses custom mapError for sync', () => {
    const result = tryCatchSync(
      () => { throw new Error('raw'); },
      () => new MeridianError('custom', 'ERR_C', 422),
    );
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('ERR_C');
    }
  });
});
