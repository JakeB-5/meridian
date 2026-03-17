// ── Query Optimizer Tests ────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { QueryOptimizer, optimizeQuery } from './query-optimizer.js';
import { QueryBuilder } from '../ir/query-builder.js';
import type { AbstractQuery, Filter } from '../ir/abstract-query.js';

describe('QueryOptimizer', () => {
  const optimizer = new QueryOptimizer();

  // ── Flatten Logical Filters ───────────────────────────────────

  describe('flatten logical filters', () => {
    it('should flatten nested AND into single AND', () => {
      const innerAnd: Filter = {
        kind: 'logical',
        operator: 'and',
        conditions: [
          { kind: 'comparison', column: 'b', operator: 'eq', value: 2 },
          { kind: 'comparison', column: 'c', operator: 'eq', value: 3 },
        ],
      };

      const query: AbstractQuery = {
        source: { kind: 'table', table: 't' },
        selections: [],
        filters: [{
          kind: 'logical',
          operator: 'and',
          conditions: [
            { kind: 'comparison', column: 'a', operator: 'eq', value: 1 },
            innerAnd,
          ],
        }],
        groupBy: [],
        orderBy: [],
        joins: [],
        having: [],
      };

      const result = optimizer.optimize(query);
      expect(result.appliedOptimizations).toContain('flatten-logical');

      // The nested AND should be flattened
      const filter = result.query.filters[0];
      expect(filter.kind).toBe('logical');
      if (filter.kind === 'logical') {
        expect(filter.conditions).toHaveLength(3);
      }
    });

    it('should NOT flatten mixed AND/OR', () => {
      const innerOr: Filter = {
        kind: 'logical',
        operator: 'or',
        conditions: [
          { kind: 'comparison', column: 'b', operator: 'eq', value: 2 },
          { kind: 'comparison', column: 'c', operator: 'eq', value: 3 },
        ],
      };

      const query: AbstractQuery = {
        source: { kind: 'table', table: 't' },
        selections: [],
        filters: [{
          kind: 'logical',
          operator: 'and',
          conditions: [
            { kind: 'comparison', column: 'a', operator: 'eq', value: 1 },
            innerOr,
          ],
        }],
        groupBy: [],
        orderBy: [],
        joins: [],
        having: [],
      };

      const result = optimizer.optimize(query);
      const filter = result.query.filters[0];
      if (filter.kind === 'logical') {
        // OR should remain nested inside AND
        expect(filter.conditions).toHaveLength(2);
        expect(filter.conditions[1].kind).toBe('logical');
      }
    });

    it('should unwrap single-element logical filter', () => {
      const query: AbstractQuery = {
        source: { kind: 'table', table: 't' },
        selections: [],
        filters: [{
          kind: 'logical',
          operator: 'and',
          conditions: [
            { kind: 'comparison', column: 'a', operator: 'eq', value: 1 },
          ],
        }],
        groupBy: [],
        orderBy: [],
        joins: [],
        having: [],
      };

      const result = optimizer.optimize(query);
      expect(result.query.filters[0].kind).toBe('comparison');
    });
  });

  // ── Simplify Constants ────────────────────────────────────────

  describe('simplify constant expressions', () => {
    it('should remove double NOT', () => {
      const query: AbstractQuery = {
        source: { kind: 'table', table: 't' },
        selections: [],
        filters: [{
          kind: 'not',
          condition: {
            kind: 'not',
            condition: { kind: 'comparison', column: 'a', operator: 'eq', value: 1 },
          },
        }],
        groupBy: [],
        orderBy: [],
        joins: [],
        having: [],
      };

      const result = optimizer.optimize(query);
      expect(result.appliedOptimizations).toContain('simplify-constants');
      expect(result.query.filters[0]).toEqual({
        kind: 'comparison', column: 'a', operator: 'eq', value: 1,
      });
    });

    it('should simplify empty logical filter', () => {
      const query: AbstractQuery = {
        source: { kind: 'table', table: 't' },
        selections: [],
        filters: [{
          kind: 'logical',
          operator: 'and',
          conditions: [],
        }],
        groupBy: [],
        orderBy: [],
        joins: [],
        having: [],
      };

      const result = optimizer.optimize(query);
      // Empty AND is removed entirely
      expect(result.query.filters).toHaveLength(0);
    });
  });

  // ── Merge Redundant Filters ───────────────────────────────────

  describe('merge redundant filters', () => {
    it('should remove duplicate comparison filters', () => {
      const query = new QueryBuilder()
        .from('users')
        .where('active', 'eq', true)
        .where('active', 'eq', true) // duplicate
        .where('name', 'like', '%john%')
        .build();

      const result = optimizer.optimize(query);
      expect(result.appliedOptimizations).toContain('merge-redundant-filters');
      expect(result.query.filters).toHaveLength(2);
    });

    it('should keep non-duplicate filters', () => {
      const query = new QueryBuilder()
        .from('users')
        .where('active', 'eq', true)
        .where('active', 'eq', false) // different value
        .build();

      const result = optimizer.optimize(query);
      expect(result.query.filters).toHaveLength(2);
    });

    it('should deduplicate having filters too', () => {
      const query = new QueryBuilder()
        .from('orders')
        .groupBy('user_id')
        .having('total', 'gt', 100)
        .having('total', 'gt', 100)
        .build();

      const result = optimizer.optimize(query);
      expect(result.query.having).toHaveLength(1);
    });
  });

  // ── Remove Unused Columns ─────────────────────────────────────

  describe('remove unused columns', () => {
    it('should remove columns not in GROUP BY', () => {
      const query: AbstractQuery = {
        source: { kind: 'table', table: 'orders' },
        selections: [
          { kind: 'column', column: 'status' },
          { kind: 'column', column: 'region' }, // not in GROUP BY
          { kind: 'aggregate', fn: 'sum', column: 'amount', alias: 'total' },
        ],
        filters: [],
        groupBy: [{ kind: 'column', column: 'status' }],
        orderBy: [],
        joins: [],
        having: [],
      };

      const result = optimizer.optimize(query);
      expect(result.appliedOptimizations).toContain('remove-unused-columns');
      expect(result.query.selections).toHaveLength(2);
      expect(result.query.selections.some((s) => s.kind === 'column' && s.column === 'region')).toBe(false);
    });

    it('should keep aggregate selections', () => {
      const query: AbstractQuery = {
        source: { kind: 'table', table: 'orders' },
        selections: [
          { kind: 'aggregate', fn: 'count', column: '*', alias: 'cnt' },
          { kind: 'aggregate', fn: 'sum', column: 'amount', alias: 'total' },
        ],
        filters: [],
        groupBy: [{ kind: 'column', column: 'status' }],
        orderBy: [],
        joins: [],
        having: [],
      };

      const result = optimizer.optimize(query);
      expect(result.query.selections).toHaveLength(2);
    });

    it('should not apply when no GROUP BY', () => {
      const query = new QueryBuilder()
        .from('users')
        .select('id', 'name', 'email')
        .build();

      const result = optimizer.optimize(query);
      expect(result.query.selections).toHaveLength(3);
    });

    it('should keep raw and wildcard selections', () => {
      const query: AbstractQuery = {
        source: { kind: 'table', table: 'orders' },
        selections: [
          { kind: 'wildcard' },
          { kind: 'raw', expression: '1 + 1', alias: 'two' },
        ],
        filters: [],
        groupBy: [{ kind: 'column', column: 'status' }],
        orderBy: [],
        joins: [],
        having: [],
      };

      const result = optimizer.optimize(query);
      expect(result.query.selections).toHaveLength(2);
    });
  });

  // ── Push Filters Down ─────────────────────────────────────────

  describe('push filters down to subqueries', () => {
    it('should push simple comparison filter into subquery', () => {
      const subquery: AbstractQuery = {
        source: { kind: 'table', table: 'orders' },
        selections: [
          { kind: 'column', column: 'user_id' },
          { kind: 'column', column: 'amount' },
        ],
        filters: [],
        groupBy: [],
        orderBy: [],
        joins: [],
        having: [],
      };

      const query: AbstractQuery = {
        source: { kind: 'subquery', query: subquery, alias: 'sub' },
        selections: [{ kind: 'wildcard' }],
        filters: [
          { kind: 'comparison', column: 'amount', operator: 'gt', value: 100 },
        ],
        groupBy: [],
        orderBy: [],
        joins: [],
        having: [],
      };

      const result = optimizer.optimize(query);
      expect(result.appliedOptimizations).toContain('push-down-filters');

      // Filter should be in the subquery now
      if (result.query.source.kind === 'subquery') {
        expect(result.query.source.query.filters).toHaveLength(1);
      }
      // And removed from outer
      expect(result.query.filters).toHaveLength(0);
    });

    it('should not push filter referencing non-existent column', () => {
      const subquery: AbstractQuery = {
        source: { kind: 'table', table: 'orders' },
        selections: [
          { kind: 'column', column: 'user_id' },
        ],
        filters: [],
        groupBy: [],
        orderBy: [],
        joins: [],
        having: [],
      };

      const query: AbstractQuery = {
        source: { kind: 'subquery', query: subquery, alias: 'sub' },
        selections: [{ kind: 'wildcard' }],
        filters: [
          { kind: 'comparison', column: 'non_existent', operator: 'eq', value: 1 },
        ],
        groupBy: [],
        orderBy: [],
        joins: [],
        having: [],
      };

      const result = optimizer.optimize(query);
      // Filter stays in outer query
      expect(result.query.filters).toHaveLength(1);
    });

    it('should not push logical filters', () => {
      const subquery: AbstractQuery = {
        source: { kind: 'table', table: 'orders' },
        selections: [{ kind: 'column', column: 'amount' }],
        filters: [],
        groupBy: [],
        orderBy: [],
        joins: [],
        having: [],
      };

      const query: AbstractQuery = {
        source: { kind: 'subquery', query: subquery, alias: 'sub' },
        selections: [{ kind: 'wildcard' }],
        filters: [{
          kind: 'logical',
          operator: 'or',
          conditions: [
            { kind: 'comparison', column: 'amount', operator: 'gt', value: 100 },
            { kind: 'comparison', column: 'amount', operator: 'lt', value: 10 },
          ],
        }],
        groupBy: [],
        orderBy: [],
        joins: [],
        having: [],
      };

      const result = optimizer.optimize(query);
      // Logical filters are not pushed down
      expect(result.query.filters).toHaveLength(1);
    });

    it('should not apply when source is a table', () => {
      const query = new QueryBuilder()
        .from('users')
        .where('active', 'eq', true)
        .build();

      const result = optimizer.optimize(query);
      expect(result.appliedOptimizations).not.toContain('push-down-filters');
    });
  });

  // ── LIMIT Pushdown ────────────────────────────────────────────

  describe('LIMIT pushdown', () => {
    it('should push LIMIT into subquery', () => {
      const subquery: AbstractQuery = {
        source: { kind: 'table', table: 'orders' },
        selections: [{ kind: 'wildcard' }],
        filters: [],
        groupBy: [],
        orderBy: [],
        joins: [],
        having: [],
      };

      const query: AbstractQuery = {
        source: { kind: 'subquery', query: subquery, alias: 'sub' },
        selections: [{ kind: 'wildcard' }],
        filters: [],
        groupBy: [],
        orderBy: [],
        limit: 100,
        joins: [],
        having: [],
      };

      const result = optimizer.optimize(query);
      expect(result.appliedOptimizations).toContain('limit-pushdown');

      if (result.query.source.kind === 'subquery') {
        expect(result.query.source.query.limit).toBe(100);
      }
    });

    it('should not push LIMIT when outer has filters', () => {
      const subquery: AbstractQuery = {
        source: { kind: 'table', table: 'orders' },
        selections: [{ kind: 'wildcard' }],
        filters: [],
        groupBy: [],
        orderBy: [],
        joins: [],
        having: [],
      };

      // Use a logical filter (OR) which canPushDown rejects,
      // so it remains in the outer query after filter pushdown.
      const query: AbstractQuery = {
        source: { kind: 'subquery', query: subquery, alias: 'sub' },
        selections: [{ kind: 'wildcard' }],
        filters: [{
          kind: 'logical',
          operator: 'or',
          conditions: [
            { kind: 'comparison', column: 'x', operator: 'eq', value: 1 },
            { kind: 'comparison', column: 'y', operator: 'eq', value: 2 },
          ],
        }],
        groupBy: [],
        orderBy: [],
        limit: 100,
        joins: [],
        having: [],
      };

      const result = optimizer.optimize(query);
      expect(result.appliedOptimizations).not.toContain('limit-pushdown');
    });

    it('should not push LIMIT when subquery has tighter limit', () => {
      const subquery: AbstractQuery = {
        source: { kind: 'table', table: 'orders' },
        selections: [{ kind: 'wildcard' }],
        filters: [],
        groupBy: [],
        orderBy: [],
        limit: 50,
        joins: [],
        having: [],
      };

      const query: AbstractQuery = {
        source: { kind: 'subquery', query: subquery, alias: 'sub' },
        selections: [{ kind: 'wildcard' }],
        filters: [],
        groupBy: [],
        orderBy: [],
        limit: 100,
        joins: [],
        having: [],
      };

      const result = optimizer.optimize(query);
      expect(result.appliedOptimizations).not.toContain('limit-pushdown');
    });

    it('should not push when outer has GROUP BY', () => {
      const subquery: AbstractQuery = {
        source: { kind: 'table', table: 'orders' },
        selections: [{ kind: 'wildcard' }],
        filters: [],
        groupBy: [],
        orderBy: [],
        joins: [],
        having: [],
      };

      const query: AbstractQuery = {
        source: { kind: 'subquery', query: subquery, alias: 'sub' },
        selections: [{ kind: 'wildcard' }],
        filters: [],
        groupBy: [{ kind: 'column', column: 'status' }],
        orderBy: [],
        limit: 100,
        joins: [],
        having: [],
      };

      const result = optimizer.optimize(query);
      expect(result.appliedOptimizations).not.toContain('limit-pushdown');
    });
  });

  // ── Deduplicate ORDER BY ──────────────────────────────────────

  describe('deduplicate ORDER BY', () => {
    it('should remove duplicate ORDER BY clauses', () => {
      const query = new QueryBuilder()
        .from('users')
        .orderBy('name', 'asc')
        .orderBy('name', 'asc') // duplicate
        .orderBy('id', 'desc')
        .build();

      const result = optimizer.optimize(query);
      expect(result.appliedOptimizations).toContain('deduplicate-order-by');
      expect(result.query.orderBy).toHaveLength(2);
    });

    it('should keep different directions as separate', () => {
      const query = new QueryBuilder()
        .from('users')
        .orderBy('name', 'asc')
        .orderBy('name', 'desc')
        .build();

      const result = optimizer.optimize(query);
      expect(result.query.orderBy).toHaveLength(2);
    });
  });

  // ── Deduplicate GROUP BY ──────────────────────────────────────

  describe('deduplicate GROUP BY', () => {
    it('should remove duplicate GROUP BY columns', () => {
      const query = new QueryBuilder()
        .from('orders')
        .groupBy('status', 'status', 'region')
        .build();

      const result = optimizer.optimize(query);
      expect(result.appliedOptimizations).toContain('deduplicate-group-by');
      expect(result.query.groupBy).toHaveLength(2);
    });
  });

  // ── Options ───────────────────────────────────────────────────

  describe('option flags', () => {
    it('should skip disabled optimizations', () => {
      const opt = new QueryOptimizer({
        flattenLogical: false,
        simplifyConstants: false,
        mergeRedundantFilters: false,
        removeUnusedColumns: false,
        pushDownFilters: false,
        limitPushdown: false,
        deduplicateOrderBy: false,
        deduplicateGroupBy: false,
      });

      const query = new QueryBuilder()
        .from('users')
        .where('active', 'eq', true)
        .where('active', 'eq', true)
        .build();

      const result = opt.optimize(query);
      expect(result.appliedOptimizations).toHaveLength(0);
      expect(result.query.filters).toHaveLength(2);
    });
  });

  // ── No-op ─────────────────────────────────────────────────────

  describe('no-op on clean queries', () => {
    it('should return unchanged query when no optimizations apply', () => {
      const query = new QueryBuilder()
        .from('users')
        .select('id', 'name')
        .where('active', 'eq', true)
        .orderBy('name')
        .limit(10)
        .build();

      const result = optimizer.optimize(query);
      expect(result.transformationCount).toBe(0);
    });
  });
});

// ── Convenience functions ───────────────────────────────────────────

describe('optimizeQuery()', () => {
  it('should be a shortcut for default optimizer', () => {
    const query = new QueryBuilder()
      .from('users')
      .where('active', 'eq', true)
      .where('active', 'eq', true)
      .build();

    const result = optimizeQuery(query);
    expect(result.query.filters).toHaveLength(1);
  });
});
