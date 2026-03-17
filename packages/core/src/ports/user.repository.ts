import type { User } from '../models/user.model.js';
import type { UserStatus } from '@meridian/shared';

/** Options for listing users */
export interface UserListOptions {
  organizationId: string;
  status?: UserStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Repository interface for User persistence.
 */
export interface UserRepository {
  /** Find a user by their unique ID */
  findById(id: string): Promise<User | null>;

  /** Find a user by email address */
  findByEmail(email: string): Promise<User | null>;

  /** Find all users belonging to an organization with optional filters */
  findByOrganization(options: UserListOptions): Promise<User[]>;

  /** Find users by role */
  findByRole(roleId: string): Promise<User[]>;

  /** Persist a user (create or update) */
  save(user: User): Promise<User>;

  /** Delete a user by ID */
  delete(id: string): Promise<void>;

  /** Check if a user with the given email exists */
  existsByEmail(email: string): Promise<boolean>;

  /** Count users in an organization */
  countByOrganization(orgId: string): Promise<number>;

  /** Count active users in an organization */
  countActiveByOrganization(orgId: string): Promise<number>;
}
