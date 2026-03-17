import { describe, it, expect } from 'vitest';
import { User, Role, SYSTEM_ROLES } from './user.model.js';
import { isOk, isErr } from '@meridian/shared';

describe('Role', () => {
  const orgId = 'org-123';

  describe('createAdmin()', () => {
    it('should create an admin role with admin permission', () => {
      const role = Role.createAdmin(orgId);
      expect(role.name).toBe('Admin');
      expect(role.permissions).toContain('admin');
      expect(role.isSystemRole).toBe(true);
      expect(role.organizationId).toBe(orgId);
    });
  });

  describe('createViewer()', () => {
    it('should create a viewer role with read-only permissions', () => {
      const role = Role.createViewer(orgId);
      expect(role.name).toBe('Viewer');
      expect(role.permissions).toContain('datasource:read');
      expect(role.permissions).toContain('question:read');
      expect(role.permissions).toContain('dashboard:read');
      expect(role.permissions).not.toContain('datasource:write');
      expect(role.permissions).not.toContain('admin');
    });
  });

  describe('createEditor()', () => {
    it('should create an editor role with read/write permissions', () => {
      const role = Role.createEditor(orgId);
      expect(role.name).toBe('Editor');
      expect(role.permissions).toContain('question:write');
      expect(role.permissions).toContain('dashboard:write');
      expect(role.permissions).not.toContain('admin');
    });
  });

  describe('hasPermission()', () => {
    it('should return true for a permission the role has', () => {
      const role = Role.createViewer(orgId);
      expect(role.hasPermission('datasource:read')).toBe(true);
    });

    it('should return false for a permission the role lacks', () => {
      const role = Role.createViewer(orgId);
      expect(role.hasPermission('datasource:write')).toBe(false);
    });

    it('should return true for any permission when role has admin', () => {
      const role = Role.createAdmin(orgId);
      expect(role.hasPermission('datasource:write')).toBe(true);
      expect(role.hasPermission('user:delete')).toBe(true);
    });
  });

  describe('hasAllPermissions()', () => {
    it('should return true when all permissions present', () => {
      const role = Role.createViewer(orgId);
      expect(role.hasAllPermissions(['datasource:read', 'question:read'])).toBe(true);
    });

    it('should return false when any permission missing', () => {
      const role = Role.createViewer(orgId);
      expect(role.hasAllPermissions(['datasource:read', 'datasource:write'])).toBe(false);
    });
  });

  describe('hasAnyPermission()', () => {
    it('should return true when at least one permission present', () => {
      const role = Role.createViewer(orgId);
      expect(role.hasAnyPermission(['datasource:write', 'datasource:read'])).toBe(true);
    });

    it('should return false when no permissions present', () => {
      const role = Role.createViewer(orgId);
      expect(role.hasAnyPermission(['datasource:write', 'user:delete'])).toBe(false);
    });
  });

  describe('toData()', () => {
    it('should return a plain RoleData object', () => {
      const role = Role.createAdmin(orgId);
      const data = role.toData();
      expect(data.id).toBe(role.id);
      expect(data.name).toBe('Admin');
      expect(data.permissions).toContain('admin');
      expect(data.organizationId).toBe(orgId);
    });
  });
});

describe('User', () => {
  const orgId = 'org-123';
  const adminRole = Role.createAdmin(orgId);
  const viewerRole = Role.createViewer(orgId);

  const validParams = {
    email: 'user@example.com',
    name: 'Test User',
    organizationId: orgId,
    role: viewerRole,
  };

  describe('create()', () => {
    it('should create a user in pending status', () => {
      const result = User.create(validParams);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      const user = result.value;
      expect(user.email).toBe('user@example.com');
      expect(user.name).toBe('Test User');
      expect(user.organizationId).toBe(orgId);
      expect(user.status).toBe('pending');
      expect(user.isActive).toBe(false);
      expect(user.role.name).toBe('Viewer');
      expect(user.id).toBeDefined();
    });

    it('should lowercase and trim email', () => {
      const result = User.create({
        ...validParams,
        email: '  User@Example.COM  ',
      });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.email).toBe('user@example.com');
    });

    it('should trim name', () => {
      const result = User.create({
        ...validParams,
        name: '  Trimmed Name  ',
      });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.name).toBe('Trimmed Name');
    });

    it('should reject empty email', () => {
      const result = User.create({ ...validParams, email: '' });
      expect(isErr(result)).toBe(true);
    });

    it('should reject invalid email format', () => {
      const result = User.create({ ...validParams, email: 'not-an-email' });
      expect(isErr(result)).toBe(true);
    });

    it('should reject empty name', () => {
      const result = User.create({ ...validParams, name: '' });
      expect(isErr(result)).toBe(true);
    });

    it('should reject empty organizationId', () => {
      const result = User.create({ ...validParams, organizationId: '' });
      expect(isErr(result)).toBe(true);
    });

    it('should reject role from different organization', () => {
      const otherRole = Role.createViewer('other-org');
      const result = User.create({ ...validParams, role: otherRole });
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.message).toContain('same organization');
    });
  });

  describe('activate()', () => {
    it('should activate a pending user', () => {
      const createResult = User.create(validParams);
      if (!isOk(createResult)) return;

      const result = createResult.value.activate();
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.status).toBe('active');
      expect(result.value.isActive).toBe(true);
    });

    it('should reject activating an already active user', () => {
      const createResult = User.create(validParams);
      if (!isOk(createResult)) return;

      const activateResult = createResult.value.activate();
      if (!isOk(activateResult)) return;

      const result = activateResult.value.activate();
      expect(isErr(result)).toBe(true);
    });
  });

  describe('deactivate()', () => {
    it('should deactivate an active user', () => {
      const createResult = User.create(validParams);
      if (!isOk(createResult)) return;

      const activateResult = createResult.value.activate();
      if (!isOk(activateResult)) return;

      const result = activateResult.value.deactivate();
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.status).toBe('inactive');
      expect(result.value.isActive).toBe(false);
      expect(result.value.deactivatedAt).toBeInstanceOf(Date);
    });

    it('should reject deactivating an already inactive user', () => {
      const createResult = User.create(validParams);
      if (!isOk(createResult)) return;
      const activateResult = createResult.value.activate();
      if (!isOk(activateResult)) return;
      const deactivateResult = activateResult.value.deactivate();
      if (!isOk(deactivateResult)) return;

      const result = deactivateResult.value.deactivate();
      expect(isErr(result)).toBe(true);
    });

    it('should reject deactivating a pending user', () => {
      const createResult = User.create(validParams);
      if (!isOk(createResult)) return;

      const result = createResult.value.deactivate();
      expect(isErr(result)).toBe(true);
    });
  });

  describe('assignRole()', () => {
    it('should assign a new role from the same organization', () => {
      const createResult = User.create(validParams);
      if (!isOk(createResult)) return;

      const result = createResult.value.assignRole(adminRole);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.role.name).toBe('Admin');
      expect(result.value.isAdmin).toBe(false); // still pending, not active
    });

    it('should reject role from different organization', () => {
      const createResult = User.create(validParams);
      if (!isOk(createResult)) return;

      const otherRole = Role.createAdmin('other-org');
      const result = createResult.value.assignRole(otherRole);
      expect(isErr(result)).toBe(true);
    });
  });

  describe('hasPermission()', () => {
    it('should return true for active user with matching permission', () => {
      const createResult = User.create({ ...validParams, role: adminRole });
      if (!isOk(createResult)) return;
      const activateResult = createResult.value.activate();
      if (!isOk(activateResult)) return;

      expect(activateResult.value.hasPermission('datasource:write')).toBe(true);
    });

    it('should return false for inactive user even with permission', () => {
      const createResult = User.create({ ...validParams, role: adminRole });
      if (!isOk(createResult)) return;

      expect(createResult.value.hasPermission('datasource:write')).toBe(false);
    });
  });

  describe('recordLogin()', () => {
    it('should update lastLoginAt', () => {
      const createResult = User.create(validParams);
      if (!isOk(createResult)) return;

      const user = createResult.value.recordLogin();
      expect(user.lastLoginAt).toBeInstanceOf(Date);
    });
  });

  describe('updateProfile()', () => {
    it('should update name and avatarUrl', () => {
      const createResult = User.create(validParams);
      if (!isOk(createResult)) return;

      const result = createResult.value.updateProfile({
        name: 'New Name',
        avatarUrl: 'https://example.com/avatar.png',
      });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.name).toBe('New Name');
      expect(result.value.avatarUrl).toBe('https://example.com/avatar.png');
    });

    it('should reject empty name', () => {
      const createResult = User.create(validParams);
      if (!isOk(createResult)) return;

      const result = createResult.value.updateProfile({ name: '' });
      expect(isErr(result)).toBe(true);
    });
  });

  describe('fromPersistence()', () => {
    it('should reconstitute a user from stored data', () => {
      const now = new Date();
      const user = User.fromPersistence({
        id: 'user-123',
        email: 'test@test.com',
        name: 'Test',
        organizationId: orgId,
        role: adminRole,
        status: 'active',
        lastLoginAt: now,
        createdAt: now,
        updatedAt: now,
      });
      expect(user.id).toBe('user-123');
      expect(user.isActive).toBe(true);
      expect(user.isAdmin).toBe(true);
    });
  });
});

describe('SYSTEM_ROLES', () => {
  it('should contain Admin, Editor, Viewer', () => {
    expect(SYSTEM_ROLES).toContain('Admin');
    expect(SYSTEM_ROLES).toContain('Editor');
    expect(SYSTEM_ROLES).toContain('Viewer');
  });
});
