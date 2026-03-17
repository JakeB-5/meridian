// ── MySQL Dialect Tests ──────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { MySQLDialect } from './mysql.dialect.js';

describe('MySQLDialect', () => {
  const dialect = new MySQLDialect();

  describe('name', () => {
    it('should be mysql', () => {
      expect(dialect.name).toBe('mysql');
    });
  });

  describe('quoteIdentifier()', () => {
    it('should wrap in backticks', () => {
      expect(dialect.quoteIdentifier('users')).toBe('`users`');
    });

    it('should escape embedded backticks', () => {
      expect(dialect.quoteIdentifier('my`table')).toBe('`my``table`');
    });

    it('should handle reserved words', () => {
      expect(dialect.quoteIdentifier('select')).toBe('`select`');
      expect(dialect.quoteIdentifier('order')).toBe('`order`');
    });
  });

  describe('quoteString()', () => {
    it('should wrap in single quotes', () => {
      expect(dialect.quoteString('hello')).toBe("'hello'");
    });

    it('should escape single quotes', () => {
      expect(dialect.quoteString("O'Brien")).toBe("'O''Brien'");
    });
  });

  describe('formatLimit()', () => {
    it('should format LIMIT only', () => {
      expect(dialect.formatLimit(10)).toBe('LIMIT 10');
    });

    it('should format LIMIT with OFFSET', () => {
      expect(dialect.formatLimit(10, 20)).toBe('LIMIT 10 OFFSET 20');
    });
  });

  describe('formatBoolean()', () => {
    it('should format true as 1', () => {
      expect(dialect.formatBoolean(true)).toBe('1');
    });

    it('should format false as 0', () => {
      expect(dialect.formatBoolean(false)).toBe('0');
    });
  });

  describe('supportsReturning()', () => {
    it('should return false', () => {
      expect(dialect.supportsReturning()).toBe(false);
    });
  });

  describe('getParameterPlaceholder()', () => {
    it('should return ? for any index', () => {
      expect(dialect.getParameterPlaceholder(0)).toBe('?');
      expect(dialect.getParameterPlaceholder(1)).toBe('?');
      expect(dialect.getParameterPlaceholder(99)).toBe('?');
    });
  });

  describe('getDateTruncExpression()', () => {
    it('should generate DATE_FORMAT for month', () => {
      const result = dialect.getDateTruncExpression('`created_at`', 'month');
      expect(result).toContain('DATE_FORMAT');
      expect(result).toContain('%Y-%m-01');
    });

    it('should generate DATE_FORMAT for year', () => {
      const result = dialect.getDateTruncExpression('`ts`', 'year');
      expect(result).toContain('DATE_FORMAT');
      expect(result).toContain('%Y-01-01');
    });

    it('should generate DATE_FORMAT for day', () => {
      const result = dialect.getDateTruncExpression('`ts`', 'day');
      expect(result).toContain('%Y-%m-%d');
    });

    it('should generate DATE_FORMAT for hour', () => {
      const result = dialect.getDateTruncExpression('`ts`', 'hour');
      expect(result).toContain('%H:00:00');
    });

    it('should handle quarter truncation', () => {
      const result = dialect.getDateTruncExpression('`ts`', 'quarter');
      expect(result).toContain('QUARTER');
    });

    it('should handle week truncation', () => {
      const result = dialect.getDateTruncExpression('`ts`', 'week');
      expect(result).toContain('WEEKDAY');
    });
  });

  describe('getDateDiffExpression()', () => {
    it('should generate TIMESTAMPDIFF for seconds', () => {
      const result = dialect.getDateDiffExpression('`start`', '`end`', 'second');
      expect(result).toBe('TIMESTAMPDIFF(SECOND, `start`, `end`)');
    });

    it('should generate TIMESTAMPDIFF for days', () => {
      const result = dialect.getDateDiffExpression('`a`', '`b`', 'day');
      expect(result).toBe('TIMESTAMPDIFF(DAY, `a`, `b`)');
    });

    it('should generate TIMESTAMPDIFF for months', () => {
      const result = dialect.getDateDiffExpression('`a`', '`b`', 'month');
      expect(result).toBe('TIMESTAMPDIFF(MONTH, `a`, `b`)');
    });

    it('should generate TIMESTAMPDIFF for years', () => {
      const result = dialect.getDateDiffExpression('`a`', '`b`', 'year');
      expect(result).toBe('TIMESTAMPDIFF(YEAR, `a`, `b`)');
    });
  });

  describe('getConcatExpression()', () => {
    it('should use CONCAT function', () => {
      expect(dialect.getConcatExpression(['`a`', '`b`', '`c`'])).toBe('CONCAT(`a`, `b`, `c`)');
    });
  });

  describe('formatTableRef()', () => {
    it('should format table without schema', () => {
      expect(dialect.formatTableRef('users')).toBe('`users`');
    });

    it('should format table with schema', () => {
      expect(dialect.formatTableRef('users', 'mydb')).toBe('`mydb`.`users`');
    });
  });

  describe('getCurrentTimestamp()', () => {
    it('should return NOW()', () => {
      expect(dialect.getCurrentTimestamp()).toBe('NOW()');
    });
  });

  // MySQL-specific methods

  describe('getGroupConcatExpression()', () => {
    it('should generate GROUP_CONCAT', () => {
      expect(dialect.getGroupConcatExpression('`name`', ', ')).toBe("GROUP_CONCAT(`name` SEPARATOR ', ')");
    });

    it('should support DISTINCT', () => {
      const result = dialect.getGroupConcatExpression('`name`', ', ', true);
      expect(result).toContain('DISTINCT');
    });

    it('should support ORDER BY', () => {
      const result = dialect.getGroupConcatExpression('`name`', ', ', false, '`name` ASC');
      expect(result).toContain('ORDER BY');
    });
  });

  describe('getJsonArrayAggExpression()', () => {
    it('should generate JSON_ARRAYAGG', () => {
      expect(dialect.getJsonArrayAggExpression('`data`')).toBe('JSON_ARRAYAGG(`data`)');
    });
  });

  describe('getIfExpression()', () => {
    it('should generate IF', () => {
      expect(dialect.getIfExpression('x > 0', "'pos'", "'neg'")).toBe("IF(x > 0, 'pos', 'neg')");
    });
  });

  describe('getIfNullExpression()', () => {
    it('should generate IFNULL', () => {
      expect(dialect.getIfNullExpression('`col`', '0')).toBe('IFNULL(`col`, 0)');
    });
  });
});
