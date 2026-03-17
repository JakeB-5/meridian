// ── SQLite Connector ────────────────────────────────────────────────
// Full implementation using the 'better-sqlite3' driver.
// Features: file-based or :memory: database, synchronous execution wrapped
// in async, schema introspection via sqlite_master, pragma-based column info.

import Database from 'better-sqlite3';
import type { Database as BetterSqliteDb, Statement, Options as BetterSqliteOptions } from 'better-sqlite3';

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
  ConnectorConfigError,
} from '../errors.js';

// ── SQLite Connector ────────────────────────────────────────────────

export class SQLiteConnector extends BaseConnector {
  private db: BetterSqliteDb | null = null;

  constructor(options: BaseConnectorOptions) {
    super(options);
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  protected async doConnect(): Promise<void> {
    const dbPath = this.getDatabase();
    if (!dbPath) {
      throw new ConnectorConfigError(
        'Database path is required for SQLite connector',
        this.type,
      );
    }

    const driverOptions = this.getDriverOptions();
    const options: BetterSqliteOptions = {};

    if (driverOptions['readonly'] === true) {
      options.readonly = true;
    }

    if (typeof driverOptions['fileMustExist'] === 'boolean') {
      options.fileMustExist = driverOptions['fileMustExist'] as boolean;
    }

    if (typeof driverOptions['timeout'] === 'number') {
      options.timeout = driverOptions['timeout'] as number;
    }

    // Create database instance — better-sqlite3 is synchronous
    this.db = new Database(dbPath, options);

    // Enable WAL mode for better concurrent read performance
    if (driverOptions['walMode'] !== false && !options.readonly) {
      this.db.pragma('journal_mode = WAL');
    }

    // Enable foreign keys by default
    if (driverOptions['foreignKeys'] !== false) {
      this.db.pragma('foreign_keys = ON');
    }

    // Set busy timeout
    const busyTimeout = typeof driverOptions['busyTimeout'] === 'number'
      ? driverOptions['busyTimeout'] as number
      : 5000;
    this.db.pragma(`busy_timeout = ${busyTimeout}`);
  }

  protected async doDisconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  protected async doTestConnection(): Promise<void> {
    this.ensureDb();
    this.db!.prepare('SELECT 1 AS health_check').get();
  }

  // ── Schema Introspection ──────────────────────────────────────

  protected async doGetSchemas(): Promise<SchemaInfo[]> {
    this.ensureDb();

    // SQLite has a single implicit "main" schema plus any attached databases
    const attachedDbs = this.db!.pragma('database_list') as Array<{
      seq: number;
      name: string;
      file: string;
    }>;

    const schemas: SchemaInfo[] = [];

    for (const db of attachedDbs) {
      schemas.push({
        name: db.name,
        tables: [],
      });
    }

    return schemas;
  }

  protected async doGetTables(schema?: string): Promise<TableInfo[]> {
    this.ensureDb();

    const targetSchema = schema ?? 'main';

    // Query sqlite_master for tables and views
    const sql = `
      SELECT
        name,
        type
      FROM ${this.quoteIdentifier(targetSchema)}.sqlite_master
      WHERE type IN ('table', 'view')
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `;

    const rows = this.db!.prepare(sql).all() as Array<{ name: string; type: string }>;

    const tables: TableInfo[] = [];

    for (const row of rows) {
      let rowCount: number | undefined;

      // Get row count for tables (not views, as COUNT(*) on views can be expensive)
      if (row.type === 'table') {
        try {
          const countResult = this.db!.prepare(
            `SELECT COUNT(*) AS cnt FROM ${this.quoteIdentifier(targetSchema)}.${this.quoteIdentifier(row.name)}`,
          ).get() as { cnt: number } | undefined;
          rowCount = countResult?.cnt;
        } catch {
          // Ignore errors getting row count
        }
      }

      tables.push({
        name: row.name,
        schema: targetSchema,
        type: row.type as 'table' | 'view',
        columns: [],
        rowCount,
      });
    }

    return tables;
  }

  protected async doGetColumns(table: string, schema?: string): Promise<TableColumnInfo[]> {
    this.ensureDb();

    const targetSchema = schema ?? 'main';

    // Use PRAGMA table_info to get column metadata
    const columns = this.db!.pragma(
      `${targetSchema}.table_info(${this.quoteIdentifier(table)})`,
    ) as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;

    // Get foreign key information for additional context
    const foreignKeys = this.db!.pragma(
      `${targetSchema}.foreign_key_list(${this.quoteIdentifier(table)})`,
    ) as Array<{
      id: number;
      seq: number;
      table: string;
      from: string;
      to: string;
      on_update: string;
      on_delete: string;
      match: string;
    }>;

    const fkColumns = new Set(foreignKeys.map((fk) => fk.from));

    return columns.map((col) => ({
      name: col.name,
      type: col.type || 'TEXT', // SQLite allows empty type
      nullable: col.notnull === 0,
      primaryKey: col.pk > 0,
      defaultValue: col.dflt_value ?? undefined,
      comment: fkColumns.has(col.name)
        ? `FK → ${foreignKeys.find((fk) => fk.from === col.name)?.table}`
        : undefined,
    }));
  }

  // ── Query Execution ───────────────────────────────────────────

  protected async doExecuteQuery(
    sql: string,
    params: unknown[] | undefined,
    context: QueryExecutionContext,
  ): Promise<QueryResult> {
    this.ensureDb();

    // Check for abort before execution
    if (context.abortSignal?.aborted) {
      throw new ConnectorQueryCancelledError(context.queryId, {
        connectorType: this.type,
      });
    }

    try {
      const trimmedSql = sql.trim().toUpperCase();
      const isSelect = trimmedSql.startsWith('SELECT')
        || trimmedSql.startsWith('WITH')
        || trimmedSql.startsWith('PRAGMA')
        || trimmedSql.startsWith('EXPLAIN');

      if (isSelect) {
        return this.executeSelectQuery(sql, params, context);
      } else {
        return this.executeMutationQuery(sql, params, context);
      }
    } catch (error) {
      if (context.abortSignal?.aborted) {
        throw new ConnectorQueryCancelledError(context.queryId, {
          connectorType: this.type,
        });
      }

      const sqliteError = error as { code?: string; message?: string };
      throw new ConnectorQueryError(sqliteError.message ?? 'Unknown error', {
        connectorType: this.type,
        originalError: error instanceof Error ? error : new Error(String(error)),
        sql: sql.substring(0, 500),
        details: {
          sqliteCode: sqliteError.code,
        },
      });
    }
  }

  // ── Metadata ──────────────────────────────────────────────────

  protected async doGetVersion(): Promise<string> {
    this.ensureDb();
    const result = this.db!.prepare('SELECT sqlite_version() AS version').get() as
      | { version: string }
      | undefined;
    return result?.version ?? 'unknown';
  }

  // ── SQLite-Specific Public Methods ────────────────────────────

  /**
   * Get the raw better-sqlite3 Database instance for advanced operations.
   * Use with caution — bypasses all guards.
   */
  getRawDatabase(): BetterSqliteDb | null {
    return this.db;
  }

  /**
   * Execute a PRAGMA and return its result.
   */
  async pragma(pragma: string): Promise<unknown> {
    this.ensureConnected();
    this.ensureDb();
    return this.db!.pragma(pragma);
  }

  /**
   * Attach another SQLite database file.
   */
  async attachDatabase(filePath: string, alias: string): Promise<void> {
    this.ensureConnected();
    this.ensureDb();
    this.db!.prepare(`ATTACH DATABASE ? AS ${this.quoteIdentifier(alias)}`).run(filePath);
  }

  /**
   * Detach an attached database.
   */
  async detachDatabase(alias: string): Promise<void> {
    this.ensureConnected();
    this.ensureDb();
    this.db!.prepare(`DETACH DATABASE ${this.quoteIdentifier(alias)}`).run();
  }

  /**
   * Run VACUUM to reclaim unused space.
   */
  async vacuum(): Promise<void> {
    this.ensureConnected();
    this.ensureDb();
    this.db!.exec('VACUUM');
  }

  /**
   * Run an integrity check.
   */
  async integrityCheck(): Promise<string[]> {
    this.ensureConnected();
    this.ensureDb();
    const results = this.db!.pragma('integrity_check') as Array<{ integrity_check: string }>;
    return results.map((r) => r.integrity_check);
  }

  /**
   * Get database file size in bytes (0 for :memory:).
   */
  async getDatabaseSize(): Promise<number> {
    this.ensureConnected();
    this.ensureDb();
    const result = this.db!.pragma('page_count') as Array<{ page_count: number }>;
    const pageSizeResult = this.db!.pragma('page_size') as Array<{ page_size: number }>;

    const pageCount = result[0]?.page_count ?? 0;
    const pageSize = pageSizeResult[0]?.page_size ?? 4096;

    return pageCount * pageSize;
  }

  /**
   * Execute multiple statements in a transaction.
   */
  async executeInTransaction<T>(fn: (db: BetterSqliteDb) => T): Promise<T> {
    this.ensureConnected();
    this.ensureDb();

    const transaction = this.db!.transaction(fn);
    return transaction(this.db!);
  }

  /**
   * Create a user-defined function in the database.
   */
  registerFunction(
    name: string,
    fn: (...args: unknown[]) => unknown,
    options?: { deterministic?: boolean; varargs?: boolean },
  ): void {
    this.ensureConnected();
    this.ensureDb();

    this.db!.function(name, {
      deterministic: options?.deterministic ?? false,
      varargs: options?.varargs ?? false,
    }, fn);
  }

  /**
   * Create a user-defined aggregate function.
   */
  registerAggregate(
    name: string,
    options: {
      start: unknown;
      step: (accumulator: unknown, ...args: unknown[]) => unknown;
      result?: (accumulator: unknown) => unknown;
    },
  ): void {
    this.ensureConnected();
    this.ensureDb();

    this.db!.aggregate(name, {
      start: options.start,
      step: options.step,
      result: options.result,
    });
  }

  /**
   * Load a SQLite extension.
   */
  loadExtension(path: string, entryPoint?: string): void {
    this.ensureConnected();
    this.ensureDb();

    this.db!.loadExtension(path);
  }

  /**
   * Get table indexes.
   */
  async getIndexes(table: string, schema?: string): Promise<Array<{
    name: string;
    unique: boolean;
    columns: string[];
  }>> {
    this.ensureConnected();
    this.ensureDb();

    const targetSchema = schema ?? 'main';

    const indexes = this.db!.pragma(
      `${targetSchema}.index_list(${this.quoteIdentifier(table)})`,
    ) as Array<{
      seq: number;
      name: string;
      unique: number;
      origin: string;
      partial: number;
    }>;

    const result: Array<{ name: string; unique: boolean; columns: string[] }> = [];

    for (const idx of indexes) {
      const indexInfo = this.db!.pragma(
        `${targetSchema}.index_info(${this.quoteIdentifier(idx.name)})`,
      ) as Array<{
        seqno: number;
        cid: number;
        name: string;
      }>;

      result.push({
        name: idx.name,
        unique: idx.unique === 1,
        columns: indexInfo.map((col) => col.name),
      });
    }

    return result;
  }

  /**
   * Get foreign keys for a table.
   */
  async getForeignKeys(table: string, schema?: string): Promise<Array<{
    from: string;
    table: string;
    to: string;
    onUpdate: string;
    onDelete: string;
  }>> {
    this.ensureConnected();
    this.ensureDb();

    const targetSchema = schema ?? 'main';

    const fks = this.db!.pragma(
      `${targetSchema}.foreign_key_list(${this.quoteIdentifier(table)})`,
    ) as Array<{
      id: number;
      seq: number;
      table: string;
      from: string;
      to: string;
      on_update: string;
      on_delete: string;
      match: string;
    }>;

    return fks.map((fk) => ({
      from: fk.from,
      table: fk.table,
      to: fk.to,
      onUpdate: fk.on_update,
      onDelete: fk.on_delete,
    }));
  }

  // ── Private Helpers ───────────────────────────────────────────

  private ensureDb(): void {
    if (!this.db) {
      throw new ConnectorQueryError('Database is not initialized', {
        connectorType: this.type,
      });
    }
  }

  private executeSelectQuery(
    sql: string,
    params: unknown[] | undefined,
    context: QueryExecutionContext,
  ): QueryResult {
    const stmt = this.db!.prepare(sql);
    const rows = (params && params.length > 0 ? stmt.all(...params) : stmt.all()) as Record<string, unknown>[];

    // Extract column info from the first row or statement metadata
    const columns: ColumnInfo[] = stmt.columns().map((col) => ({
      name: col.name,
      type: col.type ?? 'unknown',
      nullable: true, // SQLite doesn't enforce column types strictly
    }));

    const truncated = rows.length > context.maxRows;

    return {
      columns,
      rows: truncated ? rows.slice(0, context.maxRows) : rows,
      rowCount: truncated ? context.maxRows : rows.length,
      executionTimeMs: 0,
      truncated,
    };
  }

  private executeMutationQuery(
    sql: string,
    params: unknown[] | undefined,
    _context: QueryExecutionContext,
  ): QueryResult {
    const stmt = this.db!.prepare(sql);
    const info = params && params.length > 0 ? stmt.run(...params) : stmt.run();

    return {
      columns: [],
      rows: [],
      rowCount: info.changes,
      executionTimeMs: 0,
      truncated: false,
    };
  }

  private quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}
