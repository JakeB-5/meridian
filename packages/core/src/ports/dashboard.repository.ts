import type { Dashboard } from '../models/dashboard.model.js';

/** Options for listing dashboards */
export interface DashboardListOptions {
  organizationId: string;
  createdBy?: string;
  isPublic?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Repository interface for Dashboard persistence.
 */
export interface DashboardRepository {
  /** Find a dashboard by its unique ID */
  findById(id: string): Promise<Dashboard | null>;

  /** Find all dashboards belonging to an organization with optional filters */
  findByOrganization(options: DashboardListOptions): Promise<Dashboard[]>;

  /** Find dashboards created by a specific user */
  findByCreator(userId: string): Promise<Dashboard[]>;

  /** Find public dashboards in an organization */
  findPublic(orgId: string): Promise<Dashboard[]>;

  /** Persist a dashboard (create or update) */
  save(dashboard: Dashboard): Promise<Dashboard>;

  /** Delete a dashboard by ID */
  delete(id: string): Promise<void>;

  /** Check if a dashboard with the given name exists in the organization */
  existsByName(orgId: string, name: string): Promise<boolean>;

  /** Count dashboards in an organization */
  countByOrganization(orgId: string): Promise<number>;
}
