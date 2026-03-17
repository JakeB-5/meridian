import type {
  Permission,
  RoleData,
  UserStatus,
  Result,
} from '@meridian/shared';
import {
  ok,
  err,
  generateId,
  ValidationError,
  isEmail,
  MAX_NAME_LENGTH,
} from '@meridian/shared';

/**
 * Role value object.
 * Encapsulates a named set of permissions within an organization.
 */
export class Role {
  public readonly id: string;
  public readonly name: string;
  public readonly permissions: ReadonlyArray<Permission>;
  public readonly organizationId: string;
  public readonly isSystemRole: boolean;

  constructor(params: {
    id: string;
    name: string;
    permissions: Permission[];
    organizationId: string;
    isSystemRole?: boolean;
  }) {
    this.id = params.id;
    this.name = params.name;
    this.permissions = [...params.permissions];
    this.organizationId = params.organizationId;
    this.isSystemRole = params.isSystemRole ?? false;
  }

  /** Check if this role has a specific permission */
  hasPermission(permission: Permission): boolean {
    if (this.permissions.includes('admin')) return true;
    return this.permissions.includes(permission);
  }

  /** Check if this role has all specified permissions */
  hasAllPermissions(permissions: Permission[]): boolean {
    return permissions.every(p => this.hasPermission(p));
  }

  /** Check if this role has any of the specified permissions */
  hasAnyPermission(permissions: Permission[]): boolean {
    return permissions.some(p => this.hasPermission(p));
  }

  /** Convert to plain data */
  toData(): RoleData {
    return {
      id: this.id,
      name: this.name,
      permissions: [...this.permissions],
      organizationId: this.organizationId,
    };
  }

  /** Create a default admin role */
  static createAdmin(organizationId: string): Role {
    return new Role({
      id: generateId(),
      name: 'Admin',
      permissions: ['admin'],
      organizationId,
      isSystemRole: true,
    });
  }

  /** Create a default viewer role */
  static createViewer(organizationId: string): Role {
    return new Role({
      id: generateId(),
      name: 'Viewer',
      permissions: [
        'datasource:read',
        'question:read',
        'dashboard:read',
        'user:read',
        'organization:read',
      ],
      organizationId,
      isSystemRole: true,
    });
  }

  /** Create a default editor role */
  static createEditor(organizationId: string): Role {
    return new Role({
      id: generateId(),
      name: 'Editor',
      permissions: [
        'datasource:read',
        'question:read', 'question:write',
        'dashboard:read', 'dashboard:write',
        'user:read',
        'organization:read',
      ],
      organizationId,
      isSystemRole: true,
    });
  }
}

/** Predefined system roles */
export const SYSTEM_ROLES = ['Admin', 'Editor', 'Viewer'] as const;
export type SystemRoleName = typeof SYSTEM_ROLES[number];

/**
 * User domain entity.
 *
 * Represents an authenticated user within an organization.
 * Contains identity, role assignment, and status management.
 */
export class User {
  public readonly id: string;
  public readonly email: string;
  public readonly name: string;
  public readonly avatarUrl: string | undefined;
  public readonly organizationId: string;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private _role: Role;
  private _status: UserStatus;
  private _lastLoginAt: Date | undefined;
  private _deactivatedAt: Date | undefined;

  private constructor(params: {
    id: string;
    email: string;
    name: string;
    avatarUrl?: string;
    organizationId: string;
    role: Role;
    status: UserStatus;
    lastLoginAt?: Date;
    deactivatedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = params.id;
    this.email = params.email;
    this.name = params.name;
    this.avatarUrl = params.avatarUrl;
    this.organizationId = params.organizationId;
    this._role = params.role;
    this._status = params.status;
    this._lastLoginAt = params.lastLoginAt;
    this._deactivatedAt = params.deactivatedAt;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  get role(): Role {
    return this._role;
  }

  get status(): UserStatus {
    return this._status;
  }

  get lastLoginAt(): Date | undefined {
    return this._lastLoginAt;
  }

  get deactivatedAt(): Date | undefined {
    return this._deactivatedAt;
  }

  get isActive(): boolean {
    return this._status === 'active';
  }

  get isAdmin(): boolean {
    if (this._status !== 'active') return false;
    return this._role.hasPermission('admin');
  }

  /**
   * Factory: create a new user.
   * Users start in 'pending' status.
   */
  static create(params: {
    email: string;
    name: string;
    organizationId: string;
    role: Role;
    avatarUrl?: string;
  }): Result<User> {
    // Validate email
    if (!params.email || params.email.trim().length === 0) {
      return err(new ValidationError('Email is required'));
    }
    if (!isEmail(params.email.trim())) {
      return err(new ValidationError('Invalid email format'));
    }

    // Validate name
    if (!params.name || params.name.trim().length === 0) {
      return err(new ValidationError('User name is required'));
    }
    if (params.name.length > MAX_NAME_LENGTH) {
      return err(new ValidationError(`Name must be ${MAX_NAME_LENGTH} characters or less`));
    }

    // Validate organization
    if (!params.organizationId || params.organizationId.trim().length === 0) {
      return err(new ValidationError('Organization ID is required'));
    }

    // Validate role belongs to same org
    if (params.role.organizationId !== params.organizationId) {
      return err(new ValidationError('Role does not belong to the same organization'));
    }

    const now = new Date();
    return ok(new User({
      id: generateId(),
      email: params.email.toLowerCase().trim(),
      name: params.name.trim(),
      avatarUrl: params.avatarUrl,
      organizationId: params.organizationId,
      role: params.role,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }));
  }

  /**
   * Reconstitute from persistence.
   */
  static fromPersistence(params: {
    id: string;
    email: string;
    name: string;
    avatarUrl?: string;
    organizationId: string;
    role: Role;
    status: UserStatus;
    lastLoginAt?: Date;
    deactivatedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
  }): User {
    return new User(params);
  }

  /**
   * Activate the user account.
   * Only pending or inactive users can be activated.
   */
  activate(): Result<User> {
    if (this._status === 'active') {
      return err(new ValidationError('User is already active'));
    }

    return ok(new User({
      id: this.id,
      email: this.email,
      name: this.name,
      avatarUrl: this.avatarUrl,
      organizationId: this.organizationId,
      role: this._role,
      status: 'active',
      lastLoginAt: this._lastLoginAt,
      deactivatedAt: undefined,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    }));
  }

  /**
   * Deactivate the user account.
   * Only active users can be deactivated.
   */
  deactivate(): Result<User> {
    if (this._status === 'inactive') {
      return err(new ValidationError('User is already inactive'));
    }
    if (this._status === 'pending') {
      return err(new ValidationError('Cannot deactivate a pending user'));
    }

    return ok(new User({
      id: this.id,
      email: this.email,
      name: this.name,
      avatarUrl: this.avatarUrl,
      organizationId: this.organizationId,
      role: this._role,
      status: 'inactive',
      lastLoginAt: this._lastLoginAt,
      deactivatedAt: new Date(),
      createdAt: this.createdAt,
      updatedAt: new Date(),
    }));
  }

  /**
   * Assign a new role to the user.
   * Role must belong to the same organization.
   */
  assignRole(role: Role): Result<User> {
    if (role.organizationId !== this.organizationId) {
      return err(new ValidationError('Role does not belong to the same organization'));
    }

    return ok(new User({
      id: this.id,
      email: this.email,
      name: this.name,
      avatarUrl: this.avatarUrl,
      organizationId: this.organizationId,
      role,
      status: this._status,
      lastLoginAt: this._lastLoginAt,
      deactivatedAt: this._deactivatedAt,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    }));
  }

  /**
   * Check if the user has a specific permission.
   */
  hasPermission(permission: Permission): boolean {
    if (this._status !== 'active') return false;
    return this._role.hasPermission(permission);
  }

  /**
   * Record a login event.
   */
  recordLogin(): User {
    return new User({
      id: this.id,
      email: this.email,
      name: this.name,
      avatarUrl: this.avatarUrl,
      organizationId: this.organizationId,
      role: this._role,
      status: this._status,
      lastLoginAt: new Date(),
      deactivatedAt: this._deactivatedAt,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  /**
   * Update user profile information.
   */
  updateProfile(params: { name?: string; avatarUrl?: string }): Result<User> {
    const newName = params.name ?? this.name;
    if (newName.trim().length === 0) {
      return err(new ValidationError('Name cannot be empty'));
    }
    if (newName.length > MAX_NAME_LENGTH) {
      return err(new ValidationError(`Name must be ${MAX_NAME_LENGTH} characters or less`));
    }

    return ok(new User({
      id: this.id,
      email: this.email,
      name: newName.trim(),
      avatarUrl: params.avatarUrl !== undefined ? params.avatarUrl : this.avatarUrl,
      organizationId: this.organizationId,
      role: this._role,
      status: this._status,
      lastLoginAt: this._lastLoginAt,
      deactivatedAt: this._deactivatedAt,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    }));
  }
}
