import type { DataSource } from '../models/datasource.model.js';
import type {
  Result,
  ConnectionTestResult,
  SchemaInfo,
  TableInfo,
  CreateDataSourceDto,
  UpdateDataSourceDto,
} from '@meridian/shared';

/**
 * Service interface for DataSource operations.
 * Orchestrates domain logic and infrastructure interactions.
 */
export interface DataSourceService {
  /** Create a new data source */
  create(dto: CreateDataSourceDto): Promise<Result<DataSource>>;

  /** Get a data source by ID */
  getById(id: string): Promise<Result<DataSource>>;

  /** List all data sources for an organization */
  listByOrganization(orgId: string): Promise<Result<DataSource[]>>;

  /** Test the connection to a data source */
  testConnection(id: string): Promise<Result<ConnectionTestResult>>;

  /** Get the database schema for a data source */
  getSchema(id: string): Promise<Result<SchemaInfo[]>>;

  /** Get tables for a data source */
  getTables(id: string): Promise<Result<TableInfo[]>>;

  /** Update a data source configuration */
  update(id: string, dto: UpdateDataSourceDto): Promise<Result<DataSource>>;

  /** Delete a data source */
  delete(id: string): Promise<Result<void>>;
}
