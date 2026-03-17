import { describe, it, expect, beforeEach } from 'vitest';
import { RoleRepository } from '../role.repository.js';
import {
  createMockDb,
  createSampleRole,
  resetIdCounter,
  type MockDb,
} from './test-helpers.js';

describe('RoleRepository', () => {
  let mockDb: MockDb;
  let repo: RoleRepository;

  beforeEach(() => {
    resetIdCounter();
    mockDb = createMockDb();
    repo = new RoleRepository(mockDb.db);
  });

  // ── findById ────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return role when found', async () => {
      const role = createSampleRole();
      mockDb.setSelectResult([role]);

      const result = await repo.findById(role.id);

      expect(result).toEqual(role);
    });

    it('should return null when not found', async () => {
      mockDb.setSelectResult([]);

      const result = await repo.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  // ── findByName ──────────────────────────────────────────────────

  describe('findByName', () => {
    it('should return role when name matches within organization', async () => {
      const role = createSampleRole({ name: 'Admin' });
      mockDb.setSelectResult([role]);

      const result = await repo.findByName('org-id', 'Admin');

      expect(result).toEqual(role);
    });

    it('should return null when name not found', async () => {
      mockDb.setSelectResult([]);

      const result = await repo.findByName('org-id', 'Unknown');

      expect(result).toBeNull();
    });
  });

  // ── create ──────────────────────────────────────────────────────

  describe('create', () => {
    it('should create and return a new role', async () => {
      const newRole = createSampleRole();
      mockDb.setInsertResult([newRole]);

      const result = await repo.create({
        name: 'Analyst',
        permissions: ['dashboard:read', 'question:read'],
        organizationId: 'org-id',
      });

      expect(result).toEqual(newRole);
    });
  });

  // ── update ──────────────────────────────────────────────────────

  describe('update', () => {
    it('should update a custom role name and permissions', async () => {
      const existing = createSampleRole({ isSystem: false });
      const updated = { ...existing, name: 'Updated', permissions: ['admin'] };

      mockDb.setSelectResult([existing]);
      mockDb.setUpdateResult([updated]);

      const result = await repo.update(existing.id, {
        name: 'Updated',
        permissions: ['admin'],
      });

      expect(result?.name).toBe('Updated');
      expect(result?.permissions).toEqual(['admin']);
    });

    it('should only update permissions for system roles', async () => {
      const systemRole = createSampleRole({ isSystem: true, name: 'Admin' });
      const updated = { ...systemRole, permissions: ['admin', 'user:write'] };

      mockDb.setSelectResult([systemRole]);
      mockDb.setUpdateResult([updated]);

      const result = await repo.update(systemRole.id, {
        name: 'Renamed Admin', // Should be ignored for system roles
        permissions: ['admin', 'user:write'],
      });

      expect(result?.permissions).toEqual(['admin', 'user:write']);
    });

    it('should return null when role not found', async () => {
      mockDb.setSelectResult([]);

      const result = await repo.update('non-existent', { name: 'Test' });

      expect(result).toBeNull();
    });
  });

  // ── delete ──────────────────────────────────────────────────────

  describe('delete', () => {
    it('should delete a custom role', async () => {
      const customRole = createSampleRole({ isSystem: false });
      mockDb.setSelectResult([customRole]);
      mockDb.setDeleteResult([{ id: customRole.id }]);

      const result = await repo.delete(customRole.id);

      expect(result).toBe(true);
    });

    it('should refuse to delete a system role', async () => {
      const systemRole = createSampleRole({ isSystem: true });
      mockDb.setSelectResult([systemRole]);

      const result = await repo.delete(systemRole.id);

      expect(result).toBe(false);
    });

    it('should return false when role not found', async () => {
      mockDb.setSelectResult([]);

      const result = await repo.delete('non-existent');

      expect(result).toBe(false);
    });
  });

  // ── findSystemRoles ─────────────────────────────────────────────

  describe('findSystemRoles', () => {
    it('should return system roles for organization', async () => {
      const systemRoles = [
        createSampleRole({ name: 'Admin', isSystem: true }),
        createSampleRole({ name: 'Viewer', isSystem: true }),
      ];
      mockDb.setSelectResult(systemRoles);

      const result = await repo.findSystemRoles('org-id');

      expect(result).toEqual(systemRoles);
      expect(result).toHaveLength(2);
    });
  });

  // ── findCustomRoles ─────────────────────────────────────────────

  describe('findCustomRoles', () => {
    it('should return custom roles for organization', async () => {
      const customRoles = [
        createSampleRole({ name: 'Data Analyst', isSystem: false }),
      ];
      mockDb.setSelectResult(customRoles);

      const result = await repo.findCustomRoles('org-id');

      expect(result).toEqual(customRoles);
    });
  });

  // ── updatePermissions ───────────────────────────────────────────

  describe('updatePermissions', () => {
    it('should replace all permissions', async () => {
      const role = createSampleRole();
      const updated = { ...role, permissions: ['admin'] };

      mockDb.setSelectResult([role]);
      mockDb.setUpdateResult([updated]);

      const result = await repo.updatePermissions(role.id, ['admin']);

      expect(result?.permissions).toEqual(['admin']);
    });
  });

  // ── addPermissions ──────────────────────────────────────────────

  describe('addPermissions', () => {
    it('should merge new permissions with existing', async () => {
      const role = createSampleRole({ permissions: ['dashboard:read'] });
      const updated = {
        ...role,
        permissions: ['dashboard:read', 'question:read'],
      };

      mockDb.setSelectResult([role]);
      mockDb.setUpdateResult([updated]);

      const result = await repo.addPermissions(role.id, ['question:read']);

      expect(result?.permissions).toEqual(['dashboard:read', 'question:read']);
    });

    it('should return null when role not found', async () => {
      mockDb.setSelectResult([]);

      const result = await repo.addPermissions('non-existent', ['admin']);

      expect(result).toBeNull();
    });
  });

  // ── removePermissions ───────────────────────────────────────────

  describe('removePermissions', () => {
    it('should remove specified permissions', async () => {
      const role = createSampleRole({
        permissions: ['dashboard:read', 'question:read', 'user:read'],
      });
      const updated = { ...role, permissions: ['dashboard:read'] };

      mockDb.setSelectResult([role]);
      mockDb.setUpdateResult([updated]);

      const result = await repo.removePermissions(role.id, [
        'question:read',
        'user:read',
      ]);

      expect(result?.permissions).toEqual(['dashboard:read']);
    });
  });

  // ── hasPermission ───────────────────────────────────────────────

  describe('hasPermission', () => {
    it('should return true when role has the permission', async () => {
      const role = createSampleRole({
        permissions: ['dashboard:read', 'question:read'],
      });
      mockDb.setSelectResult([role]);

      const result = await repo.hasPermission(role.id, 'dashboard:read');

      expect(result).toBe(true);
    });

    it('should return true when role has admin permission', async () => {
      const role = createSampleRole({ permissions: ['admin'] });
      mockDb.setSelectResult([role]);

      const result = await repo.hasPermission(role.id, 'dashboard:delete');

      expect(result).toBe(true);
    });

    it('should return false when role lacks the permission', async () => {
      const role = createSampleRole({ permissions: ['dashboard:read'] });
      mockDb.setSelectResult([role]);

      const result = await repo.hasPermission(role.id, 'dashboard:write');

      expect(result).toBe(false);
    });

    it('should return false when role not found', async () => {
      mockDb.setSelectResult([]);

      const result = await repo.hasPermission('non-existent', 'admin');

      expect(result).toBe(false);
    });
  });

  // ── nameExists ──────────────────────────────────────────────────

  describe('nameExists', () => {
    it('should return true when name is taken', async () => {
      mockDb.setSelectResult([{ id: 'role-id' }]);

      const result = await repo.nameExists('org-id', 'Admin');

      expect(result).toBe(true);
    });

    it('should return false when name is available', async () => {
      mockDb.setSelectResult([]);

      const result = await repo.nameExists('org-id', 'New Role');

      expect(result).toBe(false);
    });
  });

  // ── countByOrganization ─────────────────────────────────────────

  describe('countByOrganization', () => {
    it('should return role count for organization', async () => {
      mockDb.setSelectResult([{ count: 5 }]);

      const result = await repo.countByOrganization('org-id');

      expect(result).toBe(5);
    });
  });

  // ── findAll (paginated) ─────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const rolesData = [createSampleRole()];

      let callCount = 0;
      mockDb.mocks.select.mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [{ count: 1 }] : rolesData;
        return createChainableResult(result);
      });

      const result = await repo.findAll(
        { organizationId: 'org-id' },
        { page: 1, limit: 10 },
      );

      expect(result.data).toEqual(rolesData);
      expect(result.total).toBe(1);
    });
  });

  // ── save (upsert) ──────────────────────────────────────────────

  describe('save', () => {
    it('should create when no id provided', async () => {
      const newRole = createSampleRole();
      mockDb.setInsertResult([newRole]);

      const result = await repo.save({
        name: 'New Role',
        permissions: ['dashboard:read'],
        organizationId: 'org-id',
      });

      expect(result).toEqual(newRole);
    });
  });

  // ── count ───────────────────────────────────────────────────────

  describe('count', () => {
    it('should return total role count', async () => {
      mockDb.setSelectResult([{ count: 10 }]);

      const result = await repo.count();

      expect(result).toBe(10);
    });
  });
});

// ── Helper ──────────────────────────────────────────────────────────

function createChainableResult(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = [
    'from', 'where', 'limit', 'offset', 'orderBy',
    'leftJoin', 'innerJoin', 'groupBy', 'returning',
  ];
  for (const method of methods) {
    chain[method] = () => chain;
  }
  chain['then'] = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}
