import { describe, it, expect, beforeEach } from 'vitest';
import { AuditLogRepository } from '../audit-log.repository.js';
import {
  createMockDb,
  createSampleAuditLog,
  resetIdCounter,
  type MockDb,
} from './test-helpers.js';

describe('AuditLogRepository', () => {
  let mockDb: MockDb;
  let repo: AuditLogRepository;

  beforeEach(() => {
    resetIdCounter();
    mockDb = createMockDb();
    repo = new AuditLogRepository(mockDb.db);
  });

  // ── findById ────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return audit log when found', async () => {
      const log = createSampleAuditLog();
      mockDb.setSelectResult([log]);

      const result = await repo.findById(log.id);

      expect(result).toEqual(log);
    });

    it('should return null when not found', async () => {
      mockDb.setSelectResult([]);

      const result = await repo.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  // ── findByIdWithUser ────────────────────────────────────────────

  describe('findByIdWithUser', () => {
    it('should return audit log with user details', async () => {
      const logWithUser = {
        ...createSampleAuditLog(),
        userName: 'Admin',
        userEmail: 'admin@test.com',
      };
      mockDb.setSelectResult([logWithUser]);

      const result = await repo.findByIdWithUser(logWithUser.id);

      expect(result?.userName).toBe('Admin');
      expect(result?.userEmail).toBe('admin@test.com');
    });
  });

  // ── create ──────────────────────────────────────────────────────

  describe('create', () => {
    it('should create and return a new audit log entry', async () => {
      const newLog = createSampleAuditLog();
      mockDb.setInsertResult([newLog]);

      const result = await repo.create({
        userId: 'user-id',
        action: 'user.login',
        entityType: 'user',
        entityId: 'user-id',
        ipAddress: '127.0.0.1',
      });

      expect(result).toEqual(newLog);
      expect(mockDb.mocks.insert).toHaveBeenCalled();
    });

    it('should create entry without userId (system action)', async () => {
      const systemLog = createSampleAuditLog({ userId: null });
      mockDb.setInsertResult([systemLog]);

      const result = await repo.create({
        action: 'system.migration',
        entityType: 'system',
        entityId: 'migration-001',
      });

      expect(result).toEqual(systemLog);
    });
  });

  // ── createMany ──────────────────────────────────────────────────

  describe('createMany', () => {
    it('should create multiple audit log entries', async () => {
      const logs = [
        createSampleAuditLog({ action: 'user.login' }),
        createSampleAuditLog({ action: 'dashboard.created' }),
      ];
      mockDb.setInsertResult(logs);

      const result = await repo.createMany([
        { userId: 'u1', action: 'user.login', entityType: 'user', entityId: 'u1' },
        { userId: 'u2', action: 'dashboard.created', entityType: 'dashboard', entityId: 'd1' },
      ]);

      expect(result).toEqual(logs);
    });

    it('should return empty array for empty input', async () => {
      const result = await repo.createMany([]);

      expect(result).toEqual([]);
    });
  });

  // ── findByEntity ────────────────────────────────────────────────

  describe('findByEntity', () => {
    it('should return logs for a specific entity', async () => {
      const logs = [
        createSampleAuditLog({ entityType: 'dashboard', entityId: 'd1', action: 'dashboard.created' }),
        createSampleAuditLog({ entityType: 'dashboard', entityId: 'd1', action: 'dashboard.updated' }),
      ];

      let callCount = 0;
      mockDb.mocks.select.mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [{ count: 2 }] : logs;
        return createChainableResult(result);
      });

      const result = await repo.findByEntity('dashboard', 'd1');

      expect(result.data).toEqual(logs);
      expect(result.total).toBe(2);
    });
  });

  // ── findByUser ──────────────────────────────────────────────────

  describe('findByUser', () => {
    it('should return logs for a specific user', async () => {
      const logs = [createSampleAuditLog({ userId: 'user-1' })];

      let callCount = 0;
      mockDb.mocks.select.mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [{ count: 1 }] : logs;
        return createChainableResult(result);
      });

      const result = await repo.findByUser('user-1');

      expect(result.data).toEqual(logs);
      expect(result.total).toBe(1);
    });
  });

  // ── findByDateRange ─────────────────────────────────────────────

  describe('findByDateRange', () => {
    it('should return logs within date range', async () => {
      const fromDate = new Date('2024-01-01');
      const toDate = new Date('2024-01-31');
      const logs = [createSampleAuditLog()];

      let callCount = 0;
      mockDb.mocks.select.mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [{ count: 1 }] : logs;
        return createChainableResult(result);
      });

      const result = await repo.findByDateRange(fromDate, toDate);

      expect(result.data).toEqual(logs);
      expect(result.total).toBe(1);
    });
  });

  // ── findByAction ────────────────────────────────────────────────

  describe('findByAction', () => {
    it('should return logs for a specific action', async () => {
      const logs = [createSampleAuditLog({ action: 'user.login' })];

      let callCount = 0;
      mockDb.mocks.select.mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [{ count: 1 }] : logs;
        return createChainableResult(result);
      });

      const result = await repo.findByAction('user.login');

      expect(result.data).toEqual(logs);
    });
  });

  // ── Convenience Creators ────────────────────────────────────────

  describe('logCreate', () => {
    it('should create a .created audit entry', async () => {
      const log = createSampleAuditLog({ action: 'dashboard.created' });
      mockDb.setInsertResult([log]);

      const result = await repo.logCreate('user-id', 'dashboard', 'd1');

      expect(result).toEqual(log);
    });
  });

  describe('logUpdate', () => {
    it('should create a .updated audit entry with changes', async () => {
      const log = createSampleAuditLog({
        action: 'dashboard.updated',
        metadata: { changes: { name: 'New Name' } },
      });
      mockDb.setInsertResult([log]);

      const result = await repo.logUpdate(
        'user-id',
        'dashboard',
        'd1',
        { name: 'New Name' },
      );

      expect(result).toEqual(log);
    });
  });

  describe('logDelete', () => {
    it('should create a .deleted audit entry', async () => {
      const log = createSampleAuditLog({ action: 'dashboard.deleted' });
      mockDb.setInsertResult([log]);

      const result = await repo.logDelete('user-id', 'dashboard', 'd1');

      expect(result).toEqual(log);
    });
  });

  describe('logLogin', () => {
    it('should create a user.login audit entry', async () => {
      const log = createSampleAuditLog({ action: 'user.login' });
      mockDb.setInsertResult([log]);

      const result = await repo.logLogin('user-id', '192.168.1.1');

      expect(result).toEqual(log);
    });
  });

  describe('logFailedLogin', () => {
    it('should create a user.login_failed audit entry', async () => {
      const log = createSampleAuditLog({
        action: 'user.login_failed',
        metadata: { reason: 'Invalid credentials' },
      });
      mockDb.setInsertResult([log]);

      const result = await repo.logFailedLogin('user@test.com', '10.0.0.1');

      expect(result).toEqual(log);
    });
  });

  // ── deleteOlderThan ─────────────────────────────────────────────

  describe('deleteOlderThan', () => {
    it('should delete entries older than the given date', async () => {
      mockDb.setDeleteResult([{ id: '1' }, { id: '2' }, { id: '3' }]);

      const result = await repo.deleteOlderThan(new Date('2023-01-01'));

      expect(result).toBe(3);
    });

    it('should return 0 when nothing to delete', async () => {
      mockDb.setDeleteResult([]);

      const result = await repo.deleteOlderThan(new Date('2020-01-01'));

      expect(result).toBe(0);
    });
  });

  // ── count ───────────────────────────────────────────────────────

  describe('count', () => {
    it('should return total count', async () => {
      mockDb.setSelectResult([{ count: 100 }]);

      const result = await repo.count();

      expect(result).toBe(100);
    });

    it('should return filtered count', async () => {
      mockDb.setSelectResult([{ count: 25 }]);

      const result = await repo.count({ action: 'user.login' });

      expect(result).toBe(25);
    });
  });

  // ── getActionSummary ────────────────────────────────────────────

  describe('getActionSummary', () => {
    it('should return action counts', async () => {
      mockDb.setSelectResult([
        { action: 'user.login', count: 50 },
        { action: 'dashboard.created', count: 20 },
        { action: 'question.created', count: 15 },
      ]);

      const result = await repo.getActionSummary();

      expect(result).toEqual([
        { action: 'user.login', count: 50 },
        { action: 'dashboard.created', count: 20 },
        { action: 'question.created', count: 15 },
      ]);
    });

    it('should filter by date range', async () => {
      mockDb.setSelectResult([
        { action: 'user.login', count: 10 },
      ]);

      const result = await repo.getActionSummary(
        new Date('2024-01-01'),
        new Date('2024-01-31'),
      );

      expect(result).toHaveLength(1);
    });
  });

  // ── findAll (paginated) ─────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const logs = [createSampleAuditLog()];

      let callCount = 0;
      mockDb.mocks.select.mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [{ count: 1 }] : logs;
        return createChainableResult(result);
      });

      const result = await repo.findAll(
        { userId: 'user-1' },
        { page: 1, limit: 10 },
      );

      expect(result.data).toEqual(logs);
      expect(result.total).toBe(1);
    });

    it('should filter by multiple criteria', async () => {
      let callCount = 0;
      mockDb.mocks.select.mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [{ count: 5 }] : [];
        return createChainableResult(result);
      });

      const result = await repo.findAll({
        userId: 'user-1',
        entityType: 'dashboard',
        fromDate: new Date('2024-01-01'),
        toDate: new Date('2024-12-31'),
      });

      expect(result.total).toBe(5);
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
