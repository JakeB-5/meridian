// ── QueryBuilder Tests ──────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { QueryBuilder, comparison, and, or, not } from './query-builder.js';
import type { Filter } from './abstract-query.js';

describe('QueryBuilder', () => {
  // ── Basic construction ──────────────────────────────────────────

  describe('from()', () => {
    it('should set a table source', () => {
      const query = new QueryBuilder().from('users').build();
      expect(query.source).toEqual({ kind: 'table', table: 'users', schema: undefined, alias: undefined });
    });

    it('should set table with schema', () => {
      const query = new QueryBuilder().from('users', 'public').build();
      expect(query.source).toEqual({ kind: 'table', table: 'users', schema: 'public', alias: undefined });
    });

    it('should set table with schema and alias', () => {
      const query = new QueryBuilder().from('users', 'public', 'u').build();
      expect(query.source).toEqual({ kind: 'table', table: 'users', schema: 'public', alias: 'u' });
    });
  });

  describe('fromSubquery()', () => {
    it('should set a subquery source', () => {
      const inner = new QueryBuilder().from('orders').select('user_id').build();
      const query = new QueryBuilder().fromSubquery(inner, 'sub').build();
      expect(query.source.kind).toBe('subquery');
      if (query.source.kind === 'subquery') {
        expect(query.source.alias).toBe('sub');
        expect(query.source.query).toBe(inner);
      }
    });
  });

  describe('build() without from()', () => {
    it('should throw when no source is set', () => {
      expect(() => new QueryBuilder().build()).toThrow('source is required');
    });
  });

  // ── SELECT ────────────────────────────────────────────────────

  describe('select()', () => {
    it('should add column selections', () => {
      const query = new QueryBuilder().from('users').select('id', 'name', 'email').build();
      expect(query.selections).toHaveLength(3);
      expect(query.selections[0]).toEqual({ kind: 'column', column: 'id' });
      expect(query.selections[1]).toEqual({ kind: 'column', column: 'name' });
      expect(query.selections[2]).toEqual({ kind: 'column', column: 'email' });
    });

    it('should allow chaining multiple select calls', () => {
      const query = new QueryBuilder()
        .from('users')
        .select('id')
        .select('name')
        .build();
      expect(query.selections).toHaveLength(2);
    });
  });

  describe('selectAs()', () => {
    it('should add aliased column selection', () => {
      const query = new QueryBuilder().from('users').selectAs('first_name', 'name').build();
      expect(query.selections[0]).toEqual({ kind: 'column', column: 'first_name', alias: 'name', table: undefined });
    });

    it('should support table-scoped aliased column', () => {
      const query = new QueryBuilder().from('users').selectAs('id', 'user_id', 'u').build();
      expect(query.selections[0]).toEqual({ kind: 'column', column: 'id', alias: 'user_id', table: 'u' });
    });
  });

  describe('selectAll()', () => {
    it('should add wildcard selection', () => {
      const query = new QueryBuilder().from('users').selectAll().build();
      expect(query.selections[0]).toEqual({ kind: 'wildcard', table: undefined });
    });

    it('should add table-scoped wildcard', () => {
      const query = new QueryBuilder().from('users').selectAll('u').build();
      expect(query.selections[0]).toEqual({ kind: 'wildcard', table: 'u' });
    });
  });

  describe('selectRaw()', () => {
    it('should add raw expression selection', () => {
      const query = new QueryBuilder().from('users').selectRaw('COUNT(*)', 'total').build();
      expect(query.selections[0]).toEqual({ kind: 'raw', expression: 'COUNT(*)', alias: 'total' });
    });

    it('should add raw expression without alias', () => {
      const query = new QueryBuilder().from('users').selectRaw('1 + 1').build();
      expect(query.selections[0]).toEqual({ kind: 'raw', expression: '1 + 1', alias: undefined });
    });
  });

  describe('aggregate()', () => {
    it('should add aggregate selection', () => {
      const query = new QueryBuilder().from('orders').aggregate('sum', 'amount', 'total').build();
      expect(query.selections[0]).toEqual({
        kind: 'aggregate', fn: 'sum', column: 'amount', alias: 'total', table: undefined,
      });
    });

    it('should support count(*)', () => {
      const query = new QueryBuilder().from('users').aggregate('count', '*', 'cnt').build();
      expect(query.selections[0]).toEqual({
        kind: 'aggregate', fn: 'count', column: '*', alias: 'cnt', table: undefined,
      });
    });

    it('should support count_distinct', () => {
      const query = new QueryBuilder().from('orders').aggregate('count_distinct', 'user_id', 'unique_users').build();
      expect(query.selections[0]).toEqual({
        kind: 'aggregate', fn: 'count_distinct', column: 'user_id', alias: 'unique_users', table: undefined,
      });
    });

    it('should support all aggregation types', () => {
      const types = ['count', 'sum', 'avg', 'min', 'max', 'count_distinct'] as const;
      for (const fn of types) {
        const query = new QueryBuilder().from('t').aggregate(fn, 'col').build();
        expect(query.selections[0]).toHaveProperty('fn', fn);
      }
    });
  });

  describe('distinct()', () => {
    it('should enable DISTINCT', () => {
      const query = new QueryBuilder().from('users').select('name').distinct().build();
      expect(query.distinct).toBe(true);
    });

    it('should disable DISTINCT when passed false', () => {
      const query = new QueryBuilder().from('users').select('name').distinct(false).build();
      expect(query.distinct).toBeUndefined();
    });
  });

  // ── WHERE ─────────────────────────────────────────────────────

  describe('where()', () => {
    it('should add a comparison filter', () => {
      const query = new QueryBuilder().from('users').where('active', 'eq', true).build();
      expect(query.filters).toHaveLength(1);
      expect(query.filters[0]).toEqual({
        kind: 'comparison', column: 'active', operator: 'eq', value: true,
      });
    });

    it('should chain multiple where clauses', () => {
      const query = new QueryBuilder()
        .from('users')
        .where('active', 'eq', true)
        .where('age', 'gte', 18)
        .build();
      expect(query.filters).toHaveLength(2);
    });

    it('should handle is_null without value', () => {
      const query = new QueryBuilder().from('users').where('deleted_at', 'is_null').build();
      expect(query.filters[0]).toEqual({
        kind: 'comparison', column: 'deleted_at', operator: 'is_null', value: undefined,
      });
    });

    it('should handle in operator with array value', () => {
      const query = new QueryBuilder().from('users').where('role', 'in', ['admin', 'mod']).build();
      expect(query.filters[0]).toEqual({
        kind: 'comparison', column: 'role', operator: 'in', value: ['admin', 'mod'],
      });
    });

    it('should handle between operator', () => {
      const query = new QueryBuilder().from('users').where('age', 'between', [18, 65]).build();
      expect(query.filters[0]).toEqual({
        kind: 'comparison', column: 'age', operator: 'between', value: [18, 65],
      });
    });
  });

  describe('whereTable()', () => {
    it('should add a table-scoped filter', () => {
      const query = new QueryBuilder().from('users').whereTable('u', 'id', 'eq', 1).build();
      expect(query.filters[0]).toEqual({
        kind: 'comparison', column: 'id', table: 'u', operator: 'eq', value: 1,
      });
    });
  });

  describe('whereAnd()', () => {
    it('should combine filters with AND', () => {
      const f1: Filter = { kind: 'comparison', column: 'a', operator: 'eq', value: 1 };
      const f2: Filter = { kind: 'comparison', column: 'b', operator: 'eq', value: 2 };
      const query = new QueryBuilder().from('t').whereAnd(f1, f2).build();
      expect(query.filters[0]).toEqual({ kind: 'logical', operator: 'and', conditions: [f1, f2] });
    });

    it('should unwrap single filter', () => {
      const f1: Filter = { kind: 'comparison', column: 'a', operator: 'eq', value: 1 };
      const query = new QueryBuilder().from('t').whereAnd(f1).build();
      expect(query.filters[0]).toBe(f1);
    });

    it('should handle empty filters', () => {
      const query = new QueryBuilder().from('t').whereAnd().build();
      expect(query.filters).toHaveLength(0);
    });
  });

  describe('whereOr()', () => {
    it('should combine filters with OR', () => {
      const f1: Filter = { kind: 'comparison', column: 'a', operator: 'eq', value: 1 };
      const f2: Filter = { kind: 'comparison', column: 'b', operator: 'eq', value: 2 };
      const query = new QueryBuilder().from('t').whereOr(f1, f2).build();
      expect(query.filters[0]).toEqual({ kind: 'logical', operator: 'or', conditions: [f1, f2] });
    });
  });

  describe('whereNot()', () => {
    it('should add a NOT filter', () => {
      const f1: Filter = { kind: 'comparison', column: 'deleted', operator: 'eq', value: true };
      const query = new QueryBuilder().from('t').whereNot(f1).build();
      expect(query.filters[0]).toEqual({ kind: 'not', condition: f1 });
    });
  });

  describe('whereRaw()', () => {
    it('should add a raw filter', () => {
      const query = new QueryBuilder().from('t').whereRaw('x > 5', [5]).build();
      expect(query.filters[0]).toEqual({ kind: 'raw', expression: 'x > 5', params: [5] });
    });
  });

  // ── GROUP BY ──────────────────────────────────────────────────

  describe('groupBy()', () => {
    it('should add group by columns', () => {
      const query = new QueryBuilder().from('orders').groupBy('status', 'region').build();
      expect(query.groupBy).toHaveLength(2);
      expect(query.groupBy[0]).toEqual({ kind: 'column', column: 'status' });
      expect(query.groupBy[1]).toEqual({ kind: 'column', column: 'region' });
    });
  });

  describe('groupByTable()', () => {
    it('should add table-scoped group by', () => {
      const query = new QueryBuilder().from('orders').groupByTable('o', 'status').build();
      expect(query.groupBy[0]).toEqual({ kind: 'column', column: 'status', table: 'o' });
    });
  });

  describe('groupByRaw()', () => {
    it('should add raw group by', () => {
      const query = new QueryBuilder().from('orders').groupByRaw('YEAR(created_at)').build();
      expect(query.groupBy[0]).toEqual({ kind: 'raw', expression: 'YEAR(created_at)' });
    });
  });

  // ── ORDER BY ──────────────────────────────────────────────────

  describe('orderBy()', () => {
    it('should add order by clause', () => {
      const query = new QueryBuilder().from('users').orderBy('name', 'asc').build();
      expect(query.orderBy[0]).toEqual({ kind: 'column', column: 'name', direction: 'asc', nulls: undefined });
    });

    it('should default to asc', () => {
      const query = new QueryBuilder().from('users').orderBy('name').build();
      expect(query.orderBy[0]).toHaveProperty('direction', 'asc');
    });

    it('should support desc', () => {
      const query = new QueryBuilder().from('users').orderBy('created_at', 'desc').build();
      expect(query.orderBy[0]).toHaveProperty('direction', 'desc');
    });

    it('should support NULLS FIRST/LAST', () => {
      const query = new QueryBuilder().from('users').orderBy('score', 'desc', 'last').build();
      expect(query.orderBy[0]).toHaveProperty('nulls', 'last');
    });
  });

  describe('orderByTable()', () => {
    it('should add table-scoped order by', () => {
      const query = new QueryBuilder().from('users').orderByTable('u', 'name', 'asc').build();
      expect(query.orderBy[0]).toEqual({ kind: 'column', column: 'name', table: 'u', direction: 'asc', nulls: undefined });
    });
  });

  describe('orderByRaw()', () => {
    it('should add raw order by', () => {
      const query = new QueryBuilder().from('users').orderByRaw('RANDOM()', 'asc').build();
      expect(query.orderBy[0]).toEqual({ kind: 'raw', expression: 'RANDOM()', direction: 'asc' });
    });
  });

  // ── LIMIT / OFFSET ────────────────────────────────────────────

  describe('limit()', () => {
    it('should set limit', () => {
      const query = new QueryBuilder().from('users').limit(10).build();
      expect(query.limit).toBe(10);
    });

    it('should allow limit of 0', () => {
      const query = new QueryBuilder().from('users').limit(0).build();
      expect(query.limit).toBe(0);
    });

    it('should throw on negative limit', () => {
      expect(() => new QueryBuilder().from('users').limit(-1)).toThrow('non-negative');
    });
  });

  describe('offset()', () => {
    it('should set offset', () => {
      const query = new QueryBuilder().from('users').offset(20).build();
      expect(query.offset).toBe(20);
    });

    it('should allow offset of 0', () => {
      const query = new QueryBuilder().from('users').offset(0).build();
      expect(query.offset).toBe(0);
    });

    it('should throw on negative offset', () => {
      expect(() => new QueryBuilder().from('users').offset(-1)).toThrow('non-negative');
    });
  });

  // ── JOIN ──────────────────────────────────────────────────────

  describe('join()', () => {
    it('should add a join clause', () => {
      const query = new QueryBuilder()
        .from('users')
        .join('inner', 'orders', { leftColumn: 'id', rightColumn: 'user_id' })
        .build();
      expect(query.joins).toHaveLength(1);
      expect(query.joins[0].type).toBe('inner');
      expect(query.joins[0].table).toBe('orders');
      expect(query.joins[0].conditions).toHaveLength(1);
    });

    it('should support multiple join conditions', () => {
      const query = new QueryBuilder()
        .from('a')
        .join('inner', 'b', [
          { leftColumn: 'x', rightColumn: 'y' },
          { leftColumn: 'p', rightColumn: 'q' },
        ])
        .build();
      expect(query.joins[0].conditions).toHaveLength(2);
    });

    it('should support join with schema and alias', () => {
      const query = new QueryBuilder()
        .from('users')
        .join('left', 'orders', { leftColumn: 'id', rightColumn: 'user_id' }, { schema: 'public', alias: 'o' })
        .build();
      expect(query.joins[0].schema).toBe('public');
      expect(query.joins[0].alias).toBe('o');
    });
  });

  describe('innerJoin()', () => {
    it('should add INNER JOIN shorthand', () => {
      const query = new QueryBuilder()
        .from('users')
        .innerJoin('orders', 'id', 'user_id', 'o')
        .build();
      expect(query.joins[0].type).toBe('inner');
      expect(query.joins[0].alias).toBe('o');
    });
  });

  describe('leftJoin()', () => {
    it('should add LEFT JOIN shorthand', () => {
      const query = new QueryBuilder()
        .from('users')
        .leftJoin('orders', 'id', 'user_id')
        .build();
      expect(query.joins[0].type).toBe('left');
    });
  });

  describe('rightJoin()', () => {
    it('should add RIGHT JOIN shorthand', () => {
      const query = new QueryBuilder()
        .from('users')
        .rightJoin('orders', 'id', 'user_id')
        .build();
      expect(query.joins[0].type).toBe('right');
    });
  });

  describe('fullJoin()', () => {
    it('should add FULL OUTER JOIN shorthand', () => {
      const query = new QueryBuilder()
        .from('users')
        .fullJoin('orders', 'id', 'user_id')
        .build();
      expect(query.joins[0].type).toBe('full');
    });
  });

  describe('crossJoin()', () => {
    it('should add CROSS JOIN', () => {
      const query = new QueryBuilder()
        .from('users')
        .crossJoin('settings')
        .build();
      expect(query.joins[0].type).toBe('cross');
      expect(query.joins[0].conditions).toHaveLength(0);
    });
  });

  // ── HAVING ────────────────────────────────────────────────────

  describe('having()', () => {
    it('should add having filter', () => {
      const query = new QueryBuilder()
        .from('orders')
        .groupBy('user_id')
        .having('total', 'gt', 100)
        .build();
      expect(query.having).toHaveLength(1);
      expect(query.having[0]).toEqual({
        kind: 'comparison', column: 'total', operator: 'gt', value: 100,
      });
    });
  });

  describe('havingRaw()', () => {
    it('should add raw having', () => {
      const query = new QueryBuilder()
        .from('orders')
        .groupBy('user_id')
        .havingRaw('COUNT(*) > 5', [5])
        .build();
      expect(query.having[0]).toEqual({ kind: 'raw', expression: 'COUNT(*) > 5', params: [5] });
    });
  });

  // ── Utility methods ───────────────────────────────────────────

  describe('reset()', () => {
    it('should reset builder to initial state', () => {
      const builder = new QueryBuilder()
        .from('users')
        .select('id')
        .where('active', 'eq', true)
        .limit(10);

      builder.reset();

      expect(() => builder.build()).toThrow('source is required');
    });
  });

  describe('clone()', () => {
    it('should create an independent copy', () => {
      const original = new QueryBuilder()
        .from('users')
        .select('id', 'name')
        .where('active', 'eq', true);

      const cloned = original.clone();
      cloned.select('email');

      const origQuery = original.build();
      const clonedQuery = cloned.build();

      expect(origQuery.selections).toHaveLength(2);
      expect(clonedQuery.selections).toHaveLength(3);
    });
  });

  // ── Complex query ─────────────────────────────────────────────

  describe('complex query construction', () => {
    it('should build a complete aggregation query with joins', () => {
      const query = new QueryBuilder()
        .from('orders', 'public', 'o')
        .select('status')
        .aggregate('sum', 'amount', 'total_amount')
        .aggregate('count', '*', 'order_count')
        .innerJoin('users', 'user_id', 'id', 'u')
        .where('status', 'neq', 'cancelled')
        .whereTable('u', 'active', 'eq', true)
        .groupBy('status')
        .having('total_amount', 'gt', 1000)
        .orderBy('total_amount', 'desc')
        .limit(10)
        .offset(0)
        .build();

      expect(query.source).toEqual({ kind: 'table', table: 'orders', schema: 'public', alias: 'o' });
      expect(query.selections).toHaveLength(3);
      expect(query.joins).toHaveLength(1);
      expect(query.filters).toHaveLength(2);
      expect(query.groupBy).toHaveLength(1);
      expect(query.having).toHaveLength(1);
      expect(query.orderBy).toHaveLength(1);
      expect(query.limit).toBe(10);
      expect(query.offset).toBe(0);
    });
  });
});

// ── Filter helper tests ─────────────────────────────────────────────

describe('Filter helpers', () => {
  describe('comparison()', () => {
    it('should create a comparison filter', () => {
      const f = comparison('age', 'gte', 18);
      expect(f).toEqual({ kind: 'comparison', column: 'age', operator: 'gte', value: 18, table: undefined });
    });

    it('should support table scope', () => {
      const f = comparison('id', 'eq', 1, 'u');
      expect(f).toEqual({ kind: 'comparison', column: 'id', operator: 'eq', value: 1, table: 'u' });
    });
  });

  describe('and()', () => {
    it('should create AND logical filter', () => {
      const f = and(
        comparison('a', 'eq', 1),
        comparison('b', 'eq', 2),
      );
      expect(f.kind).toBe('logical');
      if (f.kind === 'logical') {
        expect(f.operator).toBe('and');
        expect(f.conditions).toHaveLength(2);
      }
    });

    it('should unwrap single condition', () => {
      const inner = comparison('a', 'eq', 1);
      const f = and(inner);
      expect(f).toBe(inner);
    });

    it('should throw on empty', () => {
      expect(() => and()).toThrow('at least one');
    });
  });

  describe('or()', () => {
    it('should create OR logical filter', () => {
      const f = or(
        comparison('role', 'eq', 'admin'),
        comparison('role', 'eq', 'mod'),
      );
      expect(f.kind).toBe('logical');
      if (f.kind === 'logical') {
        expect(f.operator).toBe('or');
      }
    });
  });

  describe('not()', () => {
    it('should create NOT filter', () => {
      const f = not(comparison('deleted', 'eq', true));
      expect(f.kind).toBe('not');
    });
  });

  describe('nested filters', () => {
    it('should support deeply nested filters', () => {
      const f = and(
        comparison('active', 'eq', true),
        or(
          comparison('role', 'eq', 'admin'),
          and(
            comparison('role', 'eq', 'user'),
            comparison('verified', 'eq', true),
          ),
        ),
      );

      expect(f.kind).toBe('logical');
      if (f.kind === 'logical') {
        expect(f.conditions).toHaveLength(2);
        expect(f.conditions[1].kind).toBe('logical');
      }
    });
  });
});
