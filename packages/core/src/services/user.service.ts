import type { User, Role } from '../models/user.model.js';
import type { UserListOptions } from '../ports/user.repository.js';
import type { Result, Permission } from '@meridian/shared';

/** DTO for creating a user */
export interface CreateUserDto {
  email: string;
  name: string;
  organizationId: string;
  roleId: string;
  avatarUrl?: string;
}

/** DTO for updating a user */
export interface UpdateUserDto {
  name?: string;
  avatarUrl?: string;
}

/**
 * Service interface for User operations.
 */
export interface UserService {
  /** Create a new user */
  create(dto: CreateUserDto): Promise<Result<User>>;

  /** Get a user by ID */
  getById(id: string): Promise<Result<User>>;

  /** Get a user by email */
  getByEmail(email: string): Promise<Result<User>>;

  /** List users with filtering and pagination */
  list(options: UserListOptions): Promise<Result<User[]>>;

  /** Update user profile */
  update(id: string, dto: UpdateUserDto): Promise<Result<User>>;

  /** Delete a user */
  delete(id: string): Promise<Result<void>>;

  /** Activate a user account */
  activate(id: string): Promise<Result<User>>;

  /** Deactivate a user account */
  deactivate(id: string): Promise<Result<User>>;

  /** Assign a role to a user */
  assignRole(userId: string, roleId: string): Promise<Result<User>>;

  /** Check if a user has a specific permission */
  hasPermission(userId: string, permission: Permission): Promise<Result<boolean>>;

  /** Record a user login event */
  recordLogin(userId: string): Promise<Result<User>>;
}
