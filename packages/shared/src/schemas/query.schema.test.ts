import { describe, it, expect } from 'vitest';
import { visualQuerySchema, filterClauseSchema, sortClauseSchema, aggregationClauseSchema } from './query.schema.js';

describe('filterClauseSchema', () => {
  it('validates a valid filter', () => {
    expect(filterClauseSchema.safeParse({ column: 'age', operator: 'gt', value: 18 }).success).toBe(true);
  });

  it('rejects empty column', () => {
    expect(filterClauseSchema.safeParse({ column: '', operator: 'eq', value: 1 }).success).toBe(false);
  });

  it('rejects invalid operator', () => {
    expect(filterClauseSchema.safeParse({ column: 'x', operator: 'invalid', value: 1 }).success).toBe(false);
  });

  it('accepts all filter operators', () => {
    const ops = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'like', 'not_like', 'is_null', 'is_not_null', 'between'];
    for (const op of ops) {
      expect(filterClauseSchema.safeParse({ column: 'c', operator: op, value: null }).success).toBe(true);
    }
  });
});

describe('sortClauseSchema', () => {
  it('validates asc and desc', () => {
    expect(sortClauseSchema.safeParse({ column: 'name', direction: 'asc' }).success).toBe(true);
    expect(sortClauseSchema.safeParse({ column: 'name', direction: 'desc' }).success).toBe(true);
  });

  it('rejects invalid direction', () => {
    expect(sortClauseSchema.safeParse({ column: 'name', direction: 'up' }).success).toBe(false);
  });
});

describe('aggregationClauseSchema', () => {
  it('validates a basic aggregation', () => {
    expect(aggregationClauseSchema.safeParse({ column: 'amount', aggregation: 'sum' }).success).toBe(true);
  });

  it('accepts alias', () => {
    const result = aggregationClauseSchema.safeParse({ column: 'amount', aggregation: 'avg', alias: 'avg_amount' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid aggregation type', () => {
    expect(aggregationClauseSchema.safeParse({ column: 'x', aggregation: 'median' }).success).toBe(false);
  });
});

describe('visualQuerySchema', () => {
  const validQuery = {
    dataSourceId: 'ds-1',
    table: 'orders',
    columns: ['id', 'amount'],
    filters: [{ column: 'status', operator: 'eq', value: 'active' }],
    sorts: [{ column: 'amount', direction: 'desc' }],
    aggregations: [{ column: 'amount', aggregation: 'sum', alias: 'total' }],
    groupBy: ['status'],
    limit: 100,
    offset: 0,
  };

  it('validates a complete visual query', () => {
    expect(visualQuerySchema.safeParse(validQuery).success).toBe(true);
  });

  it('requires dataSourceId', () => {
    const { dataSourceId: _, ...without } = validQuery;
    expect(visualQuerySchema.safeParse(without).success).toBe(false);
  });

  it('requires table', () => {
    expect(visualQuerySchema.safeParse({ ...validQuery, table: '' }).success).toBe(false);
  });

  it('validates limit range', () => {
    expect(visualQuerySchema.safeParse({ ...validQuery, limit: 0 }).success).toBe(false);
    expect(visualQuerySchema.safeParse({ ...validQuery, limit: 10_001 }).success).toBe(false);
    expect(visualQuerySchema.safeParse({ ...validQuery, limit: 500 }).success).toBe(true);
  });

  it('validates offset is non-negative', () => {
    expect(visualQuerySchema.safeParse({ ...validQuery, offset: -1 }).success).toBe(false);
  });

  it('allows empty arrays', () => {
    const minimal = {
      dataSourceId: 'ds-1',
      table: 'users',
      columns: [],
      filters: [],
      sorts: [],
      aggregations: [],
      groupBy: [],
    };
    expect(visualQuerySchema.safeParse(minimal).success).toBe(true);
  });
});
