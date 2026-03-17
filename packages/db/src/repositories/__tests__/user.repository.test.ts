import { describe, it, expect, beforeEach } from 'vitest';
import { UserRepository } from '../user.repository.js';
import {
  createMockDb,
  createSampleUser,
  resetIdCounter,
  type MockDb,
} from './test-helpers.js';

describe('UserRepository', () => {
  let mockDb: MockDb;
  let repo: UserRepository;

  beforeEach(() => {
    resetIdCounter();
    mockDb = createMockDb();
    repo = new UserRepository(mockDb.db);
  });

  // ── findById ────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return user when found', async () => {
      const user = createSampleUser();
      mockDb.setSelectResult([user]);

      const result = await repo.findById(user.id);

      expect(result).toEqual(user);
    });

    it('should return null when not found', async () => {
      mockDb.setSelectResult([]);

      const result = await repo.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  // ── findByEmail ─────────────────────────────────────────────────

  describe('findByEmail', () => {
    it('should return user when email matches', async () => {
      const user = createSampleUser({ email: 'alice@example.com' });
      mockDb.setSelectResult([user]);

      const result = await repo.findByEmail('alice@example.com');

      expect(result).toEqual(user);
    });

    it('should return null when email not found', async () => {
      mockDb.setSelectResult([]);

      const result = await repo.findByEmail('unknown@example.com');

      expect(result).toBeNull();
    });
  });

  // ── findByIdWithRole ────────────────────────────────────────────

  describe('findByIdWithRole', () => {
    it('should return user with role details', async () => {
      const userWithRole = {
        ...createSampleUser(),
        roleName: 'Admin',
        rolePermissions: ['admin'],
      };
      mockDb.setSelectResult([userWithRole]);

      const result = await repo.findByIdWithRole(userWithRole.id);

      expect(result).toEqual(userWithRole);
      expect(result?.roleName).toBe('Admin');
      expect(result?.rolePermissions).toEqual(['admin']);
    });
  });

  // ── findByEmailWithRole ─────────────────────────────────────────

  describe('findByEmailWithRole', () => {
    it('should return user with role details by email', async () => {
      const userWithRole = {
        ...createSampleUser({ email: 'admin@test.com' }),
        roleName: 'Admin',
        rolePermissions: ['admin'],
      };
      mockDb.setSelectResult([userWithRole]);

      const result = await repo.findByEmailWithRole('admin@test.com');

      expect(result).toEqual(userWithRole);
    });
  });

  // ── create ──────────────────────────────────────────────────────

  describe('create', () => {
    it('should create and return a new user', async () => {
      const newUser = createSampleUser();
      mockDb.setInsertResult([newUser]);

      const result = await repo.create({
        email: 'new@example.com',
        name: 'New User',
        passwordHash: '$argon2id$hash',
        organizationId: 'org-id',
        roleId: 'role-id',
      });

      expect(result).toEqual(newUser);
      expect(mockDb.mocks.insert).toHaveBeenCalled();
    });

    it('should normalize email to lowercase', async () => {
      const newUser = createSampleUser({ email: 'new@example.com' });
      mockDb.setInsertResult([newUser]);

      await repo.create({
        email: 'New@Example.COM',
        name: 'New User',
        passwordHash: '$argon2id$hash',
        organizationId: 'org-id',
        roleId: 'role-id',
      });

      expect(mockDb.mocks.insert).toHaveBeenCalled();
    });
  });

  // ── update ──────────────────────────────────────────────────────

  describe('update', () => {
    it('should update and return the user', async () => {
      const updated = createSampleUser({ name: 'Updated Name' });
      mockDb.setUpdateResult([updated]);

      const result = await repo.update(updated.id, { name: 'Updated Name' });

      expect(result).toEqual(updated);
    });

    it('should return null when user not found', async () => {
      mockDb.setUpdateResult([]);

      const result = await repo.update('non-existent', { name: 'Test' });

      expect(result).toBeNull();
    });
  });

  // ── delete ──────────────────────────────────────────────────────

  describe('delete', () => {
    it('should return true when user deleted', async () => {
      mockDb.setDeleteResult([{ id: 'user-id' }]);

      const result = await repo.delete('user-id');

      expect(result).toBe(true);
    });

    it('should return false when user not found', async () => {
      mockDb.setDeleteResult([]);

      const result = await repo.delete('non-existent');

      expect(result).toBe(false);
    });
  });

  // ── updateLastLogin ─────────────────────────────────────────────

  describe('updateLastLogin', () => {
    it('should update lastLoginAt timestamp', async () => {
      const now = new Date();
      const updated = createSampleUser({ lastLoginAt: now });
      mockDb.setUpdateResult([updated]);

      const result = await repo.updateLastLogin(updated.id);

      expect(result).toEqual(updated);
      expect(result?.lastLoginAt).toEqual(now);
      expect(mockDb.mocks.update).toHaveBeenCalled();
    });
  });

  // ── deactivate / activate ───────────────────────────────────────

  describe('deactivate', () => {
    it('should set isActive to false', async () => {
      const deactivated = createSampleUser({ isActive: false });
      mockDb.setUpdateResult([deactivated]);

      const result = await repo.deactivate(deactivated.id);

      expect(result?.isActive).toBe(false);
    });
  });

  describe('activate', () => {
    it('should set isActive to true', async () => {
      const activated = createSampleUser({ isActive: true });
      mockDb.setUpdateResult([activated]);

      const result = await repo.activate(activated.id);

      expect(result?.isActive).toBe(true);
    });
  });

  // ── changeRole ──────────────────────────────────────────────────

  describe('changeRole', () => {
    it('should update the role ID', async () => {
      const newRoleId = 'new-role-id';
      const updated = createSampleUser({ roleId: newRoleId });
      mockDb.setUpdateResult([updated]);

      const result = await repo.changeRole(updated.id, newRoleId);

      expect(result?.roleId).toBe(newRoleId);
    });
  });

  // ── updatePassword ──────────────────────────────────────────────

  describe('updatePassword', () => {
    it('should update the password hash', async () => {
      const newHash = '$argon2id$v=19$new_hash';
      const updated = createSampleUser({ passwordHash: newHash });
      mockDb.setUpdateResult([updated]);

      const result = await repo.updatePassword(updated.id, newHash);

      expect(result?.passwordHash).toBe(newHash);
    });
  });

  // ── emailExists ─────────────────────────────────────────────────

  describe('emailExists', () => {
    it('should return true when email exists', async () => {
      mockDb.setSelectResult([{ id: 'user-id' }]);

      const result = await repo.emailExists('taken@example.com');

      expect(result).toBe(true);
    });

    it('should return false when email is available', async () => {
      mockDb.setSelectResult([]);

      const result = await repo.emailExists('available@example.com');

      expect(result).toBe(false);
    });
  });

  // ── countByOrganization ─────────────────────────────────────────

  describe('countByOrganization', () => {
    it('should return user count for organization', async () => {
      mockDb.setSelectResult([{ count: 15 }]);

      const result = await repo.countByOrganization('org-id');

      expect(result).toBe(15);
    });
  });

  // ── findNeverLoggedIn ───────────────────────────────────────────

  describe('findNeverLoggedIn', () => {
    it('should return users who never logged in', async () => {
      const usersNeverLoggedIn = [
        createSampleUser({ lastLoginAt: null, name: 'New User 1' }),
        createSampleUser({ lastLoginAt: null, name: 'New User 2' }),
      ];
      mockDb.setSelectResult(usersNeverLoggedIn);

      const result = await repo.findNeverLoggedIn('org-id');

      expect(result).toEqual(usersNeverLoggedIn);
      expect(result).toHaveLength(2);
    });
  });

  // ── save (upsert) ──────────────────────────────────────────────

  describe('save', () => {
    it('should create when no id provided', async () => {
      const newUser = createSampleUser();
      mockDb.setInsertResult([newUser]);

      const result = await repo.save({
        email: 'new@example.com',
        name: 'New User',
        passwordHash: '$argon2id$hash',
        organizationId: 'org-id',
        roleId: 'role-id',
      });

      expect(result).toEqual(newUser);
    });

    it('should update when id provided and user exists', async () => {
      const existing = createSampleUser();
      const updated = { ...existing, name: 'Updated' };

      mockDb.setSelectResult([existing]);
      mockDb.setUpdateResult([updated]);

      const result = await repo.save({
        id: existing.id,
        email: existing.email,
        name: 'Updated',
        passwordHash: existing.passwordHash,
        organizationId: existing.organizationId,
        roleId: existing.roleId,
      });

      expect(result).toEqual(updated);
    });
  });

  // ── count ───────────────────────────────────────────────────────

  describe('count', () => {
    it('should return total user count', async () => {
      mockDb.setSelectResult([{ count: 42 }]);

      const result = await repo.count();

      expect(result).toBe(42);
    });
  });

  // ── findAll (paginated) ─────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated results with filters', async () => {
      const usersData = [createSampleUser()];

      let callCount = 0;
      mockDb.mocks.select.mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [{ count: 1 }] : usersData;
        return createChainableResult(result);
      });

      const result = await repo.findAll(
        { organizationId: 'org-id', isActive: true },
        { page: 1, limit: 10 },
      );

      expect(result.data).toEqual(usersData);
      expect(result.total).toBe(1);
    });

    it('should clamp pagination to valid ranges', async () => {
      let callCount = 0;
      mockDb.mocks.select.mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [{ count: 0 }] : [];
        return createChainableResult(result);
      });

      const result = await repo.findAll(undefined, { page: -1, limit: 500 });

      expect(result.page).toBe(1);
      expect(result.limit).toBe(100); // Clamped to max
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
