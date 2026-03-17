import type { Permission } from '@meridian/shared';
import type { TokenPayload } from '../jwt/token-service.js';
import { BUILT_IN_ROLE_IDS } from './default-roles.js';

/**
 * Stateless RBAC engine.
 *
 * Permissions are encoded directly inside the JWT payload, so no
 * database round-trip is needed during request handling.
 */
export class PermissionChecker {
  /**
   * Check that the user holds a specific permission.
   *
   * Users with the 'admin' permission implicitly hold every permission.
   */
  hasPermission(user: TokenPayload, permission: Permission): boolean {
    if (this.isAdmin(user)) return true;
    return user.permissions.includes(permission);
  }

  /**
   * Check that the user holds at least one of the given permissions.
   */
  hasAnyPermission(user: TokenPayload, permissions: Permission[]): boolean {
    if (permissions.length === 0) return true;
    if (this.isAdmin(user)) return true;
    return permissions.some((p) => user.permissions.includes(p));
  }

  /**
   * Check that the user holds ALL of the given permissions.
   */
  hasAllPermissions(user: TokenPayload, permissions: Permission[]): boolean {
    if (permissions.length === 0) return true;
    if (this.isAdmin(user)) return true;
    return permissions.every((p) => user.permissions.includes(p));
  }

  /**
   * Return true if the user has the top-level 'admin' permission
   * or their roleId matches the built-in admin role.
   */
  isAdmin(user: TokenPayload): boolean {
    return (
      user.permissions.includes('admin') ||
      user.roleId === BUILT_IN_ROLE_IDS.ADMIN
    );
  }

  /**
   * Return true if the user belongs to the given organization.
   * Admins can access any organization.
   */
  canAccessOrganization(user: TokenPayload, orgId: string): boolean {
    if (this.isAdmin(user)) return true;
    return user.orgId === orgId;
  }

  /**
   * Return true if the user can read the given resource type.
   * Convenience wrapper used by middleware.
   */
  canRead(user: TokenPayload, resource: ResourceType): boolean {
    return this.hasPermission(user, `${resource}:read` as Permission);
  }

  /**
   * Return true if the user can write (create or update) the given resource type.
   */
  canWrite(user: TokenPayload, resource: ResourceType): boolean {
    return this.hasPermission(user, `${resource}:write` as Permission);
  }

  /**
   * Return true if the user can delete the given resource type.
   */
  canDelete(user: TokenPayload, resource: ResourceType): boolean {
    return this.hasPermission(user, `${resource}:delete` as Permission);
  }

  /**
   * Assert the user has a permission; throw PermissionDeniedError otherwise.
   * Designed for use in service-layer guards where throwing is preferred.
   */
  assertPermission(user: TokenPayload, permission: Permission): void {
    if (!this.hasPermission(user, permission)) {
      // Import lazily to avoid a circular-dependency risk in tests
      const { PermissionDeniedError } = require('../errors/auth-errors.js') as {
        PermissionDeniedError: new (p: string) => Error;
      };
      throw new PermissionDeniedError(permission);
    }
  }

  /**
   * Assert the user can access an organization; throw otherwise.
   */
  assertOrganizationAccess(user: TokenPayload, orgId: string): void {
    if (!this.canAccessOrganization(user, orgId)) {
      const { OrganizationAccessDeniedError } = require('../errors/auth-errors.js') as {
        OrganizationAccessDeniedError: new (id: string) => Error;
      };
      throw new OrganizationAccessDeniedError(orgId);
    }
  }
}

/** Resource types that map to permission prefixes */
export type ResourceType =
  | 'datasource'
  | 'question'
  | 'dashboard'
  | 'user'
  | 'role'
  | 'organization'
  | 'plugin';
