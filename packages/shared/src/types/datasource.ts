/** Supported database connector types */
export type DatabaseType = 'postgresql' | 'mysql' | 'sqlite' | 'clickhouse' | 'bigquery' | 'snowflake' | 'duckdb';

/** Configuration for connecting to a data source */
export interface DataSourceConfig {
  id: string;
  name: string;
  type: DatabaseType;
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  options?: Record<string, unknown>;
}

/** Result of testing a data source connection */
export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs: number;
}

/** Information about a database schema */
export interface SchemaInfo {
  name: string;
  tables: TableInfo[];
}

/** Information about a database table */
export interface TableInfo {
  name: string;
  schema: string;
  /** Whether this entry is a base table or a view */
  type?: 'table' | 'view';
  columns: TableColumnInfo[];
  rowCount?: number;
}

/** Detailed column info for table metadata */
export interface TableColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue?: string;
  comment?: string;
}

/** DTO for creating a data source */
export interface CreateDataSourceDto {
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
}

/** DTO for updating a data source */
export interface UpdateDataSourceDto {
  name?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  options?: Record<string, unknown>;
}
