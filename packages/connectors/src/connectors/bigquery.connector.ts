// ── BigQuery Connector (Stub) ───────────────────────────────────────
// Stub implementation for Google BigQuery.
// Provides the proper interface and throws ConnectorNotImplementedError
// for all operations. Ready for full implementation with @google-cloud/bigquery.

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

// ── BigQuery Configuration Interface ────────────────────────────────

/**
 * BigQuery-specific configuration that extends the base DataSourceConfig options.
 * When implementing, pass these via DataSourceConfig.options.
 */
export interface BigQueryConfig {
  /** Google Cloud project ID */
  projectId: string;
  /** Path to service account key file (JSON) */
  keyFilename?: string;
  /** Service account credentials as JSON object */
  credentials?: {
    client_email: string;
    private_key: string;
    project_id?: string;
  };
  /** Default dataset (schema) to use */
  defaultDataset?: string;
  /** Location for query execution (e.g., 'US', 'EU') */
  location?: string;
  /** Maximum bytes billed per query (cost control) */
  maximumBytesBilled?: string;
  /** Whether to use legacy SQL syntax */
  useLegacySql?: boolean;
  /** Query timeout in milliseconds */
  timeoutMs?: number;
  /** Maximum number of rows to return */
  maxResults?: number;
}

// ── BigQuery Connector ──────────────────────────────────────────────

export class BigQueryConnector extends BaseConnector {
  private readonly bigqueryConfig: BigQueryConfig;

  constructor(options: BaseConnectorOptions) {
    super(options);

    const configOptions = this.config.options ?? {};
    this.bigqueryConfig = {
      projectId: (configOptions['projectId'] as string) ?? '',
      keyFilename: configOptions['keyFilename'] as string | undefined,
      credentials: configOptions['credentials'] as BigQueryConfig['credentials'] | undefined,
      defaultDataset: configOptions['defaultDataset'] as string | undefined,
      location: (configOptions['location'] as string) ?? 'US',
      maximumBytesBilled: configOptions['maximumBytesBilled'] as string | undefined,
      useLegacySql: (configOptions['useLegacySql'] as boolean) ?? false,
      timeoutMs: configOptions['timeoutMs'] as number | undefined,
      maxResults: configOptions['maxResults'] as number | undefined,
    };
  }

  /**
   * Get the parsed BigQuery configuration.
   */
  getBigQueryConfig(): BigQueryConfig {
    return { ...this.bigqueryConfig };
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
// To implement fully, install @google-cloud/bigquery and:
//
// 1. doConnect():
//    - const { BigQuery } = require('@google-cloud/bigquery');
//    - this.client = new BigQuery({
//        projectId: this.bigqueryConfig.projectId,
//        keyFilename: this.bigqueryConfig.keyFilename,
//        credentials: this.bigqueryConfig.credentials,
//      });
//    - Validate by listing datasets
//
// 2. doGetSchemas():
//    - Use client.getDatasets() to list datasets
//    - Each dataset = one schema
//
// 3. doGetTables():
//    - Use dataset.getTables() to list tables within a dataset
//
// 4. doGetColumns():
//    - Use table.getMetadata() to get schema/field definitions
//    - Map BigQuery RECORD/STRUCT types recursively
//
// 5. doExecuteQuery():
//    - Use client.createQueryJob() for long-running queries
//    - Support for query parameters via @param syntax
//    - Handle pagination with getQueryResults()
//
// 6. doCancelQuery():
//    - Use job.cancel() on the BigQuery Job object
//
// 7. Cost considerations:
//    - Always set maximumBytesBilled to prevent runaway costs
//    - Use dry run (dryRun: true) to estimate query cost before execution
//    - Implement query cost estimation as a public method
