/** Discriminated union Result type for operations that can fail */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** Construct a successful Result */
export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/** Construct a failed Result */
export function err<E = Error>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Unwrap a Result or throw the error */
export function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  throw result.error;
}
