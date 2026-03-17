import { MeridianError } from '../errors/meridian-error.js';

/**
 * Discriminated union representing either success (Ok) or failure (Err).
 * Inspired by Rust's Result<T, E> pattern for type-safe error handling.
 */
export type Result<T, E = MeridianError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Create a successful Result */
export const ok = <T>(value: T): Result<T, never> => ({
  ok: true,
  value,
});

/** Create a failed Result */
export const err = <E>(error: E): Result<never, E> => ({
  ok: false,
  error,
});

/** Type guard for Ok variant */
export const isOk = <T, E>(result: Result<T, E>): result is { readonly ok: true; readonly value: T } =>
  result.ok === true;

/** Type guard for Err variant */
export const isErr = <T, E>(result: Result<T, E>): result is { readonly ok: false; readonly error: E } =>
  result.ok === false;

/** Extract the value from a Result, throwing the error if Err */
export const unwrap = <T, E>(result: Result<T, E>): T => {
  if (isOk(result)) {
    return result.value;
  }
  if (result.error instanceof Error) {
    throw result.error;
  }
  throw new Error(String(result.error));
};

/** Extract value or return a default */
export const unwrapOr = <T, E>(result: Result<T, E>, defaultValue: T): T => {
  if (isOk(result)) {
    return result.value;
  }
  return defaultValue;
};

/** Map over the Ok value, leaving Err untouched */
export const map = <T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> => {
  if (isOk(result)) {
    return ok(fn(result.value));
  }
  return result;
};

/** Map over the Err value, leaving Ok untouched */
export const mapErr = <T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> => {
  if (isErr(result)) {
    return err(fn(result.error));
  }
  return result as Result<T, F>;
};

/** Chain Result-returning operations (aka andThen / bind) */
export const flatMap = <T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> => {
  if (isOk(result)) {
    return fn(result.value);
  }
  return result;
};

/** Wrap an async operation that may throw into a Result */
export const tryCatch = async <T>(
  fn: () => Promise<T>,
  mapError?: (error: unknown) => MeridianError,
): Promise<Result<T, MeridianError>> => {
  try {
    const value = await fn();
    return ok(value);
  } catch (error) {
    if (mapError) {
      return err(mapError(error));
    }
    if (error instanceof MeridianError) {
      return err(error);
    }
    return err(
      new MeridianError(
        error instanceof Error ? error.message : String(error),
        'ERR_UNEXPECTED',
        500,
      ),
    );
  }
};

/** Wrap a synchronous operation that may throw into a Result */
export const tryCatchSync = <T>(
  fn: () => T,
  mapError?: (error: unknown) => MeridianError,
): Result<T, MeridianError> => {
  try {
    const value = fn();
    return ok(value);
  } catch (error) {
    if (mapError) {
      return err(mapError(error));
    }
    if (error instanceof MeridianError) {
      return err(error);
    }
    return err(
      new MeridianError(
        error instanceof Error ? error.message : String(error),
        'ERR_UNEXPECTED',
        500,
      ),
    );
  }
};
