import type { Metric } from '../models/metric.model.js';
import type { MetricType } from '@meridian/shared';

/** Options for listing metrics */
export interface MetricListOptions {
  organizationId: string;
  dataSourceId?: string;
  type?: MetricType;
  tags?: string[];
  isVerified?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Repository interface for Metric persistence.
 */
export interface MetricRepository {
  /** Find a metric by its unique ID */
  findById(id: string): Promise<Metric | null>;

  /** Find metrics by organization with optional filters */
  findByOrganization(options: MetricListOptions): Promise<Metric[]>;

  /** Find metrics for a specific data source and table */
  findByTable(dataSourceId: string, table: string): Promise<Metric[]>;

  /** Find metrics that depend on a specific metric */
  findDependents(metricId: string): Promise<Metric[]>;

  /** Persist a metric (create or update) */
  save(metric: Metric): Promise<Metric>;

  /** Delete a metric by ID */
  delete(id: string): Promise<void>;

  /** Check if a metric with the given name exists in the organization */
  existsByName(orgId: string, name: string): Promise<boolean>;

  /** Count metrics in an organization */
  countByOrganization(orgId: string): Promise<number>;
}
