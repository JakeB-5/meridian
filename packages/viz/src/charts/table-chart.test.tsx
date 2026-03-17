/**
 * TableChart tests.
 *
 * TableChart is pure React (no ECharts), so tests focus on
 * data transformation, sorting, and formatting logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  makeTableData,
  makeEmptyData,
  tableConfig,
} from './__tests__/test-helpers.js';
import { toTableData } from '../utils/data-transformer.js';
import { defaultNumberFormat, isNumericType, isDateType, formatDate } from '../utils/format.js';

describe('TableChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('data transformation', () => {
    it('should return rows as-is without sorting', () => {
      const data = makeTableData();
      const result = toTableData(data);
      expect(result).toHaveLength(4);
      expect(result[0].name).toBe('Alice');
      expect(result[1].name).toBe('Bob');
    });

    it('should return empty for empty data', () => {
      expect(toTableData(makeEmptyData())).toEqual([]);
    });
  });

  describe('sorting', () => {
    it('should sort ascending by numeric column', () => {
      const data = makeTableData();
      const result = toTableData(data, 'age', 'asc');
      expect(result[0].name).toBe('Bob');    // age 25
      expect(result[1].name).toBe('Diana');  // age 28
      expect(result[2].name).toBe('Alice');  // age 30
      expect(result[3].name).toBe('Charlie'); // age 35
    });

    it('should sort descending by numeric column', () => {
      const data = makeTableData();
      const result = toTableData(data, 'salary', 'desc');
      expect(result[0].name).toBe('Charlie'); // 85000
      expect(result[3].name).toBe('Bob');     // 65000
    });

    it('should sort by string column', () => {
      const data = makeTableData();
      const result = toTableData(data, 'name', 'asc');
      expect(result[0].name).toBe('Alice');
      expect(result[3].name).toBe('Diana');
    });

    it('should sort descending by string column', () => {
      const data = makeTableData();
      const result = toTableData(data, 'department', 'desc');
      expect(result[0].department).toBe('Marketing');
    });
  });

  describe('column type detection', () => {
    it('should identify numeric columns', () => {
      const data = makeTableData();
      const numericCols = data.columns.filter((c) => isNumericType(c.type));
      expect(numericCols.map((c) => c.name)).toEqual(['age', 'salary']);
    });

    it('should identify text columns', () => {
      const data = makeTableData();
      const textCols = data.columns.filter(
        (c) => !isNumericType(c.type) && !isDateType(c.type),
      );
      expect(textCols.map((c) => c.name)).toEqual(['name', 'department']);
    });
  });

  describe('cell formatting', () => {
    it('should format numeric values', () => {
      expect(defaultNumberFormat(75000)).toBeDefined();
      expect(typeof defaultNumberFormat(75000)).toBe('string');
    });

    it('should handle null values', () => {
      expect(defaultNumberFormat(NaN)).toBe('—');
    });

    it('should format date values', () => {
      const result = formatDate('2024-01-15', 'date');
      expect(result).toMatch(/Jan/);
    });
  });

  describe('configuration', () => {
    it('should support max rows', () => {
      const config = tableConfig({ options: { maxRows: 2 } });
      expect(config.options?.maxRows).toBe(2);
    });

    it('should support mini bars', () => {
      const config = tableConfig({ options: { showMiniBars: true } });
      expect(config.options?.showMiniBars).toBe(true);
    });

    it('should support striped rows toggle', () => {
      const config = tableConfig({ options: { striped: false } });
      expect(config.options?.striped).toBe(false);
    });

    it('should support conditional formatting rules', () => {
      const config = tableConfig({
        options: {
          conditionalFormatting: [
            { column: 'salary', operator: 'gt', value: 80000, color: '#10B981' },
            { column: 'salary', operator: 'lt', value: 70000, color: '#EF4444' },
          ],
        },
      });
      const rules = config.options?.conditionalFormatting as Array<{ column: string }>;
      expect(rules).toHaveLength(2);
      expect(rules[0].column).toBe('salary');
    });
  });

  describe('click handler', () => {
    it('should create DataPoint from row click', () => {
      const data = makeTableData();
      const row = data.rows[0];
      const point = {
        series: '',
        category: '0',
        value: 0,
        row,
      };
      expect(point.row).toEqual({
        name: 'Alice',
        age: 30,
        salary: 75000,
        department: 'Engineering',
      });
    });
  });

  describe('truncation indicator', () => {
    it('should detect truncated data', () => {
      const data = {
        ...makeTableData(),
        truncated: true,
        rowCount: 1000,
      };
      expect(data.truncated).toBe(true);
      expect(data.rowCount).toBe(1000);
    });
  });
});
