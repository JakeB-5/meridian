// ── DuckDB Connector ────────────────────────────────────────────────
// Full implementation using the 'duckdb' Node.js driver.
// Features: in-process analytical queries, Parquet/CSV file reading,
// schema introspection via information_schema.

import duckdb from 'duckdb';

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

// ── DuckDB Connector ────────────────────────────────────────────────

export class DuckDBConnector extends BaseConnector {
  private db: duckdb.Database | null = null;
  private connection: duckdb.Connection | null = null;

  constructor(options: BaseConnectorOptions) {
    super(options);
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  protected async doConnect(): Promise<void> {
    const dbPath = this.getDatabase();
    const driverOptions = this.getDriverOptions();

    // DuckDB supports :memory: and file-based databases
    const resolvedPath = dbPath === ':memory:' || !dbPath ? ':memory:' : dbPath;

    return new Promise<void>((resolve, reject) => {
      const accessMode = driverOptions['readonly'] === true
        ? duckdb.OPEN_READONLY
        : duckdb.OPEN_READWRITE | duckdb.OPEN_CREATE;

      this.db = new duckdb.Database(
        resolvedPath,
        accessMode,
        (err: Error | null) => {
          if (err) {
            reject(new ConnectorConfigError(
              `Failed to open DuckDB database: ${err.message}`,
              this.type,
            ));
            return;
          }

          // Create a persistent connection from the database
          this.connection = this.db!.connect();

          // Configure settings
          this.applySettings(driverOptions)
            .then(() => resolve())
            .catch(reject);
        },
      );
    });
  }

  protected async doDisconnect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.connection) {
        this.connection = null;
      }

      if (this.db) {
        this.db.close((err: Error | null) => {
          this.db = null;
          if (err) {
            reject(new ConnectorQueryError(
              `Failed to close DuckDB: ${err.message}`,
              { connectorType: this.type, originalError: err },
            ));
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  protected async doTestConnection(): Promise<void> {
    await this.rawQuery('SELECT 1 AS health_check');
  }

  // ── Schema Introspection ──────────────────────────────────────

  protected async doGetSchemas(): Promise<SchemaInfo[]> {
    const sql = `
      SELECT
        schema_name AS name,
        COUNT(table_name) AS "tableCount"
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      GROUP BY schema_name
      ORDER BY schema_name
    `;

    const rows = await this.rawQuery(sql);

    // If no schemas found, return default 'main'
    if (rows.length === 0) {
      return [{ name: 'main', tables: [] }];
    }

    return rows.map((row) => ({
      name: row['name'] as string,
      tables: [],
    }));
  }

  protected async doGetTables(schema?: string): Promise<TableInfo[]> {
    const targetSchema = schema ?? 'main';

    const sql = `
      SELECT
        table_name AS name,
        table_schema AS "schema",
        CASE table_type
          WHEN 'BASE TABLE' THEN 'table'
          WHEN 'VIEW' THEN 'view'
          WHEN 'LOCAL TEMPORARY' THEN 'table'
          ELSE 'table'
        END AS type
      FROM information_schema.tables
      WHERE table_schema = $1
      ORDER BY table_name
    `;

    const rows = await this.rawQuery(sql, [targetSchema]);

    const tables: TableInfo[] = [];

    for (const row of rows) {
      const tableName = row['name'] as string;
      let rowCount: number | undefined;

      // Try to get row count (may fail for views or virtual tables)
      try {
        const countResult = await this.rawQuery(
          `SELECT COUNT(*) AS cnt FROM ${this.quoteIdentifier(targetSchema)}.${this.quoteIdentifier(tableName)}`,
        );
        rowCount = Number(countResult[0]?.cnt ?? 0);
      } catch {
        // Ignore
      }

      tables.push({
        name: tableName,
        schema: row['schema'] as string,
        type: row['type'] as 'table' | 'view',
        columns: [],
        rowCount,
      });
    }

    return tables;
  }

  protected async doGetColumns(table: string, schema?: string): Promise<TableColumnInfo[]> {
    const targetSchema = schema ?? 'main';

    const sql = `
      SELECT
        column_name AS name,
        data_type AS type,
        CASE is_nullable WHEN 'YES' THEN true ELSE false END AS nullable,
        column_default AS "defaultValue",
        ordinal_position
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
      ORDER BY ordinal_position
    `;

    const rows = await this.rawQuery(sql, [targetSchema, table]);

    // Get primary key columns
    const pkColumns = await this.getPrimaryKeyColumns(table, targetSchema);

    return rows.map((row) => ({
      name: row['name'] as string,
      type: row['type'] as string,
      nullable: Boolean(row['nullable']),
      primaryKey: pkColumns.has(row['name'] as string),
      defaultValue: row['defaultValue'] != null ? String(row['defaultValue']) : undefined,
    }));
  }

  // ── Query Execution ───────────────────────────────────────────

  protected async doExecuteQuery(
    sql: string,
    params: unknown[] | undefined,
    context: QueryExecutionContext,
  ): Promise<QueryResult> {
    if (!this.connection) {
      throw new ConnectorQueryError('Connection is not initialized', {
        connectorType: this.type,
      });
    }

    if (context.abortSignal?.aborted) {
      throw new ConnectorQueryCancelledError(context.queryId, {
        connectorType: this.type,
      });
    }

    try {
      const rows = await this.rawQuery(sql, params);

      // Infer column types from the result
      const columns: ColumnInfo[] = rows.length > 0
        ? Object.keys(rows[0]!).map((key) => ({
            name: key,
            type: this.inferDuckDBType(rows[0]![key]),
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
    } catch (error) {
      if (context.abortSignal?.aborted) {
        throw new ConnectorQueryCancelledError(context.queryId, {
          connectorType: this.type,
        });
      }

      const duckError = error as { message?: string; code?: string };
      throw new ConnectorQueryError(duckError.message ?? 'Unknown error', {
        connectorType: this.type,
        originalError: error instanceof Error ? error : new Error(String(error)),
        sql: sql.substring(0, 500),
        details: {
          duckdbCode: duckError.code,
        },
      });
    }
  }

  // ── Metadata ──────────────────────────────────────────────────

  protected async doGetVersion(): Promise<string> {
    const rows = await this.rawQuery('SELECT version() AS version');
    return (rows[0]?.version as string) ?? 'unknown';
  }

  // ── DuckDB-Specific Public Methods ────────────────────────────

  /**
   * Read a Parquet file and register it as a view.
   */
  async readParquet(filePath: string, viewName: string): Promise<void> {
    this.ensureConnected();
    await this.rawQuery(
      `CREATE OR REPLACE VIEW ${this.quoteIdentifier(viewName)} AS SELECT * FROM read_parquet('${this.escapeString(filePath)}')`,
    );
  }

  /**
   * Read a CSV file and register it as a view.
   */
  async readCSV(
    filePath: string,
    viewName: string,
    options?: {
      delimiter?: string;
      header?: boolean;
      columns?: Record<string, string>;
    },
  ): Promise<void> {
    this.ensureConnected();

    const readOptions: string[] = [];
    if (options?.delimiter) readOptions.push(`delim='${options.delimiter}'`);
    if (options?.header !== undefined) readOptions.push(`header=${options.header}`);
    if (options?.columns) {
      const colDefs = Object.entries(options.columns)
        .map(([name, type]) => `'${name}': '${type}'`)
        .join(', ');
      readOptions.push(`columns={${colDefs}}`);
    }

    const optionsStr = readOptions.length > 0 ? `, ${readOptions.join(', ')}` : '';
    await this.rawQuery(
      `CREATE OR REPLACE VIEW ${this.quoteIdentifier(viewName)} AS SELECT * FROM read_csv_auto('${this.escapeString(filePath)}'${optionsStr})`,
    );
  }

  /**
   * Read a JSON file and register it as a view.
   */
  async readJSON(filePath: string, viewName: string): Promise<void> {
    this.ensureConnected();
    await this.rawQuery(
      `CREATE OR REPLACE VIEW ${this.quoteIdentifier(viewName)} AS SELECT * FROM read_json_auto('${this.escapeString(filePath)}')`,
    );
  }

  /**
   * Export query results to a Parquet file.
   */
  async exportToParquet(sql: string, outputPath: string): Promise<void> {
    this.ensureConnected();
    await this.rawQuery(
      `COPY (${sql}) TO '${this.escapeString(outputPath)}' (FORMAT PARQUET)`,
    );
  }

  /**
   * Export query results to a CSV file.
   */
  async exportToCSV(sql: string, outputPath: string, options?: { delimiter?: string; header?: boolean }): Promise<void> {
    this.ensureConnected();
    const csvOptions: string[] = ['FORMAT CSV'];
    if (options?.delimiter) csvOptions.push(`DELIMITER '${options.delimiter}'`);
    if (options?.header !== undefined) csvOptions.push(`HEADER ${options.header}`);

    await this.rawQuery(
      `COPY (${sql}) TO '${this.escapeString(outputPath)}' (${csvOptions.join(', ')})`,
    );
  }

  /**
   * Install and load a DuckDB extension.
   */
  async installExtension(extensionName: string): Promise<void> {
    this.ensureConnected();
    await this.rawQuery(`INSTALL ${extensionName}`);
    await this.rawQuery(`LOAD ${extensionName}`);
  }

  /**
   * Get list of installed extensions.
   */
  async getExtensions(): Promise<Array<{ name: string; loaded: boolean; installed: boolean }>> {
    this.ensureConnected();
    const rows = await this.rawQuery(`
      SELECT
        extension_name AS name,
        loaded,
        installed
      FROM duckdb_extensions()
    `);

    return rows.map((row) => ({
      name: row['name'] as string,
      loaded: Boolean(row['loaded']),
      installed: Boolean(row['installed']),
    }));
  }

  /**
   * Get DuckDB settings.
   */
  async getSettings(): Promise<Record<string, unknown>[]> {
    this.ensureConnected();
    return this.rawQuery('SELECT * FROM duckdb_settings()');
  }

  /**
   * Set a DuckDB configuration option.
   */
  async setSetting(name: string, value: string | number | boolean): Promise<void> {
    this.ensureConnected();
    await this.rawQuery(`SET ${name} = '${value}'`);
  }

  /**
   * Create a table from a Parquet file.
   */
  async createTableFromParquet(filePath: string, tableName: string, schema?: string): Promise<void> {
    this.ensureConnected();
    const targetSchema = schema ?? 'main';
    await this.rawQuery(
      `CREATE OR REPLACE TABLE ${this.quoteIdentifier(targetSchema)}.${this.quoteIdentifier(tableName)} AS SELECT * FROM read_parquet('${this.escapeString(filePath)}')`,
    );
  }

  /**
   * Describe a query's result columns without executing it.
   */
  async describeQuery(sql: string): Promise<ColumnInfo[]> {
    this.ensureConnected();
    const rows = await this.rawQuery(`DESCRIBE ${sql}`);

    return rows.map((row) => ({
      name: row['column_name'] as string,
      type: row['column_type'] as string,
      nullable: row['null'] === 'YES',
    }));
  }

  // ── Private Helpers ───────────────────────────────────────────

  private rawQuery(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
    return new Promise<Record<string, unknown>[]>((resolve, reject) => {
      if (!this.connection) {
        reject(new ConnectorQueryError('Connection is not initialized', {
          connectorType: this.type,
        }));
        return;
      }

      const callback = (err: duckdb.DuckDbError | null, result: duckdb.TableData) => {
        if (err) {
          reject(err);
        } else {
          resolve((result ?? []) as Record<string, unknown>[]);
        }
      };

      if (params && params.length > 0) {
        this.connection.all(sql, ...params, callback);
      } else {
        this.connection.all(sql, callback);
      }
    });
  }

  private async applySettings(driverOptions: Record<string, unknown>): Promise<void> {
    // Apply any DuckDB-specific settings
    const settings = driverOptions['settings'] as Record<string, string | number | boolean> | undefined;
    if (settings) {
      for (const [key, value] of Object.entries(settings)) {
        await this.rawQuery(`SET ${key} = '${value}'`);
      }
    }

    // Set default memory limit if specified
    if (typeof driverOptions['memoryLimit'] === 'string') {
      await this.rawQuery(`SET memory_limit = '${driverOptions['memoryLimit']}'`);
    }

    // Set default thread count if specified
    if (typeof driverOptions['threads'] === 'number') {
      await this.rawQuery(`SET threads = ${driverOptions['threads']}`);
    }
  }

  private async getPrimaryKeyColumns(table: string, schema: string): Promise<Set<string>> {
    try {
      const rows = await this.rawQuery(`
        SELECT column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_schema = $1
          AND tc.table_name = $2
          AND tc.constraint_type = 'PRIMARY KEY'
      `, [schema, table]);

      return new Set(rows.map((row) => row['column_name'] as string));
    } catch {
      return new Set();
    }
  }

  private quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  private escapeString(value: string): string {
    return value.replace(/'/g, "''");
  }

  private inferDuckDBType(value: unknown): string {
    if (value === null || value === undefined) return 'VARCHAR';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'BIGINT' : 'DOUBLE';
    }
    if (typeof value === 'boolean') return 'BOOLEAN';
    if (typeof value === 'string') return 'VARCHAR';
    if (value instanceof Date) return 'TIMESTAMP';
    if (Array.isArray(value)) return 'LIST';
    if (typeof value === 'bigint') return 'HUGEINT';
    if (typeof value === 'object') return 'STRUCT';
    return 'VARCHAR';
  }
}
