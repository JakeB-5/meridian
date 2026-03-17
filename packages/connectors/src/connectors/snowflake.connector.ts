// ── Snowflake Connector (Stub) ──────────────────────────────────────
// Stub implementation for Snowflake.
// Provides the proper interface and throws ConnectorNotImplementedError
// for all operations. Ready for full implementation with snowflake-sdk.

import type {
  DatabaseType,
  SchemaInfo,
  TableInfo,
  TableColumnInfo,
  QueryResult,
  ColumnInfo,
  QueryExecutionContext,
  ConnectionTestResult,
} from '../types.js';
import { BaseConnector } from '../base-connector.js';
import type { BaseConnectorOptions } from '../base-connector.js';
import { ConnectorNotImplementedError } from '../errors.js';

// ── Snowflake Configuration Interface ───────────────────────────────

/**
 * Snowflake-specific configuration that extends the base DataSourceConfig options.
 * When implementing, pass these via DataSourceConfig.options.
 */
export interface SnowflakeConfig {
  /** Snowflake account identifier (e.g., 'xy12345.us-east-1') */
  account: string;
  /** Username for authentication */
  username: string;
  /** Password for password-based authentication */
  password?: string;
  /** Path to private key file for key-pair authentication */
  privateKeyPath?: string;
  /** Private key passphrase */
  privateKeyPass?: string;
  /** Snowflake role to use */
  role?: string;
  /** Virtual warehouse to use for query execution */
  warehouse?: string;
  /** Default database */
  database?: string;
  /** Default schema */
  schema?: string;
  /** Application name for tracking */
  application?: string;
  /** Session timeout in seconds */
  clientSessionKeepAlive?: boolean;
  /** Whether to use browser-based SSO authentication */
  authenticator?: 'SNOWFLAKE' | 'EXTERNALBROWSER' | 'SNOWFLAKE_JWT' | 'OAUTH';
  /** OAuth token for OAUTH authenticator */
  token?: string;
}

// ── Snowflake Connector ─────────────────────────────────────────────

export class SnowflakeConnector extends BaseConnector {
  private readonly snowflakeConfig: SnowflakeConfig;

  constructor(options: BaseConnectorOptions) {
    super(options);

    const configOptions = this.config.options ?? {};
    this.snowflakeConfig = {
      account: (configOptions['account'] as string) ?? '',
      username: this.getUsername(),
      password: this.getPassword() || undefined,
      privateKeyPath: configOptions['privateKeyPath'] as string | undefined,
      privateKeyPass: configOptions['privateKeyPass'] as string | undefined,
      role: configOptions['role'] as string | undefined,
      warehouse: configOptions['warehouse'] as string | undefined,
      database: this.getDatabase() || (configOptions['database'] as string | undefined),
      schema: configOptions['schema'] as string | undefined,
      application: (configOptions['application'] as string) ?? 'Meridian',
      clientSessionKeepAlive: (configOptions['clientSessionKeepAlive'] as boolean) ?? true,
      authenticator: (configOptions['authenticator'] as SnowflakeConfig['authenticator']) ?? 'SNOWFLAKE',
      token: configOptions['token'] as string | undefined,
    };
  }

  /**
   * Get the parsed Snowflake configuration.
   */
  getSnowflakeConfig(): SnowflakeConfig {
    return { ...this.snowflakeConfig };
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  protected async doConnect(): Promise<void> {
    throw new ConnectorNotImplementedError('connect', this.type);
  }

  protected async doDisconnect(): Promise<void> {
    throw new ConnectorNotImplementedError('disconnect', this.type);
  }

  protected async doTestConnection(): Promise<void> {
    throw new ConnectorNotImplementedError('testConnection', this.type);
  }

  // ── Schema Introspection ──────────────────────────────────────

  protected async doGetSchemas(): Promise<SchemaInfo[]> {
    throw new ConnectorNotImplementedError('getSchemas', this.type);
  }

  protected async doGetTables(_schema?: string): Promise<TableInfo[]> {
    throw new ConnectorNotImplementedError('getTables', this.type);
  }

  protected async doGetColumns(_table: string, _schema?: string): Promise<TableColumnInfo[]> {
    throw new ConnectorNotImplementedError('getColumns', this.type);
  }

  // ── Query Execution ───────────────────────────────────────────

  protected async doExecuteQuery(
    _sql: string,
    _params: unknown[] | undefined,
    _context: QueryExecutionContext,
  ): Promise<QueryResult> {
    throw new ConnectorNotImplementedError('executeQuery', this.type);
  }

  protected async doCancelQuery(_queryId: string): Promise<void> {
    throw new ConnectorNotImplementedError('cancelQuery', this.type);
  }

  // ── Metadata ──────────────────────────────────────────────────

  protected async doGetVersion(): Promise<string> {
    throw new ConnectorNotImplementedError('getVersion', this.type);
  }
}

// ── Implementation Notes ────────────────────────────────────────────
//
// To implement fully, install snowflake-sdk and:
//
// 1. doConnect():
//    - const snowflake = require('snowflake-sdk');
//    - this.connection = snowflake.createConnection({
//        account: this.snowflakeConfig.account,
//        username: this.snowflakeConfig.username,
//        password: this.snowflakeConfig.password,
//        role: this.snowflakeConfig.role,
//        warehouse: this.snowflakeConfig.warehouse,
//        database: this.snowflakeConfig.database,
//        schema: this.snowflakeConfig.schema,
//        application: this.snowflakeConfig.application,
//      });
//    - Wrap connect in a Promise
//
// 2. doGetSchemas():
//    - SHOW SCHEMAS IN DATABASE <db>
//    - Or use information_schema.schemata
//
// 3. doGetTables():
//    - SHOW TABLES IN SCHEMA <db>.<schema>
//    - Or use information_schema.tables
//
// 4. doGetColumns():
//    - DESCRIBE TABLE <db>.<schema>.<table>
//    - Or use information_schema.columns
//
// 5. doExecuteQuery():
//    - Use connection.execute() with binds for parameters
//    - Handle streaming for large result sets
//    - Support for multi-statement queries
//
// 6. doCancelQuery():
//    - Use connection.execute({ sqlText: 'SELECT SYSTEM$CANCEL_QUERY(query_id)' })
//    - Or use statement.cancel()
//
// 7. Warehouse considerations:
//    - Auto-suspend warehouse after idle period
//    - Support for warehouse size selection per query
//    - Track query costs via QUERY_HISTORY view
//
// 8. Authentication:
//    - Key-pair auth: Load private key and use for JWT
//    - OAuth: Support token refresh
//    - SSO: Browser-based authentication for local development
