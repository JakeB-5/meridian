import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionChecker } from './permission-checker.js';
import { BUILT_IN_ROLE_IDS } from './default-roles.js';
import type { TokenPayload } from '../jwt/token-service.js';
import type { Permission } from '@meridian/shared';

function makeUser(overrides: Partial<TokenPayload> = {}): TokenPayload {
  return {
    sub: 'user-1',
    email: 'user@example.com',
    orgId: 'org-1',
    roleId: BUILT_IN_ROLE_IDS.VIEWER,
    permissions: ['dashboard:read', 'question:read'],
    ...overrides,
  };
}

function makeAdmin(): TokenPayload {
  return makeUser({
    roleId: BUILT_IN_ROLE_IDS.ADMIN,
    permissions: ['admin', 'dashboard:read', 'dashboard:write', 'dashboard:delete',
      'question:read', 'question:write', 'question:delete',
      'datasource:read', 'datasource:write', 'datasource:delete',
      'user:read', 'user:write', 'user:delete',
      'role:read', 'role:write', 'role:delete',
      'organization:read', 'organization:write',
      'plugin:read', 'plugin:write'],
  });
}

function makeEditor(): TokenPayload {
  return makeUser({
    roleId: BUILT_IN_ROLE_IDS.EDITOR,
    permissions: [
      'datasource:read', 'datasource:write',
      'question:read', 'question:write',
      'dashboard:read', 'dashboard:write',
    ],
  });
}

describe('PermissionChecker', () => {
  let checker: PermissionChecker;

  beforeEach(() => {
    checker = new PermissionChecker();
  });

  // ---- hasPermission ----

  describe('hasPermission', () => {
    it('returns true when user has the exact permission', () => {
      const user = makeUser({ permissions: ['dashboard:read'] });
      expect(checker.hasPermission(user, 'dashboard:read')).toBe(true);
    });

    it('returns false when user lacks the permission', () => {
      const user = makeUser({ permissions: ['dashboard:read'] });
      expect(checker.hasPermission(user, 'dashboard:write')).toBe(false);
    });

    it('returns true for any permission when user has admin', () => {
      const user = makeUser({ permissions: ['admin'] });
      expect(checker.hasPermission(user, 'user:delete')).toBe(true);
      expect(checker.hasPermission(user, 'role:write')).toBe(true);
    });

    it('returns true for any permission when user has admin roleId', () => {
      const admin = makeAdmin();
      expect(checker.hasPermission(admin, 'datasource:delete')).toBe(true);
    });

    it('returns false when permissions array is empty', () => {
      const user = makeUser({ permissions: [] });
      expect(checker.hasPermission(user, 'dashboard:read')).toBe(false);
    });
  });

  // ---- hasAnyPermission ----

  describe('hasAnyPermission', () => {
    it('returns true when user has at least one of the permissions', () => {
      const user = makeUser({ permissions: ['dashboard:read'] });
      expect(
        checker.hasAnyPermission(user, ['dashboard:read', 'dashboard:write']),
      ).toBe(true);
    });

    it('returns false when user has none of the permissions', () => {
      const user = makeUser({ permissions: ['question:read'] });
      expect(
        checker.hasAnyPermission(user, ['dashboard:write', 'dashboard:delete']),
      ).toBe(false);
    });

    it('returns true when permissions list is empty (vacuous)', () => {
      const user = makeUser({ permissions: [] });
      expect(checker.hasAnyPermission(user, [])).toBe(true);
    });

    it('returns true for admin regardless of list', () => {
      const admin = makeAdmin();
      expect(checker.hasAnyPermission(admin, ['user:delete'])).toBe(true);
    });
  });

  // ---- hasAllPermissions ----

  describe('hasAllPermissions', () => {
    it('returns true when user has all specified permissions', () => {
      const user = makeEditor();
      expect(
        checker.hasAllPermissions(user, ['dashboard:read', 'dashboard:write']),
      ).toBe(true);
    });

    it('returns false when user is missing at least one permission', () => {
      const user = makeEditor();
      expect(
        checker.hasAllPermissions(user, ['dashboard:read', 'dashboard:delete']),
      ).toBe(false);
    });

    it('returns true when list is empty (vacuous)', () => {
      const user = makeUser({ permissions: [] });
      expect(checker.hasAllPermissions(user, [])).toBe(true);
    });

    it('returns true for admin regardless of list', () => {
      const admin = makeAdmin();
      expect(
        checker.hasAllPermissions(admin, ['user:delete', 'role:delete']),
      ).toBe(true);
    });
  });

  // ---- isAdmin ----

  describe('isAdmin', () => {
    it('returns true when user has admin permission', () => {
      const user = makeUser({ permissions: ['admin'] });
      expect(checker.isAdmin(user)).toBe(true);
    });

    it('returns true when user has admin roleId', () => {
      const user = makeUser({
        roleId: BUILT_IN_ROLE_IDS.ADMIN,
        permissions: [],
      });
      expect(checker.isAdmin(user)).toBe(true);
    });

    it('returns false for a viewer user', () => {
      expect(checker.isAdmin(makeUser())).toBe(false);
    });

    it('returns false for an editor', () => {
      expect(checker.isAdmin(makeEditor())).toBe(false);
    });
  });

  // ---- canAccessOrganization ----

  describe('canAccessOrganization', () => {
    it('returns true when user belongs to the org', () => {
      const user = makeUser({ orgId: 'org-1' });
      expect(checker.canAccessOrganization(user, 'org-1')).toBe(true);
    });

    it('returns false when user belongs to a different org', () => {
      const user = makeUser({ orgId: 'org-1' });
      expect(checker.canAccessOrganization(user, 'org-2')).toBe(false);
    });

    it('returns true for admin regardless of orgId', () => {
      const admin = makeAdmin();
      expect(checker.canAccessOrganization(admin, 'org-999')).toBe(true);
    });
  });

  // ---- canRead / canWrite / canDelete ----

  describe('canRead', () => {
    it('returns true when user has <resource>:read', () => {
      const user = makeUser({ permissions: ['dashboard:read'] });
      expect(checker.canRead(user, 'dashboard')).toBe(true);
    });

    it('returns false when user lacks <resource>:read', () => {
      const user = makeUser({ permissions: [] });
      expect(checker.canRead(user, 'dashboard')).toBe(false);
    });
  });

  describe('canWrite', () => {
    it('returns true when user has <resource>:write', () => {
      const user = makeEditor();
      expect(checker.canWrite(user, 'dashboard')).toBe(true);
    });

    it('returns false for a viewer', () => {
      expect(checker.canWrite(makeUser(), 'dashboard')).toBe(false);
    });
  });

  describe('canDelete', () => {
    it('returns false for an editor (no delete permission)', () => {
      expect(checker.canDelete(makeEditor(), 'dashboard')).toBe(false);
    });

    it('returns true for admin', () => {
      expect(checker.canDelete(makeAdmin(), 'dashboard')).toBe(true);
    });
  });

  // ---- combined scenarios ----

  describe('combined scenarios', () => {
    it('viewer can read but not write or delete', () => {
      const viewer = makeUser();
      expect(checker.canRead(viewer, 'dashboard')).toBe(true);
      expect(checker.canWrite(viewer, 'dashboard')).toBe(false);
      expect(checker.canDelete(viewer, 'dashboard')).toBe(false);
    });

    it('editor can read and write but not delete', () => {
      const editor = makeEditor();
      expect(checker.canRead(editor, 'dashboard')).toBe(true);
      expect(checker.canWrite(editor, 'dashboard')).toBe(true);
      expect(checker.canDelete(editor, 'dashboard')).toBe(false);
    });

    it('admin can do everything', () => {
      const admin = makeAdmin();
      const allPerms: Permission[] = [
        'datasource:read', 'datasource:write', 'datasource:delete',
        'question:read', 'question:write', 'question:delete',
        'dashboard:read', 'dashboard:write', 'dashboard:delete',
        'user:read', 'user:write', 'user:delete',
        'role:read', 'role:write', 'role:delete',
        'organization:read', 'organization:write',
        'plugin:read', 'plugin:write',
      ];
      for (const perm of allPerms) {
        expect(checker.hasPermission(admin, perm)).toBe(true);
      }
    });

    it('user with only admin permission has all permissions', () => {
      const user = makeUser({ permissions: ['admin'] });
      expect(checker.hasPermission(user, 'datasource:delete')).toBe(true);
      expect(checker.hasPermission(user, 'role:delete')).toBe(true);
    });
  });
});
