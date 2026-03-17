import { describe, it, expect, beforeEach } from 'vitest';
import { OrganizationRepository } from '../organization.repository.js';
import {
  createMockDb,
  createSampleOrganization,
  resetIdCounter,
  type MockDb,
} from './test-helpers.js';

describe('OrganizationRepository', () => {
  let mockDb: MockDb;
  let repo: OrganizationRepository;

  beforeEach(() => {
    resetIdCounter();
    mockDb = createMockDb();
    repo = new OrganizationRepository(mockDb.db);
  });

  // ── findById ────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return organization when found', async () => {
      const org = createSampleOrganization();
      mockDb.setSelectResult([org]);

      const result = await repo.findById(org.id);

      expect(result).toEqual(org);
      expect(mockDb.mocks.select).toHaveBeenCalled();
    });

    it('should return null when not found', async () => {
      mockDb.setSelectResult([]);

      const result = await repo.findById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  // ── findBySlug ──────────────────────────────────────────────────

  describe('findBySlug', () => {
    it('should return organization when slug matches', async () => {
      const org = createSampleOrganization({ slug: 'my-org' });
      mockDb.setSelectResult([org]);

      const result = await repo.findBySlug('my-org');

      expect(result).toEqual(org);
    });

    it('should return null when slug not found', async () => {
      mockDb.setSelectResult([]);

      const result = await repo.findBySlug('unknown-slug');

      expect(result).toBeNull();
    });
  });

  // ── create ──────────────────────────────────────────────────────

  describe('create', () => {
    it('should create and return a new organization', async () => {
      const newOrg = createSampleOrganization();
      mockDb.setInsertResult([newOrg]);

      const result = await repo.create({
        name: 'New Org',
        slug: 'new-org',
      });

      expect(result).toEqual(newOrg);
      expect(mockDb.mocks.insert).toHaveBeenCalled();
    });
  });

  // ── update ──────────────────────────────────────────────────────

  describe('update', () => {
    it('should update and return the organization', async () => {
      const updated = createSampleOrganization({ name: 'Updated Name' });
      mockDb.setUpdateResult([updated]);

      const result = await repo.update(updated.id, { name: 'Updated Name' });

      expect(result).toEqual(updated);
      expect(mockDb.mocks.update).toHaveBeenCalled();
    });

    it('should return null when organization not found', async () => {
      mockDb.setUpdateResult([]);

      const result = await repo.update('non-existent-id', { name: 'Test' });

      expect(result).toBeNull();
    });
  });

  // ── delete ──────────────────────────────────────────────────────

  describe('delete', () => {
    it('should return true when organization deleted', async () => {
      mockDb.setDeleteResult([{ id: 'some-id' }]);

      const result = await repo.delete('some-id');

      expect(result).toBe(true);
      expect(mockDb.mocks.delete).toHaveBeenCalled();
    });

    it('should return false when organization not found', async () => {
      mockDb.setDeleteResult([]);

      const result = await repo.delete('non-existent-id');

      expect(result).toBe(false);
    });
  });

  // ── save (upsert) ──────────────────────────────────────────────

  describe('save', () => {
    it('should create when no id provided', async () => {
      const newOrg = createSampleOrganization();
      mockDb.setInsertResult([newOrg]);

      const result = await repo.save({
        name: 'New Org',
        slug: 'new-org',
      });

      expect(result).toEqual(newOrg);
      expect(mockDb.mocks.insert).toHaveBeenCalled();
    });

    it('should update when id provided and org exists', async () => {
      const existing = createSampleOrganization();
      const updated = { ...existing, name: 'Updated' };

      // First call: findById (select), second call: count for findAll
      mockDb.setSelectResult([existing]);
      mockDb.setUpdateResult([updated]);

      const result = await repo.save({
        id: existing.id,
        name: 'Updated',
        slug: existing.slug,
      });

      expect(result).toEqual(updated);
    });
  });

  // ── findAll ─────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const orgs = [
        createSampleOrganization({ name: 'Org 1' }),
        createSampleOrganization({ name: 'Org 2' }),
      ];

      // First select: count query, second select: data query
      let callCount = 0;
      mockDb.mocks.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Count query
          return createCountChain([{ count: 2 }]);
        }
        // Data query
        return createDataChain(orgs);
      });

      const result = await repo.findAll(undefined, { page: 1, limit: 10 });

      expect(result.data).toEqual(orgs);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
      expect(result.hasNext).toBe(false);
      expect(result.hasPrevious).toBe(false);
    });

    it('should apply search filter', async () => {
      let callCount = 0;
      mockDb.mocks.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createCountChain([{ count: 1 }]);
        }
        return createDataChain([createSampleOrganization({ name: 'Matching Org' })]);
      });

      const result = await repo.findAll({ search: 'Matching' });

      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
    });

    it('should handle empty results', async () => {
      let callCount = 0;
      mockDb.mocks.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createCountChain([{ count: 0 }]);
        }
        return createDataChain([]);
      });

      const result = await repo.findAll();

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });

  // ── slugExists ──────────────────────────────────────────────────

  describe('slugExists', () => {
    it('should return true when slug exists', async () => {
      mockDb.setSelectResult([{ id: 'some-id' }]);

      const result = await repo.slugExists('existing-slug');

      expect(result).toBe(true);
    });

    it('should return false when slug is available', async () => {
      mockDb.setSelectResult([]);

      const result = await repo.slugExists('new-slug');

      expect(result).toBe(false);
    });
  });

  // ── count ───────────────────────────────────────────────────────

  describe('count', () => {
    it('should return total count of organizations', async () => {
      mockDb.setSelectResult([{ count: 5 }]);

      const result = await repo.count();

      expect(result).toBe(5);
    });
  });

  // ── findRecent ──────────────────────────────────────────────────

  describe('findRecent', () => {
    it('should return recently created organizations', async () => {
      const orgs = [
        createSampleOrganization({ name: 'Recent 1' }),
        createSampleOrganization({ name: 'Recent 2' }),
      ];
      mockDb.setSelectResult(orgs);

      const result = await repo.findRecent(5);

      expect(result).toEqual(orgs);
    });
  });

  // ── updateSettings ──────────────────────────────────────────────

  describe('updateSettings', () => {
    it('should merge new settings with existing', async () => {
      const existing = createSampleOrganization({
        settings: { timezone: 'UTC', locale: 'en-US' },
      });
      const updated = {
        ...existing,
        settings: { timezone: 'UTC', locale: 'en-US', theme: 'dark' },
      };

      mockDb.setSelectResult([existing]);
      mockDb.setUpdateResult([updated]);

      const result = await repo.updateSettings(existing.id, { theme: 'dark' });

      expect(result).toEqual(updated);
    });

    it('should return null when organization not found', async () => {
      mockDb.setSelectResult([]);

      const result = await repo.updateSettings('non-existent', { theme: 'dark' });

      expect(result).toBeNull();
    });
  });
});

// ── Helper: create a chainable mock for count queries ───────────────

function createChainableMockWithResult(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = [
    'from', 'where', 'limit', 'offset', 'orderBy',
    'leftJoin', 'innerJoin', 'groupBy', 'returning',
    'set', 'values', 'onConflictDoUpdate',
  ];
  for (const method of methods) {
    chain[method] = () => chain;
  }
  chain['then'] = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

function createCountChain(result: unknown) {
  return createChainableMockWithResult(result);
}

function createDataChain(result: unknown) {
  return createChainableMockWithResult(result);
}
