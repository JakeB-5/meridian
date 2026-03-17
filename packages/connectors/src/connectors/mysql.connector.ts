// ── MySQL Connector ─────────────────────────────────────────────────
// Full implementation using the 'mysql2' driver.
// Features: connection pooling, schema introspection via information_schema,
// query cancellation via KILL QUERY, SSL support.

import mysql from 'mysql2/promise';
import type {
  DatabaseType,
  SchemaInfo,
  TableInfo,
  TableColumnInfo,
  QueryResult,
  ColumnInfo,
  QueryExecutionContext,
  PoolStats,
} from '../types.js';
import { BaseConnector } from '../base-connector.js';
import type { BaseConnectorOptions } from '../base-connector.js';
import {
  ConnectorQueryError,
  ConnectorQueryCancelledError,
  ConnectorConnectionError,
} from '../errors.js';

// ── Types ───────────────────────────────────────────────────────────

interface MysqlQueryTracker {
  threadId: number | null;
  connection: mysql.PoolConnection | null;
}

// ── MySQL Connector ─────────────────────────────────────────────────

export class MySQLConnector extends BaseConnector {
  private pool: mysql.Pool | null = null;
  private readonly activeQueryThreads: Map<string, MysqlQueryTracker> = new Map();

  constructor(options: BaseConnectorOptions) {
    super(options);
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  protected async doConnect(): Promise<void> {
    const ssl = this.getSsl();
    const sslConfig = ssl === true
      ? { rejectUnauthorized: false }
      : ssl === false || ssl === undefined
        ? undefined
        : ssl;

    this.pool = mysql.createPool({
      host: this.getHost(),
      port: this.getPort(3306),
      database: this.getDatabase(),
      user: this.getUsername(),
      password: this.getPassword(),
      ssl: sslConfig as mysql.SslOptions | undefined,
      connectionLimit: this.getMaxConnections(),
      connectTimeout: this.getConnectionTimeout(),
      waitForConnections: true,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 30_000,
      ...this.getDriverOptions(),
    });

    // Validate pool by acquiring and releasing a connection
    const conn = await this.pool.getConnection();
    conn.release();
  }

  protected async doDisconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.activeQueryThreads.clear();
  }

  protected async doTestConnection(): Promise<void> {
    await this.rawQuery('SELECT 1 AS health_check');
  }

  // ── Schema Introspection ──────────────────────────────────────

  protected async doGetSchemas(): Promise<SchemaInfo[]> {
    const sql = `
      SELECT
        s.SCHEMA_NAME AS name,
        COUNT(t.TABLE_NAME) AS tableCount
      FROM information_schema.SCHEMATA s
      LEFT JOIN information_schema.TABLES t
        ON t.TABLE_SCHEMA = s.SCHEMA_NAME
        AND t.TABLE_TYPE IN ('BASE TABLE', 'VIEW')
      WHERE s.SCHEMA_NAME NOT IN (
        'information_schema', 'performance_schema', 'mysql', 'sys'
      )
      GROUP BY s.SCHEMA_NAME
      ORDER BY s.SCHEMA_NAME
    `;

    const result = await this.rawQuery(sql);

    return result.rows.map((row) => ({
      name: row['name'] as string,
      tables: [],
    }));
  }

  protected async doGetTables(schema?: string): Promise<TableInfo[]> {
    const targetSchema = schema ?? this.getDatabase();

    const sql = `
      SELECT
        t.TABLE_NAME AS name,
        t.TABLE_SCHEMA AS \`schema\`,
        CASE t.TABLE_TYPE
          WHEN 'BASE TABLE' THEN 'table'
          WHEN 'VIEW' THEN 'view'
          ELSE 'table'
        END AS type,
        t.TABLE_ROWS AS rowCount
      FROM information_schema.TABLES t
      WHERE t.TABLE_SCHEMA = ?
        AND t.TABLE_TYPE IN ('BASE TABLE', 'VIEW')
      ORDER BY t.TABLE_NAME
    `;

    const result = await this.rawQuery(sql, [targetSchema]);

    return result.rows.map((row) => ({
      name: row['name'] as string,
      schema: row['schema'] as string,
      type: row['type'] as 'table' | 'view',
      columns: [],
      rowCount: row['rowCount'] != null ? Number(row['rowCount']) : undefined,
    }));
  }

  protected async doGetColumns(table: string, schema?: string): Promise<TableColumnInfo[]> {
    const targetSchema = schema ?? this.getDatabase();

    const sql = `
      SELECT
        c.COLUMN_NAME AS name,
        c.DATA_TYPE AS type,
        CASE c.IS_NULLABLE WHEN 'YES' THEN TRUE ELSE FALSE END AS nullable,
        CASE WHEN c.COLUMN_KEY = 'PRI' THEN TRUE ELSE FALSE END AS primaryKey,
        c.COLUMN_DEFAULT AS defaultValue,
        c.COLUMN_COMMENT AS comment,
        c.COLUMN_TYPE AS fullType,
        c.CHARACTER_MAXIMUM_LENGTH AS maxLength,
        c.NUMERIC_PRECISION AS numericPrecision,
        c.NUMERIC_SCALE AS numericScale,
        c.EXTRA AS extra
      FROM information_schema.COLUMNS c
      WHERE c.TABLE_SCHEMA = ?
        AND c.TABLE_NAME = ?
      ORDER BY c.ORDINAL_POSITION
    `;

    const result = await this.rawQuery(sql, [targetSchema, table]);

    return result.rows.map((row) => ({
      name: row['name'] as string,
      type: this.buildMysqlType(row),
      nullable: Boolean(row['nullable']),
      primaryKey: Boolean(row['primaryKey']),
      defaultValue: row['defaultValue'] != null ? String(row['defaultValue']) : undefined,
      comment: row['comment'] != null && String(row['comment']).length > 0
        ? String(row['comment'])
        : undefined,
    }));
  }

  // ── Query Execution ───────────────────────────────────────────

  protected async doExecuteQuery(
    sql: string,
    params: unknown[] | undefined,
    context: QueryExecutionContext,
  ): Promise<QueryResult> {
    if (!this.pool) {
      throw new ConnectorQueryError('Pool is not initialized', {
        connectorType: this.type,
      });
    }

    const connection = await this.pool.getConnection();
    let threadId: number | null = null;

    try {
      // Get thread ID for query cancellation
      threadId = connection.threadId ?? null;
      this.activeQueryThreads.set(context.queryId, { threadId, connection });

      // Set session-level query timeout
      const timeoutSeconds = Math.ceil(context.timeoutMs / 1000);
      await connection.query(`SET SESSION max_execution_time = ${timeoutSeconds * 1000}`);

      // Execute the query
      const [rows, fields] = await connection.query(sql, params);

      // Handle DDL/DML statements that don't return rows
      if (!Array.isArray(rows)) {
        const resultHeader = rows as mysql.ResultSetHeader;
        return {
          columns: [],
          rows: [],
          rowCount: resultHeader.affectedRows ?? 0,
          executionTimeMs: 0,
          truncated: false,
        };
      }

      // Extract column info
      const columns: ColumnInfo[] = (fields as mysql.FieldPacket[]).map((field) => ({
        name: field.name,
        type: this.mysqlFieldTypeToString(field.type, Number(field.flags)),
        nullable: !(Number(field.flags) & 0x0001), // NOT_NULL_FLAG
      }));

      const rowData = rows as Record<string, unknown>[];
      const truncated = rowData.length > context.maxRows;

      return {
        columns,
        rows: truncated ? rowData.slice(0, context.maxRows) : rowData,
        rowCount: truncated ? context.maxRows : rowData.length,
        executionTimeMs: 0,
        truncated,
      };
    } catch (error) {
      if (context.abortSignal?.aborted) {
        throw new ConnectorQueryCancelledError(context.queryId, {
          connectorType: this.type,
        });
      }

      const mysqlError = error as {
        code?: string;
        errno?: number;
        sqlState?: string;
        message?: string;
      };

      throw new ConnectorQueryError(mysqlError.message ?? 'Unknown error', {
        connectorType: this.type,
        originalError: error instanceof Error ? error : new Error(String(error)),
        sql: sql.substring(0, 500),
        details: {
          mysqlCode: mysqlError.code,
          errno: mysqlError.errno,
          sqlState: mysqlError.sqlState,
        },
      });
    } finally {
      this.activeQueryThreads.delete(context.queryId);
      connection.release();
    }
  }

  protected async doCancelQuery(queryId: string): Promise<void> {
    const tracker = this.activeQueryThreads.get(queryId);
    if (!tracker?.threadId || !this.pool) {
      return;
    }

    try {
      // Use KILL QUERY to cancel the running query without closing the connection
      const conn = await this.pool.getConnection();
      try {
        await conn.query(`KILL QUERY ${tracker.threadId}`);
      } finally {
        conn.release();
      }
    } catch (error) {
      this.logger.warn('KILL QUERY failed', {
        queryId,
        threadId: tracker.threadId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ── Metadata ──────────────────────────────────────────────────

  protected async doGetVersion(): Promise<string> {
    const result = await this.rawQuery('SELECT VERSION() AS version');
    return (result.rows[0]?.version as string) ?? 'unknown';
  }

  // ── Pool Stats ────────────────────────────────────────────────

  override getPoolStats(): PoolStats | null {
    if (!this.pool) return null;

    const poolInternal = this.pool.pool as unknown as {
      _allConnections?: { length: number };
      _freeConnections?: { length: number };
      _connectionQueue?: { length: number };
    };

    const total = poolInternal._allConnections?.length ?? 0;
    const idle = poolInternal._freeConnections?.length ?? 0;
    const waiting = poolInternal._connectionQueue?.length ?? 0;

    return {
      totalConnections: total,
      activeConnections: total - idle,
      idleConnections: idle,
      waitingRequests: waiting,
    };
  }

  // ── MySQL-Specific Public Methods ─────────────────────────────

  /**
   * Get global server variables.
   */
  async getServerVariables(): Promise<Record<string, string>> {
    this.ensureConnected();
    const result = await this.rawQuery('SHOW GLOBAL VARIABLES');
    const variables: Record<string, string> = {};
    for (const row of result.rows) {
      const name = row['Variable_name'] as string;
      const value = row['Value'] as string;
      if (name) {
        variables[name] = value;
      }
    }
    return variables;
  }

  /**
   * Get the server status (uptime, queries, threads, etc.).
   */
  async getServerStatus(): Promise<Record<string, string>> {
    this.ensureConnected();
    const result = await this.rawQuery('SHOW GLOBAL STATUS');
    const status: Record<string, string> = {};
    for (const row of result.rows) {
      const name = row['Variable_name'] as string;
      const value = row['Value'] as string;
      if (name) {
        status[name] = value;
      }
    }
    return status;
  }

  /**
   * Get the list of running processes.
   */
  async getProcessList(): Promise<Record<string, unknown>[]> {
    this.ensureConnected();
    const result = await this.rawQuery('SHOW PROCESSLIST');
    return result.rows;
  }

  /**
   * Get table sizes for a schema.
   */
  async getTableSizes(schema?: string): Promise<Array<{ table: string; sizeBytes: number; rowCount: number }>> {
    this.ensureConnected();
    const targetSchema = schema ?? this.getDatabase();

    const result = await this.rawQuery(
      `
      SELECT
        TABLE_NAME AS \`table\`,
        (DATA_LENGTH + INDEX_LENGTH) AS sizeBytes,
        TABLE_ROWS AS rowCount
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC
      `,
      [targetSchema],
    );

    return result.rows.map((row) => ({
      table: row['table'] as string,
      sizeBytes: Number(row['sizeBytes'] ?? 0),
      rowCount: Number(row['rowCount'] ?? 0),
    }));
  }

  /**
   * Get indexes for a table.
   */
  async getIndexes(table: string, schema?: string): Promise<Record<string, unknown>[]> {
    this.ensureConnected();
    const targetSchema = schema ?? this.getDatabase();

    const result = await this.rawQuery(
      `
      SELECT
        s.INDEX_NAME AS indexName,
        s.COLUMN_NAME AS columnName,
        s.NON_UNIQUE AS nonUnique,
        s.SEQ_IN_INDEX AS seqInIndex,
        s.INDEX_TYPE AS indexType,
        s.CARDINALITY AS cardinality,
        s.NULLABLE AS nullable
      FROM information_schema.STATISTICS s
      WHERE s.TABLE_SCHEMA = ?
        AND s.TABLE_NAME = ?
      ORDER BY s.INDEX_NAME, s.SEQ_IN_INDEX
      `,
      [targetSchema, table],
    );

    return result.rows;
  }

  /**
   * Get foreign keys for a table.
   */
  async getForeignKeys(table: string, schema?: string): Promise<Record<string, unknown>[]> {
    this.ensureConnected();
    const targetSchema = schema ?? this.getDatabase();

    const result = await this.rawQuery(
      `
      SELECT
        kcu.CONSTRAINT_NAME AS constraintName,
        kcu.COLUMN_NAME AS columnName,
        kcu.REFERENCED_TABLE_SCHEMA AS referencedSchema,
        kcu.REFERENCED_TABLE_NAME AS referencedTable,
        kcu.REFERENCED_COLUMN_NAME AS referencedColumn,
        rc.UPDATE_RULE AS updateRule,
        rc.DELETE_RULE AS deleteRule
      FROM information_schema.KEY_COLUMN_USAGE kcu
      JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
        ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        AND rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA
      WHERE kcu.TABLE_SCHEMA = ?
        AND kcu.TABLE_NAME = ?
        AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
      `,
      [targetSchema, table],
    );

    return result.rows;
  }

  // ── Private Helpers ───────────────────────────────────────────

  private async rawQuery(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> {
    if (!this.pool) {
      throw new ConnectorQueryError('Pool is not initialized', {
        connectorType: this.type,
      });
    }

    const [rows] = await this.pool.query(sql, params);
    return { rows: (Array.isArray(rows) ? rows : []) as Record<string, unknown>[] };
  }

  /**
   * Build a readable MySQL type from column metadata.
   */
  private buildMysqlType(row: Record<string, unknown>): string {
    const dataType = String(row['type'] ?? 'unknown');
    const fullType = String(row['fullType'] ?? dataType);

    // Use fullType for types that include length/precision (e.g. varchar(255), decimal(10,2))
    if (fullType !== dataType) {
      return fullType;
    }
    return dataType;
  }

  /**
   * Map a MySQL field type constant to a human-readable string.
   */
  private mysqlFieldTypeToString(type: number | undefined, flags: number | undefined): string {
    if (type === undefined) return 'unknown';

    // mysql2 field type constants
    const types: Record<number, string> = {
      0: 'decimal',
      1: 'tinyint',
      2: 'smallint',
      3: 'int',
      4: 'float',
      5: 'double',
      6: 'null',
      7: 'timestamp',
      8: 'bigint',
      9: 'mediumint',
      10: 'date',
      11: 'time',
      12: 'datetime',
      13: 'year',
      14: 'newdate',
      15: 'varchar',
      16: 'bit',
      245: 'json',
      246: 'newdecimal',
      247: 'enum',
      248: 'set',
      249: 'tiny_blob',
      250: 'medium_blob',
      251: 'long_blob',
      252: 'blob',
      253: 'var_string',
      254: 'string',
      255: 'geometry',
    };

    let typeName = types[type] ?? `unknown(${type})`;

    // Check for unsigned flag
    if (flags && (flags & 0x0020)) {
      typeName = `unsigned ${typeName}`;
    }

    return typeName;
  }
}
