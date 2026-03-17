// ── Visual-to-Abstract Translator Tests ─────────────────────────────

import { describe, it, expect } from 'vitest';
import { translateVisualToAbstract, translateBatch } from './visual-to-abstract.js';
import type { VisualQuery } from '@meridian/shared';

function makeVisualQuery(overrides: Partial<VisualQuery> = {}): VisualQuery {
  return {
    dataSourceId: 'ds-1',
    table: 'users',
    columns: [],
    filters: [],
    sorts: [],
    aggregations: [],
    groupBy: [],
    ...overrides,
  };
}

describe('translateVisualToAbstract', () => {
  // ── Basic SELECT ──────────────────────────────────────────────

  describe('basic SELECT', () => {
    it('should generate SELECT * when no columns specified', () => {
      const vq = makeVisualQuery();
      const { query } = translateVisualToAbstract(vq);

      expect(query.source).toEqual({ kind: 'table', table: 'users', schema: undefined });
      expect(query.selections).toHaveLength(1);
      expect(query.selections[0]).toEqual({ kind: 'wildcard' });
    });

    it('should select specific columns', () => {
      const vq = makeVisualQuery({ columns: ['id', 'name', 'email'] });
      const { query } = translateVisualToAbstract(vq);

      expect(query.selections).toHaveLength(3);
      expect(query.selections[0]).toEqual({ kind: 'column', column: 'id' });
      expect(query.selections[1]).toEqual({ kind: 'column', column: 'name' });
      expect(query.selections[2]).toEqual({ kind: 'column', column: 'email' });
    });

    it('should use default schema when provided', () => {
      const vq = makeVisualQuery();
      const { query } = translateVisualToAbstract(vq, { defaultSchema: 'public' });

      expect(query.source).toEqual({ kind: 'table', table: 'users', schema: 'public' });
    });
  });

  // ── Filters ───────────────────────────────────────────────────

  describe('filters', () => {
    it('should translate a single filter', () => {
      const vq = makeVisualQuery({
        filters: [{ column: 'active', operator: 'eq', value: true }],
      });
      const { query } = translateVisualToAbstract(vq);

      expect(query.filters).toHaveLength(1);
      expect(query.filters[0]).toEqual({
        kind: 'comparison',
        column: 'active',
        operator: 'eq',
        value: true,
      });
    });

    it('should translate multiple filters', () => {
      const vq = makeVisualQuery({
        filters: [
          { column: 'active', operator: 'eq', value: true },
          { column: 'age', operator: 'gte', value: 18 },
          { column: 'role', operator: 'in', value: ['admin', 'mod'] },
        ],
      });
      const { query } = translateVisualToAbstract(vq);
      expect(query.filters).toHaveLength(3);
    });

    it('should translate is_null filter', () => {
      const vq = makeVisualQuery({
        filters: [{ column: 'deleted_at', operator: 'is_null', value: null }],
      });
      const { query } = translateVisualToAbstract(vq);
      expect(query.filters[0]).toMatchObject({
        kind: 'comparison',
        column: 'deleted_at',
        operator: 'is_null',
      });
    });

    it('should translate between filter', () => {
      const vq = makeVisualQuery({
        filters: [{ column: 'age', operator: 'between', value: [18, 65] }],
      });
      const { query } = translateVisualToAbstract(vq);
      expect(query.filters[0]).toMatchObject({
        operator: 'between',
        value: [18, 65],
      });
    });

    it('should translate like filter', () => {
      const vq = makeVisualQuery({
        filters: [{ column: 'name', operator: 'like', value: '%john%' }],
      });
      const { query } = translateVisualToAbstract(vq);
      expect(query.filters[0]).toMatchObject({
        operator: 'like',
        value: '%john%',
      });
    });
  });

  // ── Sorting ───────────────────────────────────────────────────

  describe('sorting', () => {
    it('should translate sort clauses', () => {
      const vq = makeVisualQuery({
        sorts: [
          { column: 'name', direction: 'asc' },
          { column: 'created_at', direction: 'desc' },
        ],
      });
      const { query } = translateVisualToAbstract(vq);

      expect(query.orderBy).toHaveLength(2);
      expect(query.orderBy[0]).toEqual({ kind: 'column', column: 'name', direction: 'asc' });
      expect(query.orderBy[1]).toEqual({ kind: 'column', column: 'created_at', direction: 'desc' });
    });

    it('should add default ORDER BY when configured', () => {
      const vq = makeVisualQuery();
      const { query } = translateVisualToAbstract(vq, {
        defaultOrderBy: 'id',
        defaultOrderDirection: 'asc',
      });
      expect(query.orderBy).toHaveLength(1);
      expect(query.orderBy[0]).toEqual({ kind: 'column', column: 'id', direction: 'asc' });
    });

    it('should not add default ORDER BY when sorts exist', () => {
      const vq = makeVisualQuery({
        sorts: [{ column: 'name', direction: 'desc' }],
      });
      const { query } = translateVisualToAbstract(vq, { defaultOrderBy: 'id' });
      expect(query.orderBy).toHaveLength(1);
      expect(query.orderBy[0].kind === 'column' && query.orderBy[0].column).toBe('name');
    });
  });

  // ── Aggregation ───────────────────────────────────────────────

  describe('aggregation', () => {
    it('should translate aggregation with group by', () => {
      const vq = makeVisualQuery({
        aggregations: [{ column: 'amount', aggregation: 'sum', alias: 'total' }],
        groupBy: ['status'],
      });
      const { query } = translateVisualToAbstract(vq);

      // Selections: group by columns + aggregations
      expect(query.selections).toHaveLength(2);
      expect(query.selections[0]).toEqual({ kind: 'column', column: 'status' });
      expect(query.selections[1]).toEqual({
        kind: 'aggregate', fn: 'sum', column: 'amount', alias: 'total',
      });

      // GROUP BY
      expect(query.groupBy).toHaveLength(1);
      expect(query.groupBy[0]).toEqual({ kind: 'column', column: 'status' });
    });

    it('should generate default alias when not provided', () => {
      const vq = makeVisualQuery({
        aggregations: [{ column: 'amount', aggregation: 'avg' }],
        groupBy: ['region'],
      });
      const { query } = translateVisualToAbstract(vq);

      const aggSel = query.selections.find((s) => s.kind === 'aggregate');
      expect(aggSel).toBeDefined();
      if (aggSel?.kind === 'aggregate') {
        expect(aggSel.alias).toBe('avg_amount');
      }
    });

    it('should handle count(*) aggregation', () => {
      const vq = makeVisualQuery({
        aggregations: [{ column: '*', aggregation: 'count', alias: 'cnt' }],
      });
      const { query } = translateVisualToAbstract(vq);

      expect(query.selections).toHaveLength(1);
      expect(query.selections[0]).toEqual({
        kind: 'aggregate', fn: 'count', column: '*', alias: 'cnt',
      });
      // No GROUP BY when no groupBy specified
      expect(query.groupBy).toHaveLength(0);
    });

    it('should handle multiple aggregations', () => {
      const vq = makeVisualQuery({
        aggregations: [
          { column: 'amount', aggregation: 'sum', alias: 'total' },
          { column: 'amount', aggregation: 'avg', alias: 'average' },
          { column: '*', aggregation: 'count', alias: 'cnt' },
        ],
        groupBy: ['status'],
      });
      const { query } = translateVisualToAbstract(vq);

      // 1 groupBy column + 3 aggregations
      expect(query.selections).toHaveLength(4);
    });

    it('should warn about columns not in GROUP BY', () => {
      const vq = makeVisualQuery({
        columns: ['name', 'email'],
        aggregations: [{ column: 'amount', aggregation: 'sum', alias: 'total' }],
        groupBy: ['name'],
      });
      const { warnings } = translateVisualToAbstract(vq);

      expect(warnings).toHaveLength(1);
      expect(warnings[0].code).toBe('COLUMN_NOT_IN_GROUP_BY');
      expect(warnings[0].message).toContain('email');
    });

    it('should not warn about aggregated columns', () => {
      const vq = makeVisualQuery({
        columns: ['amount'],
        aggregations: [{ column: 'amount', aggregation: 'sum', alias: 'total' }],
        groupBy: [],
      });
      const { warnings } = translateVisualToAbstract(vq);
      expect(warnings).toHaveLength(0);
    });
  });

  // ── LIMIT / OFFSET ────────────────────────────────────────────

  describe('limit and offset', () => {
    it('should pass through limit', () => {
      const vq = makeVisualQuery({ limit: 50 });
      const { query } = translateVisualToAbstract(vq);
      expect(query.limit).toBe(50);
    });

    it('should pass through offset', () => {
      const vq = makeVisualQuery({ offset: 100 });
      const { query } = translateVisualToAbstract(vq);
      expect(query.offset).toBe(100);
    });

    it('should enforce maxRows', () => {
      const vq = makeVisualQuery({ limit: 50000 });
      const { query } = translateVisualToAbstract(vq, { maxRows: 10000 });
      expect(query.limit).toBe(10000);
    });

    it('should use maxRows when no limit specified', () => {
      const vq = makeVisualQuery();
      const { query } = translateVisualToAbstract(vq, { maxRows: 5000 });
      expect(query.limit).toBe(5000);
    });

    it('should use query limit when smaller than maxRows', () => {
      const vq = makeVisualQuery({ limit: 100 });
      const { query } = translateVisualToAbstract(vq, { maxRows: 10000 });
      expect(query.limit).toBe(100);
    });
  });

  // ── Defaults ──────────────────────────────────────────────────

  describe('defaults', () => {
    it('should always produce empty joins array', () => {
      const vq = makeVisualQuery();
      const { query } = translateVisualToAbstract(vq);
      expect(query.joins).toEqual([]);
    });

    it('should always produce empty having array', () => {
      const vq = makeVisualQuery();
      const { query } = translateVisualToAbstract(vq);
      expect(query.having).toEqual([]);
    });
  });
});

// ── Batch translation ───────────────────────────────────────────────

describe('translateBatch', () => {
  it('should translate multiple queries', () => {
    const queries: VisualQuery[] = [
      makeVisualQuery({ table: 'users', columns: ['id'] }),
      makeVisualQuery({ table: 'orders', columns: ['id', 'amount'] }),
    ];

    const results = translateBatch(queries);
    expect(results).toHaveLength(2);
    expect(results[0].query.source).toMatchObject({ table: 'users' });
    expect(results[1].query.source).toMatchObject({ table: 'orders' });
  });

  it('should apply same options to all queries', () => {
    const queries: VisualQuery[] = [
      makeVisualQuery({ table: 'a' }),
      makeVisualQuery({ table: 'b' }),
    ];

    const results = translateBatch(queries, { defaultSchema: 'myschema' });
    for (const r of results) {
      expect(r.query.source).toHaveProperty('schema', 'myschema');
    }
  });
});
