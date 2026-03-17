import { createHash } from 'node:crypto';

export interface CacheKeyParts {
  /** The raw SQL query string or visual query serialization. */
  query: string;
  /** Bound parameters. Order-sensitive. */
  params?: unknown[];
  /** Identifier of the data source (connector instance). */
  dataSourceId: string;
}

/**
 * Generate a deterministic, collision-resistant cache key from query parts.
 *
 * The key is a 64-character hex SHA-256 digest of the JSON-normalized input.
 * Normalization rules:
 *  - query and dataSourceId are trimmed and lower-cased for whitespace/case
 *    tolerance.
 *  - params is serialized as a JSON array (undefined → empty array []).
 *
 * The resulting key is safe to use directly as a Redis key or memory map key.
 */
export function generateCacheKey(parts: CacheKeyParts): string {
  const normalized = {
    query: parts.query.trim(),
    params: parts.params ?? [],
    dataSourceId: parts.dataSourceId.trim(),
  };

  const payload = JSON.stringify(normalized);
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Build a human-readable debug label from cache key parts (not used as the
 * actual cache key — only for logging purposes).
 */
export function buildCacheKeyLabel(parts: CacheKeyParts): string {
  const truncated =
    parts.query.length > 60 ? `${parts.query.slice(0, 60)}…` : parts.query;
  return `[${parts.dataSourceId}] ${truncated}`;
}
