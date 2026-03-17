// ── PostgreSQL Connector ────────────────────────────────────────────
// Full implementation using the 'pg' driver.
// Features: connection pooling, schema introspection via information_schema,
// query cancellation via pg_cancel_backend, SSL support, LISTEN/NOTIFY.

import pg from 'pg';
import type {
  DatabaseType,
  ConnectionTestResult,
  SchemaInfo,
  TableInfo,
  TableColumnInfo,
  QueryResult,
  ColumnInfo,
  QueryExecutionContext,
  PoolStats,
} from '../types.js';
import { BaseConnector, generateQueryId } from '../base-connector.js';
import type { BaseConnectorOptions } from '../base-connector.js';
import {
  ConnectorQueryError,
  ConnectorQueryCancelledError,
  ConnectorConnectionError,
  ConnectorSchemaError,
  normalizeConnectorError,
} from '../errors.js';

const { Pool, Client } = pg;
type PgPool = InstanceType<typeof Pool>;
type PgPoolClient = pg.PoolClient;

// ── Types ───────────────────────────────────────────────────────────

interface PgQueryTracker {
  pid: number | null;
  client: PgPoolClient | null;
}

// ── PostgreSQL Connector ────────────────────────────────────────────

export class PostgreSQLConnector extends BaseConnector {
  private pool: PgPool | null = null;
  private readonly activeQueryPids: Map<string, PgQueryTracker> = new Map();
  private notificationListeners: Map<string, ((payload: string) => void)[]> = new Map();
  private listenClient: pg.Client | null = null;

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

    this.pool = new Pool({
      host: this.getHost(),
      port: this.getPort(5432),
      database: this.getDatabase(),
      user: this.getUsername(),
      password: this.getPassword(),
      ssl: sslConfig as pg.ConnectionConfig['ssl'],
      max: this.getMaxConnections(),
      connectionTimeoutMillis: this.getConnectionTimeout(),
      idleTimeoutMillis: this.connectorConfig.idleTimeout ?? 30_000,
      ...this.getDriverOptions(),
    });

    // Validate pool by acquiring and releasing a client
    const client = await this.pool.connect();
    client.release();

    // Handle pool-level errors
    this.pool.on('error', (err: Error) => {
      this.logger.error('Pool error', {
        error: err.message,
        type: this.type,
        id: this.id,
      });
      this.emit('pool:error', { error: err.message });
    });
  }

  protected async doDisconnect(): Promise<void> {
    // Close notification listener if active
    if (this.listenClient) {
      try {
        this.listenClient.end();
      } catch {
        // Ignore errors during cleanup
      }
      this.listenClient = null;
      this.notificationListeners.clear();
    }

    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.activeQueryPids.clear();
  }

  protected async doTestConnection(): Promise<void> {
    await this.rawQuery('SELECT 1 AS health_check');
  }

  // ── Schema Introspection ──────────────────────────────────────

  protected async doGetSchemas(): Promise<SchemaInfo[]> {
    const sql = `
      SELECT
        s.schema_name AS name,
        COUNT(t.table_name)::int AS "tableCount"
      FROM information_schema.schemata s
      LEFT JOIN information_schema.tables t
        ON t.table_schema = s.schema_name
        AND t.table_type IN ('BASE TABLE', 'VIEW')
      WHERE s.schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        AND s.schema_name NOT LIKE 'pg_temp_%'
        AND s.schema_name NOT LIKE 'pg_toast_temp_%'
      GROUP BY s.schema_name
      ORDER BY s.schema_name
    `;

    const result = await this.rawQuery(sql);

    return result.rows.map((row) => ({
      name: row['name'] as string,
      tables: [],
      // Populate tables lazily via getTables()
    }));
  }

  protected async doGetTables(schema?: string): Promise<TableInfo[]> {
    const targetSchema = schema ?? 'public';

    const sql = `
      SELECT
        t.table_name AS name,
        t.table_schema AS schema,
        CASE t.table_type
          WHEN 'BASE TABLE' THEN 'table'
          WHEN 'VIEW' THEN 'view'
          ELSE 'table'
        END AS type,
        (
          SELECT s.n_live_tup::int
          FROM pg_stat_user_tables s
          WHERE s.schemaname = t.table_schema
            AND s.relname = t.table_name
        ) AS "rowCount"
      FROM information_schema.tables t
      WHERE t.table_schema = $1
        AND t.table_type IN ('BASE TABLE', 'VIEW')
      ORDER BY t.table_name
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
    const targetSchema = schema ?? 'public';

    const sql = `
      SELECT
        c.column_name AS name,
        c.data_type AS type,
        CASE c.is_nullable WHEN 'YES' THEN true ELSE false END AS nullable,
        CASE
          WHEN kcu.column_name IS NOT NULL THEN true
          ELSE false
        END AS "primaryKey",
        c.column_default AS "defaultValue",
        pgd.description AS comment
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT kcu2.table_schema, kcu2.table_name, kcu2.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu2
          ON tc.constraint_name = kcu2.constraint_name
          AND tc.table_schema = kcu2.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
      ) kcu
        ON kcu.table_schema = c.table_schema
        AND kcu.table_name = c.table_name
        AND kcu.column_name = c.column_name
      LEFT JOIN pg_catalog.pg_statio_all_tables psat
        ON psat.schemaname = c.table_schema
        AND psat.relname = c.table_name
      LEFT JOIN pg_catalog.pg_description pgd
        ON pgd.objoid = psat.relid
        AND pgd.objsubid = c.ordinal_position
      WHERE c.table_schema = $1
        AND c.table_name = $2
      ORDER BY c.ordinal_position
    `;

    const result = await this.rawQuery(sql, [targetSchema, table]);

    return result.rows.map((row) => ({
      name: row['name'] as string,
      type: row['type'] as string,
      nullable: row['nullable'] as boolean,
      primaryKey: row['primaryKey'] as boolean,
      defaultValue: row['defaultValue'] != null ? String(row['defaultValue']) : undefined,
      comment: row['comment'] != null ? String(row['comment']) : undefined,
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

    const client = await this.pool.connect();
    let pid: number | null = null;

    try {
      // Get backend PID for query cancellation
      const pidResult = await client.query('SELECT pg_backend_pid() AS pid');
      pid = pidResult.rows[0]?.pid as number ?? null;

      // Track the query PID for cancellation
      this.activeQueryPids.set(context.queryId, { pid, client });

      // Set statement timeout for this session
      await client.query(`SET statement_timeout = ${context.timeoutMs}`);

      // Execute the query
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await client.query({
        text: sql,
        values: params,
        rowMode: 'object' as const,
      } as any);

      // Extract column info from result fields
      const columns: ColumnInfo[] = (result.fields ?? []).map((field: any) => ({
        name: field.name,
        type: this.pgTypeToString(field.dataTypeID),
        nullable: true, // pg doesn't expose nullable in query results easily
      }));

      const rows = result.rows as Record<string, unknown>[];
      const truncated = rows.length > context.maxRows;

      return {
        columns,
        rows: truncated ? rows.slice(0, context.maxRows) : rows,
        rowCount: truncated ? context.maxRows : rows.length,
        executionTimeMs: 0, // Base class will set this
        truncated,
      };
    } catch (error) {
      if (context.abortSignal?.aborted) {
        throw new ConnectorQueryCancelledError(context.queryId, {
          connectorType: this.type,
        });
      }

      const pgError = error as { code?: string; message?: string; detail?: string; hint?: string };
      throw new ConnectorQueryError(pgError.message ?? 'Unknown error', {
        connectorType: this.type,
        originalError: error instanceof Error ? error : new Error(String(error)),
        sql: sql.substring(0, 500),
        details: {
          pgCode: pgError.code,
          detail: pgError.detail,
          hint: pgError.hint,
        },
      });
    } finally {
      this.activeQueryPids.delete(context.queryId);
      client.release();
    }
  }

  protected async doCancelQuery(queryId: string): Promise<void> {
    const tracker = this.activeQueryPids.get(queryId);
    if (!tracker?.pid || !this.pool) {
      return;
    }

    try {
      // Use pg_cancel_backend to cancel the query
      const cancelClient = await this.pool.connect();
      try {
        await cancelClient.query('SELECT pg_cancel_backend($1)', [tracker.pid]);
      } finally {
        cancelClient.release();
      }
    } catch (error) {
      this.logger.warn('pg_cancel_backend failed', {
        queryId,
        pid: tracker.pid,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ── Metadata ──────────────────────────────────────────────────

  protected async doGetVersion(): Promise<string> {
    const result = await this.rawQuery('SELECT version() AS version');
    return (result.rows[0]?.version as string) ?? 'unknown';
  }

  // ── Pool Stats ────────────────────────────────────────────────

  override getPoolStats(): PoolStats | null {
    if (!this.pool) return null;

    return {
      totalConnections: this.pool.totalCount,
      activeConnections: this.pool.totalCount - this.pool.idleCount,
      idleConnections: this.pool.idleCount,
      waitingRequests: this.pool.waitingCount,
    };
  }

  // ── LISTEN/NOTIFY Support ─────────────────────────────────────

  /**
   * Subscribe to PostgreSQL LISTEN/NOTIFY on a channel.
   * Only available when connected.
   */
  async listen(channel: string, callback: (payload: string) => void): Promise<void> {
    this.ensureConnected();

    if (!this.listenClient) {
      this.listenClient = new Client({
        host: this.getHost(),
        port: this.getPort(5432),
        database: this.getDatabase(),
        user: this.getUsername(),
        password: this.getPassword(),
      });

      await this.listenClient.connect();

      this.listenClient.on('notification', (msg: pg.Notification) => {
        const listeners = this.notificationListeners.get(msg.channel);
        if (listeners) {
          const payload = msg.payload ?? '';
          for (const listener of listeners) {
            try {
              listener(payload);
            } catch (err) {
              this.logger.warn('Notification listener error', {
                channel: msg.channel,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }
      });

      this.listenClient.on('error', (err: Error) => {
        this.logger.error('Listen client error', { error: err.message });
      });
    }

    // Register the callback
    if (!this.notificationListeners.has(channel)) {
      this.notificationListeners.set(channel, []);
      await this.listenClient.query(`LISTEN ${this.quoteIdentifier(channel)}`);
    }
    this.notificationListeners.get(channel)!.push(callback);
  }

  /**
   * Unsubscribe from a PostgreSQL LISTEN/NOTIFY channel.
   */
  async unlisten(channel: string): Promise<void> {
    if (this.listenClient && this.notificationListeners.has(channel)) {
      await this.listenClient.query(`UNLISTEN ${this.quoteIdentifier(channel)}`);
      this.notificationListeners.delete(channel);
    }
  }

  /**
   * Send a NOTIFY on a channel with an optional payload.
   */
  async notify(channel: string, payload?: string): Promise<void> {
    this.ensureConnected();
    if (payload) {
      await this.rawQuery(`NOTIFY ${this.quoteIdentifier(channel)}, $1`, [payload]);
    } else {
      await this.rawQuery(`NOTIFY ${this.quoteIdentifier(channel)}`);
    }
  }

  // ── Private Helpers ───────────────────────────────────────────

  /**
   * Execute a raw query directly against the pool (bypasses timeout/row limit).
   * Used internally for introspection queries.
   */
  private async rawQuery(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> {
    if (!this.pool) {
      throw new ConnectorQueryError('Pool is not initialized', {
        connectorType: this.type,
      });
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return { rows: result.rows as Record<string, unknown>[] };
    } finally {
      client.release();
    }
  }

  /**
   * Quote a PostgreSQL identifier (table name, column name, channel name).
   */
  private quoteIdentifier(identifier: string): string {
    // Escape double quotes within the identifier and wrap in double quotes
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  /**
   * Map a PostgreSQL OID to a human-readable type name.
   * This is a simplified mapping for the most common types.
   */
  private pgTypeToString(oid: number): string {
    const pgTypes: Record<number, string> = {
      16: 'boolean',
      17: 'bytea',
      20: 'bigint',
      21: 'smallint',
      23: 'integer',
      25: 'text',
      26: 'oid',
      114: 'json',
      142: 'xml',
      600: 'point',
      700: 'real',
      701: 'double precision',
      790: 'money',
      829: 'macaddr',
      869: 'inet',
      1042: 'character',
      1043: 'character varying',
      1082: 'date',
      1083: 'time',
      1114: 'timestamp',
      1184: 'timestamptz',
      1186: 'interval',
      1231: 'numeric[]',
      1266: 'timetz',
      1560: 'bit',
      1562: 'varbit',
      1700: 'numeric',
      2278: 'void',
      2950: 'uuid',
      3802: 'jsonb',
      3904: 'int4range',
      3906: 'numrange',
      3908: 'tsrange',
      3910: 'tstzrange',
      3912: 'daterange',
      3926: 'int8range',
    };

    return pgTypes[oid] ?? `unknown(${oid})`;
  }
}
