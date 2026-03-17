import { describe, it, expect, beforeEach } from 'vitest';
import { DataSourceRepository } from '../datasource.repository.js';
import {
  createMockDb,
  createSampleDataSource,
  resetIdCounter,
  type MockDb,
} from './test-helpers.js';

describe('DataSourceRepository', () => {
  let mockDb: MockDb;
  let repo: DataSourceRepository;

  beforeEach(() => {
    resetIdCounter();
    mockDb = createMockDb();
    repo = new DataSourceRepository(mockDb.db);
  });

  // ── findById ────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return datasource when found', async () => {
      const ds = createSampleDataSource();
      mockDb.setSelectResult([ds]);

      const result = await repo.findById(ds.id);

      expect(result).toEqual(ds);
    });

    it('should return null when not found', async () => {
      mockDb.setSelectResult([]);

      const result = await repo.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  // ── findByIdWithCreator ─────────────────────────────────────────

  describe('findByIdWithCreator', () => {
    it('should return datasource with creator details', async () => {
      const dsWithCreator = {
        ...createSampleDataSource(),
        creatorName: 'Admin',
        creatorEmail: 'admin@test.com',
      };
      mockDb.setSelectResult([dsWithCreator]);

      const result = await repo.findByIdWithCreator(dsWithCreator.id);

      expect(result?.creatorName).toBe('Admin');
      expect(result?.creatorEmail).toBe('admin@test.com');
    });
  });

  // ── create ──────────────────────────────────────────────────────

  describe('create', () => {
    it('should create and return a new datasource', async () => {
      const newDs = createSampleDataSource();
      mockDb.setInsertResult([newDs]);

      const result = await repo.create({
        name: 'New DS',
        type: 'postgresql',
        config: { host: 'localhost' },
        organizationId: 'org-id',
        createdBy: 'user-id',
      });

      expect(result).toEqual(newDs);
      expect(mockDb.mocks.insert).toHaveBeenCalled();
    });
  });

  // ── update ──────────────────────────────────────────────────────

  describe('update', () => {
    it('should update and return the datasource', async () => {
      const updated = createSampleDataSource({ name: 'Updated DS' });
      mockDb.setUpdateResult([updated]);

      const result = await repo.update(updated.id, { name: 'Updated DS' });

      expect(result).toEqual(updated);
    });

    it('should return null when not found', async () => {
      mockDb.setUpdateResult([]);

      const result = await repo.update('non-existent', { name: 'Test' });

      expect(result).toBeNull();
    });
  });

  // ── delete ──────────────────────────────────────────────────────

  describe('delete', () => {
    it('should return true when deleted', async () => {
      mockDb.setDeleteResult([{ id: 'ds-id' }]);

      const result = await repo.delete('ds-id');

      expect(result).toBe(true);
    });

    it('should return false when not found', async () => {
      mockDb.setDeleteResult([]);

      const result = await repo.delete('non-existent');

      expect(result).toBe(false);
    });
  });

  // ── updateStatus ────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('should update status to active', async () => {
      const updated = createSampleDataSource({ status: 'active' });
      mockDb.setUpdateResult([updated]);

      const result = await repo.updateStatus(updated.id, 'active');

      expect(result?.status).toBe('active');
    });

    it('should update status with lastTestedAt', async () => {
      const now = new Date();
      const updated = createSampleDataSource({ status: 'active', lastTestedAt: now });
      mockDb.setUpdateResult([updated]);

      const result = await repo.updateStatus(updated.id, 'active', now);

      expect(result?.status).toBe('active');
      expect(result?.lastTestedAt).toEqual(now);
    });
  });

  // ── markTested / markError ──────────────────────────────────────

  describe('markTested', () => {
    it('should set status to active and update lastTestedAt', async () => {
      const updated = createSampleDataSource({ status: 'active' });
      mockDb.setUpdateResult([updated]);

      const result = await repo.markTested(updated.id);

      expect(result?.status).toBe('active');
    });
  });

  describe('markError', () => {
    it('should set status to error', async () => {
      const updated = createSampleDataSource({ status: 'error' });
      mockDb.setUpdateResult([updated]);

      const result = await repo.markError(updated.id);

      expect(result?.status).toBe('error');
    });
  });

  // ── updateConfig ────────────────────────────────────────────────

  describe('updateConfig', () => {
    it('should update the config payload', async () => {
      const newConfig = { host: 'new-host', port: 5433 };
      const updated = createSampleDataSource({ config: newConfig });
      mockDb.setUpdateResult([updated]);

      const result = await repo.updateConfig(updated.id, newConfig);

      expect(result?.config).toEqual(newConfig);
    });
  });

  // ── findByType ──────────────────────────────────────────────────

  describe('findByType', () => {
    it('should return datasources of specified type', async () => {
      const pgSources = [
        createSampleDataSource({ type: 'postgresql', name: 'PG 1' }),
        createSampleDataSource({ type: 'postgresql', name: 'PG 2' }),
      ];
      mockDb.setSelectResult(pgSources);

      const result = await repo.findByType('org-id', 'postgresql');

      expect(result).toEqual(pgSources);
      expect(result).toHaveLength(2);
    });
  });

  // ── findWithErrors ──────────────────────────────────────────────

  describe('findWithErrors', () => {
    it('should return datasources with error status', async () => {
      const errorSources = [
        createSampleDataSource({ status: 'error', name: 'Broken DS' }),
      ];
      mockDb.setSelectResult(errorSources);

      const result = await repo.findWithErrors('org-id');

      expect(result).toEqual(errorSources);
    });
  });

  // ── countByStatus ───────────────────────────────────────────────

  describe('countByStatus', () => {
    it('should return counts grouped by status', async () => {
      mockDb.setSelectResult([
        { status: 'active', count: 5 },
        { status: 'error', count: 2 },
        { status: 'inactive', count: 1 },
      ]);

      const result = await repo.countByStatus('org-id');

      expect(result).toEqual({ active: 5, error: 2, inactive: 1 });
    });
  });

  // ── countByOrganization ─────────────────────────────────────────

  describe('countByOrganization', () => {
    it('should return count for organization', async () => {
      mockDb.setSelectResult([{ count: 8 }]);

      const result = await repo.countByOrganization('org-id');

      expect(result).toBe(8);
    });
  });

  // ── save (upsert) ──────────────────────────────────────────────

  describe('save', () => {
    it('should create when no id provided', async () => {
      const newDs = createSampleDataSource();
      mockDb.setInsertResult([newDs]);

      const result = await repo.save({
        name: 'New DS',
        type: 'postgresql',
        config: { host: 'localhost' },
        organizationId: 'org-id',
        createdBy: 'user-id',
      });

      expect(result).toEqual(newDs);
    });
  });

  // ── findAll (paginated) ─────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const sources = [createSampleDataSource()];

      let callCount = 0;
      mockDb.mocks.select.mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [{ count: 1 }] : sources;
        return createChainableResult(result);
      });

      const result = await repo.findAll(
        { organizationId: 'org-id' },
        { page: 1, limit: 10 },
      );

      expect(result.data).toEqual(sources);
      expect(result.total).toBe(1);
    });

    it('should filter by type', async () => {
      let callCount = 0;
      mockDb.mocks.select.mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [{ count: 3 }] : [
          createSampleDataSource({ type: 'mysql' }),
        ];
        return createChainableResult(result);
      });

      const result = await repo.findAll({ type: 'mysql' });

      expect(result.total).toBe(3);
    });

    it('should filter by status', async () => {
      let callCount = 0;
      mockDb.mocks.select.mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [{ count: 2 }] : [];
        return createChainableResult(result);
      });

      const result = await repo.findAll({ status: 'active' });

      expect(result.total).toBe(2);
    });
  });

  // ── count ───────────────────────────────────────────────────────

  describe('count', () => {
    it('should return total datasource count', async () => {
      mockDb.setSelectResult([{ count: 20 }]);

      const result = await repo.count();

      expect(result).toBe(20);
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
