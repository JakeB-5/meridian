# Group C2: @meridian/connectors — Database Connectors

## Task
Implement database connectors for multiple database types. Each connector must implement a common interface for connection management, schema introspection, and query execution.

## Files to Create

### src/types.ts
```typescript
export interface Connector {
  type: DatabaseType;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  testConnection(): Promise<ConnectionTestResult>;
  getSchemas(): Promise<SchemaInfo[]>;
  getTables(schema?: string): Promise<TableInfo[]>;
  getColumns(table: string, schema?: string): Promise<ColumnInfo[]>;
  executeQuery(sql: string, params?: unknown[]): Promise<QueryResult>;
  cancelQuery(queryId: string): Promise<void>;
  getVersion(): Promise<string>;
}

export interface SchemaInfo { name: string; tableCount: number; }
export interface TableInfo { name: string; schema: string; type: 'table' | 'view'; rowCount?: number; }

export interface ConnectorConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean | object;
  maxConnections?: number;
  connectionTimeout?: number;
}
```

### src/base-connector.ts
Abstract base class with common logic:
- Connection lifecycle management
- Query timeout enforcement
- Result row limit (MAX_QUERY_ROWS from shared/constants)
- Error normalization to MeridianError subclasses
- Logging

### src/connectors/postgresql.connector.ts
PostgreSQL connector using 'pg':
- Connection pooling via pg.Pool
- Schema introspection via information_schema
- Query cancellation via pg_cancel_backend
- SSL support
- LISTEN/NOTIFY support for real-time

### src/connectors/mysql.connector.ts
MySQL connector using 'mysql2':
- Connection pooling
- Schema introspection
- Query cancellation

### src/connectors/sqlite.connector.ts
SQLite connector using 'better-sqlite3':
- File-based or :memory: database
- Synchronous execution wrapped in async
- Schema introspection via sqlite_master

### src/connectors/clickhouse.connector.ts
ClickHouse connector using '@clickhouse/client':
- HTTP interface
- Schema introspection
- Large result streaming

### src/connectors/duckdb.connector.ts
DuckDB connector using 'duckdb':
- In-process analytical queries
- Parquet/CSV file reading
- Schema introspection

### src/connectors/bigquery.connector.ts (stub)
Google BigQuery connector (stub with interface, not fully implemented):
- Uses @google-cloud/bigquery
- Basic structure ready for implementation

### src/connectors/snowflake.connector.ts (stub)
Snowflake connector (stub):
- Uses snowflake-sdk
- Basic structure ready

### src/connector-factory.ts
```typescript
export function createConnector(config: DataSourceConfig): Connector;
// Factory that returns the right connector based on config.type
```

### src/connection-pool.ts
Connection pool management:
- Pool per datasource
- Max connections per pool
- Idle timeout
- Health check interval

### src/index.ts — re-exports

## Tests
- src/connectors/postgresql.connector.test.ts (mock pg)
- src/connectors/mysql.connector.test.ts (mock mysql2)
- src/connectors/sqlite.connector.test.ts (real :memory: database)
- src/connectors/duckdb.connector.test.ts (real in-memory)
- src/connector-factory.test.ts
- src/base-connector.test.ts (timeout, row limits)

## Dependencies
- @meridian/core, @meridian/shared
- pg, mysql2, better-sqlite3, duckdb, @clickhouse/client

## Estimated LOC: ~10000 + ~2500 tests
