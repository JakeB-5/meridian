import { describe, it, expect } from 'vitest';
import { Question } from './question.model.js';
import { isOk, isErr } from '@meridian/shared';
import type { VisualQuery, VisualizationConfig } from '@meridian/shared';

describe('Question', () => {
  const validVisualQuery: VisualQuery = {
    dataSourceId: 'ds-123',
    table: 'users',
    columns: ['id', 'name', 'email'],
    filters: [],
    sorts: [{ column: 'name', direction: 'asc' }],
    aggregations: [],
    groupBy: [],
    limit: 100,
  };

  const validVisualParams = {
    name: 'Active Users',
    description: 'List of active users',
    dataSourceId: 'ds-123',
    query: validVisualQuery,
    organizationId: 'org-123',
    createdBy: 'user-123',
  };

  const validSQLParams = {
    name: 'Revenue Report',
    description: 'Monthly revenue',
    dataSourceId: 'ds-123',
    sql: 'SELECT month, SUM(amount) FROM orders GROUP BY month',
    organizationId: 'org-123',
    createdBy: 'user-123',
  };

  describe('createVisual()', () => {
    it('should create a visual question with valid params', () => {
      const result = Question.createVisual(validVisualParams);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      const q = result.value;
      expect(q.name).toBe('Active Users');
      expect(q.description).toBe('List of active users');
      expect(q.type).toBe('visual');
      expect(q.dataSourceId).toBe('ds-123');
      expect(q.organizationId).toBe('org-123');
      expect(q.createdBy).toBe('user-123');
      expect(q.id).toBeDefined();
      expect(q.createdAt).toBeInstanceOf(Date);
      expect(q.visualization.type).toBe('table'); // default
    });

    it('should accept custom visualization', () => {
      const viz: VisualizationConfig = { type: 'bar', stacked: true };
      const result = Question.createVisual({
        ...validVisualParams,
        visualization: viz,
      });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.visualization.type).toBe('bar');
      expect(result.value.visualization.stacked).toBe(true);
    });

    it('should reject empty name', () => {
      const result = Question.createVisual({ ...validVisualParams, name: '' });
      expect(isErr(result)).toBe(true);
    });

    it('should reject missing dataSourceId', () => {
      const result = Question.createVisual({
        ...validVisualParams,
        dataSourceId: '',
      });
      expect(isErr(result)).toBe(true);
    });

    it('should reject missing organizationId', () => {
      const result = Question.createVisual({
        ...validVisualParams,
        organizationId: '',
      });
      expect(isErr(result)).toBe(true);
    });

    it('should reject missing createdBy', () => {
      const result = Question.createVisual({
        ...validVisualParams,
        createdBy: '',
      });
      expect(isErr(result)).toBe(true);
    });

    it('should reject visual query without table', () => {
      const result = Question.createVisual({
        ...validVisualParams,
        query: { ...validVisualQuery, table: '' },
      });
      expect(isErr(result)).toBe(true);
    });

    it('should reject visual query without columns or aggregations', () => {
      const result = Question.createVisual({
        ...validVisualParams,
        query: { ...validVisualQuery, columns: [], aggregations: [] },
      });
      expect(isErr(result)).toBe(true);
    });

    it('should allow aggregation-only query (no columns)', () => {
      const result = Question.createVisual({
        ...validVisualParams,
        query: {
          ...validVisualQuery,
          columns: [],
          aggregations: [{ column: 'id', aggregation: 'count', alias: 'total' }],
        },
      });
      expect(isOk(result)).toBe(true);
    });

    it('should reject negative limit', () => {
      const result = Question.createVisual({
        ...validVisualParams,
        query: { ...validVisualQuery, limit: -1 },
      });
      expect(isErr(result)).toBe(true);
    });

    it('should reject negative offset', () => {
      const result = Question.createVisual({
        ...validVisualParams,
        query: { ...validVisualQuery, offset: -5 },
      });
      expect(isErr(result)).toBe(true);
    });
  });

  describe('createSQL()', () => {
    it('should create a SQL question with valid params', () => {
      const result = Question.createSQL(validSQLParams);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      const q = result.value;
      expect(q.name).toBe('Revenue Report');
      expect(q.type).toBe('sql');
      expect(q.query).toBe('SELECT month, SUM(amount) FROM orders GROUP BY month');
    });

    it('should reject empty SQL', () => {
      const result = Question.createSQL({ ...validSQLParams, sql: '' });
      expect(isErr(result)).toBe(true);
    });

    it('should reject SQL exceeding max length', () => {
      const result = Question.createSQL({
        ...validSQLParams,
        sql: 'SELECT ' + 'x'.repeat(50001),
      });
      expect(isErr(result)).toBe(true);
    });
  });

  describe('toVisualQuery()', () => {
    it('should return the visual query for visual questions', () => {
      const createResult = Question.createVisual(validVisualParams);
      if (!isOk(createResult)) return;

      const result = createResult.value.toVisualQuery();
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.table).toBe('users');
    });

    it('should return error for SQL questions', () => {
      const createResult = Question.createSQL(validSQLParams);
      if (!isOk(createResult)) return;

      const result = createResult.value.toVisualQuery();
      expect(isErr(result)).toBe(true);
    });
  });

  describe('toSQL()', () => {
    it('should return the SQL for SQL questions', () => {
      const createResult = Question.createSQL(validSQLParams);
      if (!isOk(createResult)) return;

      const result = createResult.value.toSQL();
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toContain('SELECT month');
    });

    it('should return error for visual questions', () => {
      const createResult = Question.createVisual(validVisualParams);
      if (!isOk(createResult)) return;

      const result = createResult.value.toSQL();
      expect(isErr(result)).toBe(true);
    });
  });

  describe('updateVisualization()', () => {
    it('should return a new Question with updated visualization', () => {
      const createResult = Question.createVisual(validVisualParams);
      if (!isOk(createResult)) return;
      const original = createResult.value;

      const newViz: VisualizationConfig = { type: 'line', tooltip: true };
      const result = original.updateVisualization(newViz);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value.visualization.type).toBe('line');
      expect(result.value.id).toBe(original.id);
      expect(result.value.name).toBe(original.name);
    });

    it('should reject visualization without type', () => {
      const createResult = Question.createVisual(validVisualParams);
      if (!isOk(createResult)) return;

      const result = createResult.value.updateVisualization({} as VisualizationConfig);
      expect(isErr(result)).toBe(true);
    });
  });

  describe('updateQuery()', () => {
    it('should update a visual query', () => {
      const createResult = Question.createVisual(validVisualParams);
      if (!isOk(createResult)) return;

      const newQuery: VisualQuery = {
        ...validVisualQuery,
        table: 'orders',
        columns: ['id', 'total'],
      };
      const result = createResult.value.updateQuery(newQuery);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect((result.value.query as VisualQuery).table).toBe('orders');
    });

    it('should reject string query for visual question', () => {
      const createResult = Question.createVisual(validVisualParams);
      if (!isOk(createResult)) return;

      const result = createResult.value.updateQuery('SELECT 1');
      expect(isErr(result)).toBe(true);
    });

    it('should reject object query for SQL question', () => {
      const createResult = Question.createSQL(validSQLParams);
      if (!isOk(createResult)) return;

      const result = createResult.value.updateQuery(validVisualQuery);
      expect(isErr(result)).toBe(true);
    });

    it('should invalidate cache on query change', () => {
      const createResult = Question.createVisual(validVisualParams);
      if (!isOk(createResult)) return;

      const cached = createResult.value.cacheResult(
        { columns: [], rows: [], rowCount: 0, executionTimeMs: 10, truncated: false },
        60000,
      );
      expect(cached.isCacheValid).toBe(true);

      const newQuery: VisualQuery = { ...validVisualQuery, table: 'products' };
      const updated = cached.updateQuery(newQuery);
      expect(isOk(updated)).toBe(true);
      if (!isOk(updated)) return;
      expect(updated.value.isCacheValid).toBe(false);
    });
  });

  describe('updateMetadata()', () => {
    it('should update name and description', () => {
      const createResult = Question.createVisual(validVisualParams);
      if (!isOk(createResult)) return;

      const result = createResult.value.updateMetadata({
        name: 'New Name',
        description: 'New desc',
      });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.name).toBe('New Name');
      expect(result.value.description).toBe('New desc');
    });

    it('should reject empty name', () => {
      const createResult = Question.createVisual(validVisualParams);
      if (!isOk(createResult)) return;

      const result = createResult.value.updateMetadata({ name: '' });
      expect(isErr(result)).toBe(true);
    });
  });

  describe('cacheResult() / clearCache()', () => {
    it('should cache a result with TTL', () => {
      const createResult = Question.createVisual(validVisualParams);
      if (!isOk(createResult)) return;

      const queryResult = {
        columns: [{ name: 'id', type: 'integer', nullable: false }],
        rows: [{ id: 1 }],
        rowCount: 1,
        executionTimeMs: 50,
        truncated: false,
      };
      const cached = createResult.value.cacheResult(queryResult, 60000);
      expect(cached.isCacheValid).toBe(true);
      expect(cached.cachedResult).toEqual(queryResult);
    });

    it('should report invalid cache when expired', () => {
      const createResult = Question.createVisual(validVisualParams);
      if (!isOk(createResult)) return;

      const cached = createResult.value.cacheResult(
        { columns: [], rows: [], rowCount: 0, executionTimeMs: 0, truncated: false },
        -1000, // already expired
      );
      expect(cached.isCacheValid).toBe(false);
    });

    it('should clear cache', () => {
      const createResult = Question.createVisual(validVisualParams);
      if (!isOk(createResult)) return;

      const cached = createResult.value.cacheResult(
        { columns: [], rows: [], rowCount: 0, executionTimeMs: 0, truncated: false },
        60000,
      );
      const cleared = cached.clearCache();
      expect(cleared.isCacheValid).toBe(false);
      expect(cleared.cachedResult).toBeUndefined();
    });
  });

  describe('fromPersistence()', () => {
    it('should reconstitute a question from stored data', () => {
      const now = new Date();
      const q = Question.fromPersistence({
        id: 'q-123',
        name: 'Persisted',
        type: 'sql',
        dataSourceId: 'ds-1',
        query: 'SELECT 1',
        visualization: { type: 'table' },
        organizationId: 'org-1',
        createdBy: 'user-1',
        createdAt: now,
        updatedAt: now,
      });

      expect(q.id).toBe('q-123');
      expect(q.name).toBe('Persisted');
      expect(q.type).toBe('sql');
    });
  });
});
