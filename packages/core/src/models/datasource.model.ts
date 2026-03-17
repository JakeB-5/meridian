import type {
  DataSourceConfig,
  DatabaseType,
  ConnectionTestResult,
  SchemaInfo,
  TableInfo,
  Result,
} from '@meridian/shared';
import {
  ok,
  err,
  generateId,
  ValidationError,
  ConnectionError,
} from '@meridian/shared';

/** Connection pool configuration for a data source */
export interface ConnectionPoolConfig {
  minConnections: number;
  maxConnections: number;
  idleTimeoutMs: number;
  acquireTimeoutMs: number;
}

/** Database credentials value object */
export interface DatabaseCredentials {
  username?: string;
  password?: string;
  ssl: boolean;
}

/** Data source status */
export type DataSourceStatus = 'connected' | 'disconnected' | 'error' | 'testing';

/** Default connection pool settings */
const DEFAULT_POOL_CONFIG: ConnectionPoolConfig = {
  minConnections: 1,
  maxConnections: 10,
  idleTimeoutMs: 30_000,
  acquireTimeoutMs: 10_000,
};

/**
 * DataSource domain entity.
 *
 * Represents a configured database connection that Meridian can query.
 * Contains pure domain logic with no infrastructure dependencies.
 */
export class DataSource {
  public readonly id: string;
  public readonly name: string;
  public readonly type: DatabaseType;
  public readonly host: string | undefined;
  public readonly port: number | undefined;
  public readonly database: string;
  public readonly credentials: DatabaseCredentials;
  public readonly options: Record<string, unknown>;
  public readonly organizationId: string;
  public readonly poolConfig: ConnectionPoolConfig;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private _status: DataSourceStatus;
  private _lastTestedAt: Date | undefined;
  private _lastError: string | undefined;

  private constructor(params: {
    id: string;
    name: string;
    type: DatabaseType;
    host?: string;
    port?: number;
    database: string;
    credentials: DatabaseCredentials;
    options: Record<string, unknown>;
    organizationId: string;
    poolConfig: ConnectionPoolConfig;
    createdAt: Date;
    updatedAt: Date;
    status: DataSourceStatus;
    lastTestedAt?: Date;
    lastError?: string;
  }) {
    this.id = params.id;
    this.name = params.name;
    this.type = params.type;
    this.host = params.host;
    this.port = params.port;
    this.database = params.database;
    this.credentials = params.credentials;
    this.options = params.options;
    this.organizationId = params.organizationId;
    this.poolConfig = params.poolConfig;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
    this._status = params.status;
    this._lastTestedAt = params.lastTestedAt;
    this._lastError = params.lastError;
  }

  get status(): DataSourceStatus {
    return this._status;
  }

  get lastTestedAt(): Date | undefined {
    return this._lastTestedAt;
  }

  get lastError(): string | undefined {
    return this._lastError;
  }

  /**
   * Factory method to create a new DataSource from configuration.
   * Validates all required fields before creating.
   */
  static create(params: {
    name: string;
    type: DatabaseType;
    host?: string;
    port?: number;
    database: string;
    username?: string;
    password?: string;
    ssl?: boolean;
    options?: Record<string, unknown>;
    organizationId: string;
    poolConfig?: Partial<ConnectionPoolConfig>;
  }): Result<DataSource> {
    // Validate name
    if (!params.name || params.name.trim().length === 0) {
      return err(new ValidationError('Data source name is required'));
    }
    if (params.name.length > 255) {
      return err(new ValidationError('Data source name must be 255 characters or less'));
    }

    // Validate database name
    if (!params.database || params.database.trim().length === 0) {
      return err(new ValidationError('Database name is required'));
    }

    // Validate host for non-embedded databases
    if (params.type !== 'sqlite' && params.type !== 'duckdb') {
      if (!params.host || params.host.trim().length === 0) {
        return err(new ValidationError(`Host is required for ${params.type} connections`));
      }
    }

    // Validate port range
    if (params.port !== undefined && (params.port < 1 || params.port > 65535)) {
      return err(new ValidationError('Port must be between 1 and 65535'));
    }

    // Validate organization
    if (!params.organizationId || params.organizationId.trim().length === 0) {
      return err(new ValidationError('Organization ID is required'));
    }

    const now = new Date();
    const poolConfig: ConnectionPoolConfig = {
      ...DEFAULT_POOL_CONFIG,
      ...params.poolConfig,
    };

    const ds = new DataSource({
      id: generateId(),
      name: params.name.trim(),
      type: params.type,
      host: params.host?.trim(),
      port: params.port ?? getDefaultPort(params.type),
      database: params.database.trim(),
      credentials: {
        username: params.username,
        password: params.password,
        ssl: params.ssl ?? false,
      },
      options: params.options ?? {},
      organizationId: params.organizationId,
      poolConfig,
      createdAt: now,
      updatedAt: now,
      status: 'disconnected',
    });

    return ok(ds);
  }

  /**
   * Reconstitute a DataSource from persisted data.
   * Used by repositories to rebuild domain objects from stored state.
   */
  static fromPersistence(params: {
    id: string;
    name: string;
    type: DatabaseType;
    host?: string;
    port?: number;
    database: string;
    username?: string;
    password?: string;
    ssl: boolean;
    options: Record<string, unknown>;
    organizationId: string;
    poolConfig: ConnectionPoolConfig;
    createdAt: Date;
    updatedAt: Date;
    status: DataSourceStatus;
    lastTestedAt?: Date;
    lastError?: string;
  }): DataSource {
    return new DataSource({
      ...params,
      credentials: {
        username: params.username,
        password: params.password,
        ssl: params.ssl,
      },
    });
  }

  /**
   * Test the connection to this data source.
   * Domain-level operation: validates internal state, returns structured result.
   * Actual connection testing is delegated to the connector layer.
   */
  testConnection(): Result<{ dataSourceId: string; status: DataSourceStatus }> {
    if (!this.database) {
      return err(new ConnectionError('Cannot test connection: no database configured'));
    }

    if (this.type !== 'sqlite' && this.type !== 'duckdb' && !this.host) {
      return err(new ConnectionError('Cannot test connection: no host configured'));
    }

    this._status = 'testing';
    this._lastTestedAt = new Date();

    return ok({
      dataSourceId: this.id,
      status: this._status,
    });
  }

  /**
   * Record a successful connection test.
   */
  markConnected(): void {
    this._status = 'connected';
    this._lastTestedAt = new Date();
    this._lastError = undefined;
  }

  /**
   * Record a failed connection test.
   */
  markConnectionFailed(error: string): void {
    this._status = 'error';
    this._lastTestedAt = new Date();
    this._lastError = error;
  }

  /**
   * Mark as disconnected (e.g., when deleting or disabling).
   */
  markDisconnected(): void {
    this._status = 'disconnected';
  }

  /**
   * Get the schema metadata for this data source.
   * Returns a validation result. Actual schema fetching is handled by connectors.
   */
  getSchema(): Result<{ dataSourceId: string; type: DatabaseType }> {
    if (this._status === 'error') {
      return err(new ConnectionError('Cannot fetch schema: data source has connection errors'));
    }

    return ok({
      dataSourceId: this.id,
      type: this.type,
    });
  }

  /**
   * Get the list of tables for this data source.
   * Returns a validation result. Actual table listing is handled by connectors.
   */
  getTables(): Result<{ dataSourceId: string; type: DatabaseType }> {
    if (this._status === 'error') {
      return err(new ConnectionError('Cannot fetch tables: data source has connection errors'));
    }

    return ok({
      dataSourceId: this.id,
      type: this.type,
    });
  }

  /**
   * Update the data source with new configuration.
   * Returns a new DataSource instance (immutability for value changes).
   */
  update(params: {
    name?: string;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    ssl?: boolean;
    options?: Record<string, unknown>;
    poolConfig?: Partial<ConnectionPoolConfig>;
  }): Result<DataSource> {
    const newName = params.name ?? this.name;
    if (newName.trim().length === 0) {
      return err(new ValidationError('Data source name cannot be empty'));
    }
    if (newName.length > 255) {
      return err(new ValidationError('Data source name must be 255 characters or less'));
    }

    if (params.port !== undefined && (params.port < 1 || params.port > 65535)) {
      return err(new ValidationError('Port must be between 1 and 65535'));
    }

    const updated = new DataSource({
      id: this.id,
      name: newName.trim(),
      type: this.type,
      host: params.host ?? this.host,
      port: params.port ?? this.port,
      database: params.database ?? this.database,
      credentials: {
        username: params.username ?? this.credentials.username,
        password: params.password ?? this.credentials.password,
        ssl: params.ssl ?? this.credentials.ssl,
      },
      options: params.options ?? this.options,
      organizationId: this.organizationId,
      poolConfig: {
        ...this.poolConfig,
        ...params.poolConfig,
      },
      createdAt: this.createdAt,
      updatedAt: new Date(),
      status: 'disconnected', // reset status on config change
      lastTestedAt: this._lastTestedAt,
      lastError: undefined,
    });

    return ok(updated);
  }

  /**
   * Convert to DataSourceConfig for connector layer.
   */
  toConfig(): DataSourceConfig {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      host: this.host,
      port: this.port,
      database: this.database,
      username: this.credentials.username,
      password: this.credentials.password,
      ssl: this.credentials.ssl,
      options: this.options,
    };
  }

  /**
   * Get a display-safe version (no credentials).
   */
  toSafeDisplay(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      host: this.host,
      port: this.port,
      database: this.database,
      ssl: this.credentials.ssl,
      organizationId: this.organizationId,
      status: this._status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastTestedAt: this._lastTestedAt,
    };
  }
}

/** Get the default port for a database type */
function getDefaultPort(type: DatabaseType): number | undefined {
  const portMap: Record<DatabaseType, number | undefined> = {
    postgresql: 5432,
    mysql: 3306,
    sqlite: undefined,
    clickhouse: 8123,
    bigquery: undefined,
    snowflake: 443,
    duckdb: undefined,
  };
  return portMap[type];
}

export { getDefaultPort };
