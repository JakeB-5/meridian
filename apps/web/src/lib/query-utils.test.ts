import { describe, it, expect } from 'vitest';
import {
  isValidVisualQuery,
  isValidFilter,
  cleanVisualQuery,
  createEmptyVisualQuery,
  describeVisualQuery,
  suggestChartType,
  parseSqlBasicInfo,
  ensureSqlLimit,
  categorizeColumns,
} from './query-utils';
import type { VisualQuery, FilterClause } from '@meridian/shared';

describe('isValidVisualQuery', () => {
  it('should return false for empty dataSourceId', () => {
    expect(
      isValidVisualQuery({
        dataSourceId: '',
        table: 'users',
        columns: [],
        filters: [],
        sorts: [],
        aggregations: [],
        groupBy: [],
      }),
    ).toBe(false);
  });

  it('should return false for empty table', () => {
    expect(
      isValidVisualQuery({
        dataSourceId: 'ds-1',
        table: '',
        columns: [],
        filters: [],
        sorts: [],
        aggregations: [],
        groupBy: [],
      }),
    ).toBe(false);
  });

  it('should return true for valid minimal query', () => {
    expect(
      isValidVisualQuery({
        dataSourceId: 'ds-1',
        table: 'users',
        columns: [],
        filters: [],
        sorts: [],
        aggregations: [],
        groupBy: [],
      }),
    ).toBe(true);
  });
});

describe('isValidFilter', () => {
  it('should accept is_null without value', () => {
    expect(isValidFilter({ column: 'name', operator: 'is_null', value: null })).toBe(true);
  });

  it('should accept is_not_null without value', () => {
    expect(isValidFilter({ column: 'name', operator: 'is_not_null', value: null })).toBe(true);
  });

  it('should reject eq without value', () => {
    expect(isValidFilter({ column: 'name', operator: 'eq', value: '' })).toBe(false);
  });

  it('should accept eq with value', () => {
    expect(isValidFilter({ column: 'name', operator: 'eq', value: 'test' })).toBe(true);
  });

  it('should reject filter without column', () => {
    expect(isValidFilter({ column: '', operator: 'eq', value: 'test' })).toBe(false);
  });
});

describe('cleanVisualQuery', () => {
  it('should remove invalid filters', () => {
    const query: VisualQuery = {
      dataSourceId: 'ds-1',
      table: 'users',
      columns: ['name', ''],
      filters: [
        { column: 'name', operator: 'eq', value: 'test' },
        { column: '', operator: 'eq', value: 'bad' },
      ],
      sorts: [
        { column: 'name', direction: 'asc' },
        { column: '', direction: 'asc' },
      ],
      aggregations: [],
      groupBy: ['name', ''],
    };

    const cleaned = cleanVisualQuery(query);
    expect(cleaned.columns).toEqual(['name']);
    expect(cleaned.filters).toHaveLength(1);
    expect(cleaned.sorts).toHaveLength(1);
    expect(cleaned.groupBy).toEqual(['name']);
  });
});

describe('createEmptyVisualQuery', () => {
  it('should create query with correct dataSourceId', () => {
    const query = createEmptyVisualQuery('ds-42');
    expect(query.dataSourceId).toBe('ds-42');
    expect(query.table).toBe('');
    expect(query.columns).toEqual([]);
    expect(query.limit).toBe(1000);
  });
});

describe('describeVisualQuery', () => {
  it('should describe a simple SELECT *', () => {
    const desc = describeVisualQuery({
      dataSourceId: 'ds-1',
      table: 'users',
      columns: [],
      filters: [],
      sorts: [],
      aggregations: [],
      groupBy: [],
    });
    expect(desc).toContain('SELECT *');
    expect(desc).toContain('FROM users');
  });

  it('should describe query with columns', () => {
    const desc = describeVisualQuery({
      dataSourceId: 'ds-1',
      table: 'users',
      columns: ['name', 'email'],
      filters: [],
      sorts: [],
      aggregations: [],
      groupBy: [],
    });
    expect(desc).toContain('SELECT name, email');
  });

  it('should describe query with aggregations', () => {
    const desc = describeVisualQuery({
      dataSourceId: 'ds-1',
      table: 'orders',
      columns: [],
      filters: [],
      sorts: [],
      aggregations: [{ column: 'total', aggregation: 'sum', alias: 'revenue' }],
      groupBy: ['status'],
    });
    expect(desc).toContain('sum(total) as revenue');
    expect(desc).toContain('GROUP BY status');
  });

  it('should include WHERE, ORDER BY, LIMIT', () => {
    const desc = describeVisualQuery({
      dataSourceId: 'ds-1',
      table: 'users',
      columns: ['name'],
      filters: [{ column: 'status', operator: 'eq', value: 'active' }],
      sorts: [{ column: 'name', direction: 'asc' }],
      aggregations: [],
      groupBy: [],
      limit: 100,
    });
    expect(desc).toContain('WHERE');
    expect(desc).toContain('ORDER BY name ASC');
    expect(desc).toContain('LIMIT 100');
  });
});

describe('suggestChartType', () => {
  it('should suggest number for aggregation without group by', () => {
    expect(
      suggestChartType({
        dataSourceId: 'ds-1',
        table: 'orders',
        columns: [],
        filters: [],
        sorts: [],
        aggregations: [{ column: 'total', aggregation: 'sum' }],
        groupBy: [],
      }),
    ).toBe('number');
  });

  it('should suggest bar for one group by', () => {
    expect(
      suggestChartType({
        dataSourceId: 'ds-1',
        table: 'orders',
        columns: [],
        filters: [],
        sorts: [],
        aggregations: [{ column: 'total', aggregation: 'sum' }],
        groupBy: ['status'],
      }),
    ).toBe('bar');
  });

  it('should suggest line for date group by', () => {
    expect(
      suggestChartType({
        dataSourceId: 'ds-1',
        table: 'orders',
        columns: [],
        filters: [],
        sorts: [],
        aggregations: [{ column: 'total', aggregation: 'sum' }],
        groupBy: ['created_date'],
      }),
    ).toBe('line');
  });

  it('should suggest table for raw data', () => {
    expect(
      suggestChartType({
        dataSourceId: 'ds-1',
        table: 'users',
        columns: ['name'],
        filters: [],
        sorts: [],
        aggregations: [],
        groupBy: [],
      }),
    ).toBe('table');
  });
});

describe('parseSqlBasicInfo', () => {
  it('should detect SELECT', () => {
    const info = parseSqlBasicInfo('SELECT * FROM users');
    expect(info.type).toBe('select');
    expect(info.hasLimit).toBe(false);
    expect(info.estimatedComplexity).toBe('simple');
  });

  it('should detect LIMIT', () => {
    const info = parseSqlBasicInfo('SELECT * FROM users LIMIT 10');
    expect(info.hasLimit).toBe(true);
  });

  it('should detect complex query', () => {
    const info = parseSqlBasicInfo(`
      WITH cte AS (SELECT * FROM orders)
      SELECT u.name, o.total
      FROM users u
      JOIN orders o ON u.id = o.user_id
      JOIN products p ON o.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE o.total > 100
    `);
    expect(info.estimatedComplexity).toBe('complex');
  });
});

describe('ensureSqlLimit', () => {
  it('should add LIMIT to query without one', () => {
    const result = ensureSqlLimit('SELECT * FROM users');
    expect(result).toContain('LIMIT 10000');
  });

  it('should not modify query with existing LIMIT', () => {
    const sql = 'SELECT * FROM users LIMIT 100';
    expect(ensureSqlLimit(sql)).toBe(sql);
  });

  it('should not add LIMIT to non-SELECT queries', () => {
    const sql = 'INSERT INTO users VALUES (1)';
    expect(ensureSqlLimit(sql)).toBe(sql);
  });
});

describe('categorizeColumns', () => {
  it('should categorize numeric, temporal, and categorical', () => {
    const result = categorizeColumns([
      { name: 'id', type: 'integer' },
      { name: 'total', type: 'numeric' },
      { name: 'created_at', type: 'timestamp' },
      { name: 'name', type: 'text' },
      { name: 'email', type: 'varchar' },
    ]);

    expect(result.numeric).toEqual(['id', 'total']);
    expect(result.temporal).toEqual(['created_at']);
    expect(result.categorical).toEqual(['name', 'email']);
  });
});
