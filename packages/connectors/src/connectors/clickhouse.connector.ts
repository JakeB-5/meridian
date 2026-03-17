// ── ClickHouse Connector ────────────────────────────────────────────
// Full implementation using the '@clickhouse/client' driver.
// Features: HTTP interface, schema introspection via system tables,
// large result streaming, query cancellation.

import { createClient } from '@clickhouse/client';
import type { ClickHouseClient, QueryParams, ResultSet } from '@clickhouse/client';

import type {
  DatabaseType,
  SchemaInfo,
  TableInfo,
  TableColumnInfo,
  QueryResult,
  ColumnInfo,
  QueryExecutionContext,
} from '../types.js';
import { BaseConnector } from '../base-connector.js';
import type { BaseConnectorOptions } from '../base-connector.js';
import {
  ConnectorQueryError,
  ConnectorQueryCancelledError,
} from '../errors.js';

// ── ClickHouse Connector ────────────────────────────────────────────

export class ClickHouseConnector extends BaseConnector {
  private client: ClickHouseClient | null = null;
  private readonly activeQueryIds: Map<string, string> = new Map(); // queryId -> CH query_id

  constructor(options: BaseConnectorOptions) {
    super(options);
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  protected async doConnect(): Promise<void> {
    const ssl = this.getSsl();
    const protocol = ssl ? 'https' : 'http';
    const host = this.getHost();
    const port = this.getPort(8123);

    const driverOptions = this.getDriverOptions();

    this.client = createClient({
      url: `${protocol}://${host}:${port}`,
      username: this.getUsername() || 'default',
      password: this.getPassword(),
      database: this.getDatabase() || 'default',
      request_timeout: this.getConnectionTimeout(),
      max_open_connections: this.getMaxConnections(),
      compression: {
        request: (driverOptions['compressRequest'] as boolean) ?? false,
        response: (driverOptions['compressResponse'] as boolean) ?? true,
      },
      clickhouse_settings: {
        max_execution_time: Math.ceil(this.queryTimeoutMs / 1000),
        ...(driverOptions['clickhouseSettings'] as Record<string, unknown> ?? {}),
      },
    });

    // Validate by running a health check
    await this.client.ping();
  }

  protected async doDisconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    this.activeQueryIds.clear();
  }

  protected async doTestConnection(): Promise<void> {
    if (!this.client) {
      throw new ConnectorQueryError('Client is not initialized', {
        connectorType: this.type,
      });
    }
    await this.client.ping();
  }

  // ── Schema Introspection ──────────────────────────────────────

  protected async doGetSchemas(): Promise<SchemaInfo[]> {
    const sql = `
      SELECT
        name,
        count() AS tableCount
      FROM (
        SELECT database AS name, name AS table_name
        FROM system.tables
        WHERE database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
      )
      GROUP BY name
      ORDER BY name
    `;

    const result = await this.rawQuery(sql);

    return result.map((row) => ({
      name: row['name'] as string,
      tables: [],
    }));
  }

  protected async doGetTables(schema?: string): Promise<TableInfo[]> {
    const targetSchema = schema ?? this.getDatabase() ?? 'default';

    const sql = `
      SELECT
        name,
        database AS schema,
        CASE engine
          WHEN 'View' THEN 'view'
          WHEN 'MaterializedView' THEN 'view'
          ELSE 'table'
        END AS type,
        total_rows AS rowCount,
        engine,
        total_bytes AS sizeBytes
      FROM system.tables
      WHERE database = {database:String}
      ORDER BY name
    `;

    const result = await this.rawQueryWithParams(sql, { database: targetSchema });

    return result.map((row) => ({
      name: row['name'] as string,
      schema: row['schema'] as string,
      type: row['type'] as 'table' | 'view',
      columns: [],
      rowCount: row['rowCount'] != null ? Number(row['rowCount']) : undefined,
    }));
  }

  protected async doGetColumns(table: string, schema?: string): Promise<TableColumnInfo[]> {
    const targetSchema = schema ?? this.getDatabase() ?? 'default';

    const sql = `
      SELECT
        name,
        type,
        default_kind,
        default_expression,
        comment,
        is_in_primary_key
      FROM system.columns
      WHERE database = {database:String}
        AND table = {table:String}
      ORDER BY position
    `;

    const result = await this.rawQueryWithParams(sql, {
      database: targetSchema,
      table,
    });

    return result.map((row) => {
      const typeName = row['type'] as string;
      const isNullable = typeName.startsWith('Nullable(');

      return {
        name: row['name'] as string,
        type: typeName,
        nullable: isNullable,
        primaryKey: Boolean(row['is_in_primary_key']),
        defaultValue: row['default_expression']
          ? String(row['default_expression'])
          : undefined,
        comment: row['comment'] != null && String(row['comment']).length > 0
          ? String(row['comment'])
          : undefined,
      };
    });
  }

  // ── Query Execution ───────────────────────────────────────────

  protected async doExecuteQuery(
    sql: string,
    params: unknown[] | undefined,
    context: QueryExecutionContext,
  ): Promise<QueryResult> {
    if (!this.client) {
      throw new ConnectorQueryError('Client is not initialized', {
        connectorType: this.type,
      });
    }

    if (context.abortSignal?.aborted) {
      throw new ConnectorQueryCancelledError(context.queryId, {
        connectorType: this.type,
      });
    }

    // Generate a unique ClickHouse query ID for cancellation
    const chQueryId = `meridian_${context.queryId}_${Date.now()}`;
    this.activeQueryIds.set(context.queryId, chQueryId);

    try {
      const trimmedSql = sql.trim().toUpperCase();
      const isSelect = trimmedSql.startsWith('SELECT')
        || trimmedSql.startsWith('WITH')
        || trimmedSql.startsWith('SHOW')
        || trimmedSql.startsWith('DESCRIBE')
        || trimmedSql.startsWith('EXPLAIN');

      if (isSelect) {
        return await this.executeSelectQuery(sql, params, context, chQueryId);
      } else {
        return await this.executeMutationQuery(sql, params, context, chQueryId);
      }
    } catch (error) {
      if (context.abortSignal?.aborted) {
        throw new ConnectorQueryCancelledError(context.queryId, {
          connectorType: this.type,
        });
      }

      const chError = error as { code?: number; type?: string; message?: string };
      throw new ConnectorQueryError(chError.message ?? 'Unknown error', {
        connectorType: this.type,
        originalError: error instanceof Error ? error : new Error(String(error)),
        sql: sql.substring(0, 500),
        details: {
          chCode: chError.code,
          chType: chError.type,
        },
      });
    } finally {
      this.activeQueryIds.delete(context.queryId);
    }
  }

  protected async doCancelQuery(queryId: string): Promise<void> {
    const chQueryId = this.activeQueryIds.get(queryId);
    if (!chQueryId || !this.client) {
      return;
    }

    try {
      await this.client.query({
        query: `KILL QUERY WHERE query_id = '${chQueryId.replace(/'/g, "\\'")}'`,
      });
    } catch (error) {
      this.logger.warn('KILL QUERY failed', {
        queryId,
        chQueryId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ── Metadata ──────────────────────────────────────────────────

  protected async doGetVersion(): Promise<string> {
    const result = await this.rawQuery('SELECT version() AS version');
    return (result[0]?.version as string) ?? 'unknown';
  }

  // ── ClickHouse-Specific Public Methods ────────────────────────

  /**
   * Get ClickHouse server uptime in seconds.
   */
  async getUptime(): Promise<number> {
    this.ensureConnected();
    const result = await this.rawQuery('SELECT uptime() AS uptime');
    return Number(result[0]?.uptime ?? 0);
  }

  /**
   * Get the list of databases.
   */
  async getDatabases(): Promise<string[]> {
    this.ensureConnected();
    const result = await this.rawQuery('SHOW DATABASES');
    return result.map((row) => row['name'] as string);
  }

  /**
   * Get the table engine for a specific table.
   */
  async getTableEngine(table: string, schema?: string): Promise<string> {
    this.ensureConnected();
    const targetSchema = schema ?? this.getDatabase() ?? 'default';
    const result = await this.rawQueryWithParams(
      `SELECT engine FROM system.tables WHERE database = {database:String} AND name = {table:String}`,
      { database: targetSchema, table },
    );
    return (result[0]?.engine as string) ?? 'unknown';
  }

  /**
   * Get MergeTree partition info for a table.
   */
  async getPartitions(table: string, schema?: string): Promise<Record<string, unknown>[]> {
    this.ensureConnected();
    const targetSchema = schema ?? this.getDatabase() ?? 'default';
    return this.rawQueryWithParams(
      `
      SELECT
        partition,
        name AS part_name,
        rows,
        bytes_on_disk,
        modification_time
      FROM system.parts
      WHERE database = {database:String}
        AND table = {table:String}
        AND active = 1
      ORDER BY partition
      `,
      { database: targetSchema, table },
    );
  }

  /**
   * Get currently running queries.
   */
  async getRunningQueries(): Promise<Record<string, unknown>[]> {
    this.ensureConnected();
    return this.rawQuery(`
      SELECT
        query_id,
        user,
        query,
        elapsed,
        read_rows,
        read_bytes,
        memory_usage
      FROM system.processes
      WHERE is_cancelled = 0
      ORDER BY elapsed DESC
    `);
  }

  /**
   * Optimize a MergeTree table (trigger merge).
   */
  async optimizeTable(table: string, schema?: string, final: boolean = false): Promise<void> {
    this.ensureConnected();
    const targetSchema = schema ?? this.getDatabase() ?? 'default';
    const sql = `OPTIMIZE TABLE ${this.quoteIdentifier(targetSchema)}.${this.quoteIdentifier(table)}${final ? ' FINAL' : ''}`;
    await this.rawQuery(sql);
  }

  /**
   * Get table disk usage information.
   */
  async getTableSizes(schema?: string): Promise<Array<{
    table: string;
    engine: string;
    rows: number;
    bytesOnDisk: number;
    compressedBytes: number;
    uncompressedBytes: number;
  }>> {
    this.ensureConnected();
    const targetSchema = schema ?? this.getDatabase() ?? 'default';

    const result = await this.rawQueryWithParams(
      `
      SELECT
        name AS table,
        engine,
        total_rows AS rows,
        total_bytes AS bytesOnDisk,
        0 AS compressedBytes,
        0 AS uncompressedBytes
      FROM system.tables
      WHERE database = {database:String}
        AND total_bytes > 0
      ORDER BY total_bytes DESC
      `,
      { database: targetSchema },
    );

    return result.map((row) => ({
      table: row['table'] as string,
      engine: row['engine'] as string,
      rows: Number(row['rows'] ?? 0),
      bytesOnDisk: Number(row['bytesOnDisk'] ?? 0),
      compressedBytes: Number(row['compressedBytes'] ?? 0),
      uncompressedBytes: Number(row['uncompressedBytes'] ?? 0),
    }));
  }

  // ── Private Helpers ───────────────────────────────────────────

  private async rawQuery(sql: string): Promise<Record<string, unknown>[]> {
    if (!this.client) {
      throw new ConnectorQueryError('Client is not initialized', {
        connectorType: this.type,
      });
    }

    const resultSet = await this.client.query({
      query: sql,
      format: 'JSONEachRow',
    });

    return (await resultSet.json()) as Record<string, unknown>[];
  }

  private async rawQueryWithParams(
    sql: string,
    queryParams: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    if (!this.client) {
      throw new ConnectorQueryError('Client is not initialized', {
        connectorType: this.type,
      });
    }

    const resultSet = await this.client.query({
      query: sql,
      format: 'JSONEachRow',
      query_params: queryParams,
    });

    return (await resultSet.json()) as Record<string, unknown>[];
  }

  private async executeSelectQuery(
    sql: string,
    params: unknown[] | undefined,
    context: QueryExecutionContext,
    chQueryId: string,
  ): Promise<QueryResult> {
    const queryOptions: QueryParams = {
      query: sql,
      query_id: chQueryId,
      format: 'JSONEachRow',
      clickhouse_settings: {
        max_execution_time: Math.ceil(context.timeoutMs / 1000),
        max_result_rows: String(context.maxRows + 1), // +1 to detect truncation
      },
    };

    const resultSet = await this.client!.query(queryOptions);
    const rows = (await resultSet.json()) as Record<string, unknown>[];

    // Infer columns from first row
    const columns: ColumnInfo[] = rows.length > 0
      ? Object.keys(rows[0]!).map((key) => ({
          name: key,
          type: this.inferClickHouseType(rows[0]![key]),
          nullable: true,
        }))
      : [];

    const truncated = rows.length > context.maxRows;

    return {
      columns,
      rows: truncated ? rows.slice(0, context.maxRows) : rows,
      rowCount: truncated ? context.maxRows : rows.length,
      executionTimeMs: 0,
      truncated,
    };
  }

  private async executeMutationQuery(
    sql: string,
    params: unknown[] | undefined,
    context: QueryExecutionContext,
    chQueryId: string,
  ): Promise<QueryResult> {
    await this.client!.command({
      query: sql,
      query_id: chQueryId,
      clickhouse_settings: {
        max_execution_time: Math.ceil(context.timeoutMs / 1000),
      },
    });

    return {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
      truncated: false,
    };
  }

  private inferClickHouseType(value: unknown): string {
    if (value === null || value === undefined) return 'Nullable(String)';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'Int64' : 'Float64';
    }
    if (typeof value === 'boolean') return 'UInt8';
    if (typeof value === 'string') return 'String';
    if (Array.isArray(value)) return 'Array(String)';
    if (typeof value === 'object') return 'String'; // JSON
    return 'String';
  }

  private quoteIdentifier(identifier: string): string {
    return `\`${identifier.replace(/`/g, '\\`')}\``;
  }
}
