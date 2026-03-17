import type { DataSource, DataSourceStatus } from '../models/datasource.model.js';

/**
 * Repository interface for DataSource persistence.
 * Part of the hexagonal architecture — this is a port that adapters implement.
 */
export interface DataSourceRepository {
  /** Find a data source by its unique ID */
  findById(id: string): Promise<DataSource | null>;

  /** Find all data sources belonging to an organization */
  findByOrganization(orgId: string): Promise<DataSource[]>;

  /** Find data sources by type within an organization */
  findByType(orgId: string, type: string): Promise<DataSource[]>;

  /** Find data sources by status */
  findByStatus(orgId: string, status: DataSourceStatus): Promise<DataSource[]>;

  /** Persist a data source (create or update) */
  save(dataSource: DataSource): Promise<DataSource>;

  /** Delete a data source by ID */
  delete(id: string): Promise<void>;

  /** Check if a data source with the given name exists in the organization */
  existsByName(orgId: string, name: string): Promise<boolean>;

  /** Count data sources in an organization */
  countByOrganization(orgId: string): Promise<number>;
}
