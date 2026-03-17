import { describe, it, expect, beforeEach } from 'vitest';
import { QuestionRepository } from '../question.repository.js';
import {
  createMockDb,
  createSampleQuestion,
  resetIdCounter,
  type MockDb,
} from './test-helpers.js';

describe('QuestionRepository', () => {
  let mockDb: MockDb;
  let repo: QuestionRepository;

  beforeEach(() => {
    resetIdCounter();
    mockDb = createMockDb();
    repo = new QuestionRepository(mockDb.db);
  });

  // ── findById ────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return question when found', async () => {
      const question = createSampleQuestion();
      mockDb.setSelectResult([question]);

      const result = await repo.findById(question.id);

      expect(result).toEqual(question);
    });

    it('should return null when not found', async () => {
      mockDb.setSelectResult([]);

      const result = await repo.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  // ── findByIdWithDetails ─────────────────────────────────────────

  describe('findByIdWithDetails', () => {
    it('should return question with creator and datasource details', async () => {
      const questionWithDetails = {
        ...createSampleQuestion(),
        creatorName: 'Admin',
        creatorEmail: 'admin@test.com',
        dataSourceName: 'Production DB',
        dataSourceType: 'postgresql',
      };
      mockDb.setSelectResult([questionWithDetails]);

      const result = await repo.findByIdWithDetails(questionWithDetails.id);

      expect(result?.creatorName).toBe('Admin');
      expect(result?.dataSourceName).toBe('Production DB');
      expect(result?.dataSourceType).toBe('postgresql');
    });
  });

  // ── create ──────────────────────────────────────────────────────

  describe('create', () => {
    it('should create and return a new question', async () => {
      const newQuestion = createSampleQuestion();
      mockDb.setInsertResult([newQuestion]);

      const result = await repo.create({
        name: 'Revenue Query',
        type: 'sql',
        dataSourceId: 'ds-id',
        query: { sql: 'SELECT SUM(revenue) FROM orders' },
        organizationId: 'org-id',
        createdBy: 'user-id',
      });

      expect(result).toEqual(newQuestion);
      expect(mockDb.mocks.insert).toHaveBeenCalled();
    });
  });

  // ── update ──────────────────────────────────────────────────────

  describe('update', () => {
    it('should update and return the question', async () => {
      const updated = createSampleQuestion({ name: 'Updated Query' });
      mockDb.setUpdateResult([updated]);

      const result = await repo.update(updated.id, { name: 'Updated Query' });

      expect(result?.name).toBe('Updated Query');
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
      mockDb.setDeleteResult([{ id: 'q-id' }]);

      const result = await repo.delete('q-id');

      expect(result).toBe(true);
    });

    it('should return false when not found', async () => {
      mockDb.setDeleteResult([]);

      const result = await repo.delete('non-existent');

      expect(result).toBe(false);
    });
  });

  // ── archive / unarchive ─────────────────────────────────────────

  describe('archive', () => {
    it('should set isArchived to true', async () => {
      const archived = createSampleQuestion({ isArchived: true });
      mockDb.setUpdateResult([archived]);

      const result = await repo.archive(archived.id);

      expect(result?.isArchived).toBe(true);
    });
  });

  describe('unarchive', () => {
    it('should set isArchived to false', async () => {
      const unarchived = createSampleQuestion({ isArchived: false });
      mockDb.setUpdateResult([unarchived]);

      const result = await repo.unarchive(unarchived.id);

      expect(result?.isArchived).toBe(false);
    });
  });

  // ── updateQuery ─────────────────────────────────────────────────

  describe('updateQuery', () => {
    it('should update the query payload', async () => {
      const newQuery = { sql: 'SELECT * FROM orders WHERE status = $1' };
      const updated = createSampleQuestion({ query: newQuery });
      mockDb.setUpdateResult([updated]);

      const result = await repo.updateQuery(updated.id, newQuery);

      expect(result?.query).toEqual(newQuery);
    });
  });

  // ── updateVisualization ─────────────────────────────────────────

  describe('updateVisualization', () => {
    it('should update the visualization config', async () => {
      const newViz = { type: 'bar', xAxis: { label: 'Date' } };
      const updated = createSampleQuestion({ visualization: newViz });
      mockDb.setUpdateResult([updated]);

      const result = await repo.updateVisualization(updated.id, newViz);

      expect(result?.visualization).toEqual(newViz);
    });
  });

  // ── changeDataSource ────────────────────────────────────────────

  describe('changeDataSource', () => {
    it('should update the data source reference', async () => {
      const newDsId = 'new-datasource-id';
      const updated = createSampleQuestion({ dataSourceId: newDsId });
      mockDb.setUpdateResult([updated]);

      const result = await repo.changeDataSource(updated.id, newDsId);

      expect(result?.dataSourceId).toBe(newDsId);
    });
  });

  // ── findRecent ──────────────────────────────────────────────────

  describe('findRecent', () => {
    it('should return recently updated questions', async () => {
      const recentQuestions = [
        createSampleQuestion({ name: 'Recent 1' }),
        createSampleQuestion({ name: 'Recent 2' }),
      ];
      mockDb.setSelectResult(recentQuestions);

      const result = await repo.findRecent('org-id', 5);

      expect(result).toEqual(recentQuestions);
      expect(result).toHaveLength(2);
    });
  });

  // ── countByType ─────────────────────────────────────────────────

  describe('countByType', () => {
    it('should return counts grouped by type', async () => {
      mockDb.setSelectResult([
        { type: 'sql', count: 10 },
        { type: 'visual', count: 5 },
      ]);

      const result = await repo.countByType('org-id');

      expect(result).toEqual({ sql: 10, visual: 5 });
    });
  });

  // ── countByOrganization ─────────────────────────────────────────

  describe('countByOrganization', () => {
    it('should return count for organization', async () => {
      mockDb.setSelectResult([{ count: 25 }]);

      const result = await repo.countByOrganization('org-id');

      expect(result).toBe(25);
    });
  });

  // ── countByDataSource ───────────────────────────────────────────

  describe('countByDataSource', () => {
    it('should return count for datasource', async () => {
      mockDb.setSelectResult([{ count: 12 }]);

      const result = await repo.countByDataSource('ds-id');

      expect(result).toBe(12);
    });
  });

  // ── save (upsert) ──────────────────────────────────────────────

  describe('save', () => {
    it('should create when no id provided', async () => {
      const newQ = createSampleQuestion();
      mockDb.setInsertResult([newQ]);

      const result = await repo.save({
        name: 'New Q',
        type: 'sql',
        dataSourceId: 'ds-id',
        query: { sql: 'SELECT 1' },
        organizationId: 'org-id',
        createdBy: 'user-id',
      });

      expect(result).toEqual(newQ);
    });
  });

  // ── findAll (paginated) ─────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const questionsData = [createSampleQuestion()];

      let callCount = 0;
      mockDb.mocks.select.mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [{ count: 1 }] : questionsData;
        return createChainableResult(result);
      });

      const result = await repo.findAll(
        { organizationId: 'org-id' },
        { page: 1, limit: 10 },
      );

      expect(result.data).toEqual(questionsData);
      expect(result.total).toBe(1);
    });

    it('should exclude archived by default', async () => {
      let callCount = 0;
      mockDb.mocks.select.mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [{ count: 0 }] : [];
        return createChainableResult(result);
      });

      await repo.findAll({ organizationId: 'org-id' });

      // Verify select was called (filter conditions applied internally)
      expect(mockDb.mocks.select).toHaveBeenCalled();
    });

    it('should include archived when requested', async () => {
      let callCount = 0;
      mockDb.mocks.select.mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [{ count: 3 }] : [
          createSampleQuestion({ isArchived: false }),
          createSampleQuestion({ isArchived: true }),
        ];
        return createChainableResult(result);
      });

      const result = await repo.findAll({ includeArchived: true });

      expect(result.total).toBe(3);
    });
  });

  // ── count ───────────────────────────────────────────────────────

  describe('count', () => {
    it('should return total question count', async () => {
      mockDb.setSelectResult([{ count: 50 }]);

      const result = await repo.count();

      expect(result).toBe(50);
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
