// ── Connection Pool Manager ─────────────────────────────────────────
// Manages a pool of Connector instances keyed by datasource ID.
// Provides connection reuse, idle timeout, health checks, and
// graceful shutdown for the entire connector fleet.

import type { Logger } from '@meridian/shared';
import { createLogger } from '@meridian/shared';

import type {
  Connector,
  DataSourceConfig,
  ConnectorConfig,
  PoolConfig,
  PoolStats,
  ConnectorEventListener,
} from './types.js';
import { DEFAULT_POOL_CONFIG } from './types.js';
import { createConnector } from './connector-factory.js';
import type { CreateConnectorOptions } from './connector-factory.js';
import type { BaseConnector } from './base-connector.js';
import {
  ConnectorPoolExhaustedError,
  ConnectorPoolTimeoutError,
  ConnectorNotConnectedError,
} from './errors.js';

// ── Pool Entry ──────────────────────────────────────────────────────

interface PoolEntry {
  /** The connector instance */
  connector: Connector;
  /** Data source config used to create the connector */
  dataSource: DataSourceConfig;
  /** Timestamp of creation */
  createdAt: number;
  /** Timestamp of last use */
  lastUsedAt: number;
  /** Number of times this connector has been acquired */
  useCount: number;
  /** Whether the connector is currently in use */
  inUse: boolean;
  /** Timestamp of last successful health check */
  lastHealthCheck: number;
  /** Whether this entry is marked for removal */
  markedForRemoval: boolean;
}

// ── Connection Pool Manager Options ─────────────────────────────────

export interface ConnectionPoolManagerOptions {
  /** Pool configuration overrides */
  poolConfig?: Partial<PoolConfig>;
  /** Default connector configuration applied to all connectors */
  defaultConnectorConfig?: Partial<ConnectorConfig>;
  /** Logger instance */
  logger?: Logger;
  /** Maximum rows for queries */
  maxRows?: number;
  /** Default query timeout */
  queryTimeoutMs?: number;
  /** Event listener for all connectors in the pool */
  eventListener?: ConnectorEventListener;
}

// ── Connection Pool Manager ─────────────────────────────────────────

/**
 * Manages a pool of database connectors keyed by data source ID.
 *
 * Features:
 * - One connector per data source (connection reuse)
 * - Automatic idle timeout and eviction
 * - Periodic health checks
 * - Graceful shutdown of all connections
 * - Max lifetime enforcement
 * - Event forwarding
 *
 * @example
 * ```ts
 * const pool = new ConnectionPoolManager();
 *
 * // Acquire a connector (creates if needed, connects automatically)
 * const connector = await pool.acquire(dataSourceConfig);
 * const result = await connector.executeQuery('SELECT 1');
 *
 * // Release it back to the pool when done
 * pool.release(dataSourceConfig.id);
 *
 * // Shutdown all connections
 * await pool.shutdown();
 * ```
 */
export class ConnectionPoolManager {
  private readonly pool: Map<string, PoolEntry> = new Map();
  private readonly config: Required<PoolConfig>;
  private readonly defaultConnectorConfig: Partial<ConnectorConfig>;
  private readonly logger: Logger;
  private readonly maxRows?: number;
  private readonly queryTimeoutMs?: number;
  private readonly eventListener?: ConnectorEventListener;

  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private idleCheckTimer: ReturnType<typeof setInterval> | null = null;
  private _isShutdown: boolean = false;

  constructor(options: ConnectionPoolManagerOptions = {}) {
    this.config = {
      ...DEFAULT_POOL_CONFIG,
      ...options.poolConfig,
    };
    this.defaultConnectorConfig = options.defaultConnectorConfig ?? {};
    this.logger = options.logger ?? createLogger('connection-pool', { level: 'info' });
    this.maxRows = options.maxRows;
    this.queryTimeoutMs = options.queryTimeoutMs;
    this.eventListener = options.eventListener;

    // Start background tasks
    this.startHealthChecks();
    this.startIdleChecks();
  }

  // ── Public API ────────────────────────────────────────────────

  /**
   * Acquire a connector for the given data source.
   * If one already exists in the pool and is connected, it is reused.
   * If not, a new connector is created and connected.
   */
  async acquire(dataSource: DataSourceConfig): Promise<Connector> {
    if (this._isShutdown) {
      throw new ConnectorNotConnectedError(
        dataSource.type,
        { reason: 'Pool has been shut down' },
      );
    }

    const id = dataSource.id;
    let entry = this.pool.get(id);

    // Check if existing entry is still valid
    if (entry) {
      // Check max lifetime
      if (this.isExpired(entry)) {
        this.logger.info('Connector expired, replacing', { id, type: dataSource.type });
        await this.evict(id);
        entry = undefined;
      } else if (!entry.connector.isConnected()) {
        this.logger.info('Connector disconnected, reconnecting', { id, type: dataSource.type });
        try {
          await entry.connector.connect();
        } catch {
          // If reconnect fails, evict and create new
          await this.evict(id);
          entry = undefined;
        }
      }
    }

    // Create a new entry if needed
    if (!entry) {
      if (this.pool.size >= this.config.maxConnections) {
        // Try to evict an idle connector
        const evicted = this.evictIdle();
        if (!evicted) {
          throw new ConnectorPoolExhaustedError(dataSource.type, {
            maxConnections: this.config.maxConnections,
            currentSize: this.pool.size,
          });
        }
      }

      entry = await this.createEntry(dataSource);
      this.pool.set(id, entry);
    }

    // Mark as in use
    entry.inUse = true;
    entry.lastUsedAt = Date.now();
    entry.useCount += 1;

    this.logger.debug('Connector acquired', {
      id,
      type: dataSource.type,
      useCount: entry.useCount,
      poolSize: this.pool.size,
    });

    return entry.connector;
  }

  /**
   * Release a connector back to the pool.
   * The connector remains connected for reuse.
   */
  release(datasourceId: string): void {
    const entry = this.pool.get(datasourceId);
    if (entry) {
      entry.inUse = false;
      entry.lastUsedAt = Date.now();
      this.logger.debug('Connector released', { id: datasourceId });
    }
  }

  /**
   * Evict a specific connector from the pool and disconnect it.
   */
  async evict(datasourceId: string): Promise<void> {
    const entry = this.pool.get(datasourceId);
    if (!entry) return;

    this.pool.delete(datasourceId);

    try {
      if (entry.connector.isConnected()) {
        await entry.connector.disconnect();
      }
    } catch (error) {
      this.logger.warn('Error disconnecting evicted connector', {
        id: datasourceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.logger.info('Connector evicted', { id: datasourceId });
  }

  /**
   * Get a connector without marking it as "in use" (peek).
   * Returns undefined if no connector exists for this datasource.
   */
  peek(datasourceId: string): Connector | undefined {
    return this.pool.get(datasourceId)?.connector;
  }

  /**
   * Check if a connector exists in the pool.
   */
  has(datasourceId: string): boolean {
    return this.pool.has(datasourceId);
  }

  /**
   * Get pool statistics for a specific datasource connector.
   */
  getStats(datasourceId: string): PoolStats | null {
    const entry = this.pool.get(datasourceId);
    if (!entry) return null;

    const baseConnector = entry.connector as BaseConnector;
    if (typeof baseConnector.getPoolStats === 'function') {
      return baseConnector.getPoolStats();
    }

    return null;
  }

  /**
   * Get aggregate statistics for the entire pool manager.
   */
  getAggregateStats(): {
    totalConnectors: number;
    activeConnectors: number;
    idleConnectors: number;
    connectorsByType: Record<string, number>;
  } {
    let active = 0;
    let idle = 0;
    const byType: Record<string, number> = {};

    for (const entry of this.pool.values()) {
      if (entry.inUse) {
        active++;
      } else {
        idle++;
      }
      byType[entry.dataSource.type] = (byType[entry.dataSource.type] ?? 0) + 1;
    }

    return {
      totalConnectors: this.pool.size,
      activeConnectors: active,
      idleConnectors: idle,
      connectorsByType: byType,
    };
  }

  /**
   * Get all datasource IDs currently in the pool.
   */
  getPooledIds(): string[] {
    return Array.from(this.pool.keys());
  }

  /**
   * Run a health check on all connectors in the pool.
   * Returns a map of datasource ID → health check result.
   */
  async healthCheckAll(): Promise<Map<string, { healthy: boolean; latencyMs: number; error?: string }>> {
    const results = new Map<string, { healthy: boolean; latencyMs: number; error?: string }>();

    for (const [id, entry] of this.pool.entries()) {
      if (entry.markedForRemoval) continue;

      const start = Date.now();
      try {
        const result = await entry.connector.testConnection();
        entry.lastHealthCheck = Date.now();
        results.set(id, {
          healthy: result.success,
          latencyMs: result.latencyMs,
          error: result.success ? undefined : result.message,
        });
      } catch (error) {
        results.set(id, {
          healthy: false,
          latencyMs: Date.now() - start,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Gracefully shut down the pool manager.
   * Disconnects all connectors and stops background tasks.
   */
  async shutdown(): Promise<void> {
    this._isShutdown = true;

    // Stop background tasks
    this.stopHealthChecks();
    this.stopIdleChecks();

    // Disconnect all connectors
    const disconnectPromises: Promise<void>[] = [];

    for (const [id, entry] of this.pool.entries()) {
      disconnectPromises.push(
        (async () => {
          try {
            if (entry.connector.isConnected()) {
              await entry.connector.disconnect();
            }
          } catch (error) {
            this.logger.warn('Error during pool shutdown', {
              id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })(),
      );
    }

    await Promise.allSettled(disconnectPromises);
    this.pool.clear();

    this.logger.info('Connection pool shut down', {
      disconnected: disconnectPromises.length,
    });
  }

  /**
   * Whether the pool has been shut down.
   */
  get isShutdown(): boolean {
    return this._isShutdown;
  }

  /**
   * Current number of connectors in the pool.
   */
  get size(): number {
    return this.pool.size;
  }

  // ── Private: Entry Creation ───────────────────────────────────

  private async createEntry(dataSource: DataSourceConfig): Promise<PoolEntry> {
    const options: CreateConnectorOptions = {
      dataSource,
      connectorConfig: this.defaultConnectorConfig,
      logger: undefined, // Let each connector create its own
      maxRows: this.maxRows,
      queryTimeoutMs: this.queryTimeoutMs,
    };

    const connector = createConnector(options);

    // Register event listener if provided
    if (this.eventListener) {
      const baseConnector = connector as BaseConnector;
      if (typeof baseConnector.on === 'function') {
        baseConnector.on('connect', this.eventListener);
        baseConnector.on('disconnect', this.eventListener);
        baseConnector.on('error', this.eventListener);
        baseConnector.on('query:start', this.eventListener);
        baseConnector.on('query:end', this.eventListener);
        baseConnector.on('query:cancel', this.eventListener);
        baseConnector.on('query:timeout', this.eventListener);
      }
    }

    // Connect the new connector
    await connector.connect();

    const now = Date.now();

    return {
      connector,
      dataSource,
      createdAt: now,
      lastUsedAt: now,
      useCount: 0,
      inUse: false,
      lastHealthCheck: now,
      markedForRemoval: false,
    };
  }

  // ── Private: Eviction ─────────────────────────────────────────

  /**
   * Try to evict the oldest idle connector to make room.
   * Returns true if an eviction occurred.
   */
  private evictIdle(): boolean {
    let oldestIdle: { id: string; lastUsedAt: number } | null = null;

    for (const [id, entry] of this.pool.entries()) {
      if (!entry.inUse && (!oldestIdle || entry.lastUsedAt < oldestIdle.lastUsedAt)) {
        oldestIdle = { id, lastUsedAt: entry.lastUsedAt };
      }
    }

    if (oldestIdle) {
      // Fire and forget the disconnect
      this.evict(oldestIdle.id).catch((error) => {
        this.logger.warn('Error evicting idle connector', {
          id: oldestIdle!.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      return true;
    }

    return false;
  }

  private isExpired(entry: PoolEntry): boolean {
    return Date.now() - entry.createdAt > this.config.maxLifetimeMs;
  }

  // ── Private: Background Tasks ─────────────────────────────────

  private startHealthChecks(): void {
    if (this.config.healthCheckIntervalMs <= 0) return;

    this.healthCheckTimer = setInterval(async () => {
      if (this._isShutdown) return;

      for (const [id, entry] of this.pool.entries()) {
        if (entry.inUse || entry.markedForRemoval) continue;

        try {
          const result = await entry.connector.testConnection();
          entry.lastHealthCheck = Date.now();

          if (!result.success) {
            this.logger.warn('Health check failed', {
              id,
              type: entry.dataSource.type,
              message: result.message,
            });
            // Mark for reconnection on next acquire
          }
        } catch (error) {
          this.logger.warn('Health check error', {
            id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }, this.config.healthCheckIntervalMs);

    // Unref so it doesn't keep the process alive
    if (this.healthCheckTimer && typeof this.healthCheckTimer === 'object' && 'unref' in this.healthCheckTimer) {
      (this.healthCheckTimer as NodeJS.Timeout).unref();
    }
  }

  private stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private startIdleChecks(): void {
    if (this.config.idleTimeoutMs <= 0) return;

    const checkInterval = Math.min(this.config.idleTimeoutMs, 30_000);

    this.idleCheckTimer = setInterval(async () => {
      if (this._isShutdown) return;

      const now = Date.now();
      const toEvict: string[] = [];

      for (const [id, entry] of this.pool.entries()) {
        if (entry.inUse || entry.markedForRemoval) continue;

        // Check idle timeout
        if (now - entry.lastUsedAt > this.config.idleTimeoutMs) {
          toEvict.push(id);
          continue;
        }

        // Check max lifetime
        if (this.isExpired(entry)) {
          toEvict.push(id);
        }
      }

      for (const id of toEvict) {
        this.logger.info('Evicting idle/expired connector', { id });
        await this.evict(id).catch((error) => {
          this.logger.warn('Error evicting connector', {
            id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    }, checkInterval);

    // Unref so it doesn't keep the process alive
    if (this.idleCheckTimer && typeof this.idleCheckTimer === 'object' && 'unref' in this.idleCheckTimer) {
      (this.idleCheckTimer as NodeJS.Timeout).unref();
    }
  }

  private stopIdleChecks(): void {
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
  }
}

// ── Singleton Pool (optional convenience) ───────────────────────────

let _defaultPool: ConnectionPoolManager | null = null;

/**
 * Get or create the default (singleton) connection pool manager.
 * Useful when a single shared pool is sufficient.
 */
export function getDefaultPool(options?: ConnectionPoolManagerOptions): ConnectionPoolManager {
  if (!_defaultPool || _defaultPool.isShutdown) {
    _defaultPool = new ConnectionPoolManager(options);
  }
  return _defaultPool;
}

/**
 * Shut down and clear the default pool.
 */
export async function shutdownDefaultPool(): Promise<void> {
  if (_defaultPool) {
    await _defaultPool.shutdown();
    _defaultPool = null;
  }
}
