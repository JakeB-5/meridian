import type { Organization } from '../models/organization.model.js';

/**
 * Repository interface for Organization persistence.
 */
export interface OrganizationRepository {
  /** Find an organization by its unique ID */
  findById(id: string): Promise<Organization | null>;

  /** Find an organization by slug */
  findBySlug(slug: string): Promise<Organization | null>;

  /** Find all organizations (admin use) */
  findAll(options?: { limit?: number; offset?: number }): Promise<Organization[]>;

  /** Find organizations a user belongs to */
  findByMember(userId: string): Promise<Organization[]>;

  /** Persist an organization (create or update) */
  save(organization: Organization): Promise<Organization>;

  /** Delete an organization by ID */
  delete(id: string): Promise<void>;

  /** Check if an organization with the given slug exists */
  existsBySlug(slug: string): Promise<boolean>;

  /** Count total organizations */
  count(): Promise<number>;
}
