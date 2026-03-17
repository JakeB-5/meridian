import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

// ── Types ───────────────────────────────────────────────────────────

export type Database = ReturnType<typeof createDrizzleInstance>;

/** Configuration options for the database connection pool */
export interface DatabaseConfig {
  /** PostgreSQL connection URL */
  url: string;
  /** Maximum number of connections in the pool (default: 10) */
  maxConnections?: number;
  /** Idle timeout in milliseconds before a connection is closed (default: 30000) */
  idleTimeoutMs?: number;
  /** Connection timeout in milliseconds (default: 5000) */
  connectionTimeoutMs?: number;
  /** Whether to use SSL (default: false) */
  ssl?: boolean;
}

// ── Internal ────────────────────────────────────────────────────────

/** Active pool reference for cleanup */
let activePool: pg.Pool | null = null;

function createDrizzleInstance(pool: pg.Pool) {
  return drizzle(pool, { schema });
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Create a Drizzle ORM database instance backed by a node-postgres pool.
 *
 * @param config - Connection configuration
 * @returns Drizzle database instance with full schema awareness
 *
 * @example
 * ```ts
 * const db = createDatabase({ url: process.env.DATABASE_URL! });
 * const users = await db.query.users.findMany();
 * ```
 */
export function createDatabase(config: DatabaseConfig): Database {
  const pool = new pg.Pool({
    connectionString: config.url,
    max: config.maxConnections ?? 10,
    idleTimeoutMillis: config.idleTimeoutMs ?? 30_000,
    connectionTimeoutMillis: config.connectionTimeoutMs ?? 5_000,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
  });

  // Handle pool-level errors to prevent unhandled rejections
  pool.on('error', (err) => {
    console.error('[meridian/db] Unexpected pool error:', err.message);
  });

  activePool = pool;
  return createDrizzleInstance(pool);
}

/**
 * Create a database instance from a plain connection URL string.
 * Convenience wrapper around createDatabase with default pool settings.
 */
export function createDatabaseFromUrl(url: string): Database {
  return createDatabase({ url });
}

/**
 * Gracefully shut down the active connection pool.
 * Should be called during application shutdown.
 */
export async function closeDatabase(): Promise<void> {
  if (activePool) {
    await activePool.end();
    activePool = null;
  }
}

/**
 * Get the underlying node-postgres Pool instance.
 * Useful for health checks and direct SQL when needed.
 */
export function getPool(): pg.Pool | null {
  return activePool;
}

/**
 * Check if the database connection is healthy by executing a simple query.
 */
export async function healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
  if (!activePool) {
    return { ok: false, latencyMs: 0 };
  }

  const start = performance.now();
  try {
    await activePool.query('SELECT 1');
    return { ok: true, latencyMs: Math.round(performance.now() - start) };
  } catch {
    return { ok: false, latencyMs: Math.round(performance.now() - start) };
  }
}
