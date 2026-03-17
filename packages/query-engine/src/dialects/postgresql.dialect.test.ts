// ── PostgreSQL Dialect Tests ─────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { PostgreSQLDialect } from './postgresql.dialect.js';

describe('PostgreSQLDialect', () => {
  const dialect = new PostgreSQLDialect();

  describe('name', () => {
    it('should be postgresql', () => {
      expect(dialect.name).toBe('postgresql');
    });
  });

  describe('quoteIdentifier()', () => {
    it('should wrap in double quotes', () => {
      expect(dialect.quoteIdentifier('users')).toBe('"users"');
    });

    it('should escape embedded double quotes', () => {
      expect(dialect.quoteIdentifier('my"table')).toBe('"my""table"');
    });

    it('should handle reserved words', () => {
      expect(dialect.quoteIdentifier('select')).toBe('"select"');
      expect(dialect.quoteIdentifier('order')).toBe('"order"');
    });

    it('should handle empty string', () => {
      expect(dialect.quoteIdentifier('')).toBe('""');
    });

    it('should handle identifiers with spaces', () => {
      expect(dialect.quoteIdentifier('my table')).toBe('"my table"');
    });
  });

  describe('quoteString()', () => {
    it('should wrap in single quotes', () => {
      expect(dialect.quoteString('hello')).toBe("'hello'");
    });

    it('should escape single quotes by doubling', () => {
      expect(dialect.quoteString("O'Brien")).toBe("'O''Brien'");
    });

    it('should handle multiple single quotes', () => {
      expect(dialect.quoteString("it's a 'test'")).toBe("'it''s a ''test'''");
    });

    it('should handle empty string', () => {
      expect(dialect.quoteString('')).toBe("''");
    });
  });

  describe('formatLimit()', () => {
    it('should format LIMIT only', () => {
      expect(dialect.formatLimit(10)).toBe('LIMIT 10');
    });

    it('should format LIMIT with OFFSET', () => {
      expect(dialect.formatLimit(10, 20)).toBe('LIMIT 10 OFFSET 20');
    });

    it('should ignore offset of 0', () => {
      expect(dialect.formatLimit(10, 0)).toBe('LIMIT 10');
    });
  });

  describe('formatBoolean()', () => {
    it('should format true as TRUE', () => {
      expect(dialect.formatBoolean(true)).toBe('TRUE');
    });

    it('should format false as FALSE', () => {
      expect(dialect.formatBoolean(false)).toBe('FALSE');
    });
  });

  describe('supportsReturning()', () => {
    it('should return true', () => {
      expect(dialect.supportsReturning()).toBe(true);
    });
  });

  describe('supportsWindowFunctions()', () => {
    it('should return true', () => {
      expect(dialect.supportsWindowFunctions()).toBe(true);
    });
  });

  describe('supportsCTE()', () => {
    it('should return true', () => {
      expect(dialect.supportsCTE()).toBe(true);
    });
  });

  describe('getParameterPlaceholder()', () => {
    it('should return $1 for index 0', () => {
      expect(dialect.getParameterPlaceholder(0)).toBe('$1');
    });

    it('should return $2 for index 1', () => {
      expect(dialect.getParameterPlaceholder(1)).toBe('$2');
    });

    it('should return $10 for index 9', () => {
      expect(dialect.getParameterPlaceholder(9)).toBe('$10');
    });
  });

  describe('getCastExpression()', () => {
    it('should generate CAST expression', () => {
      expect(dialect.getCastExpression('"col"', 'TEXT')).toBe('CAST("col" AS TEXT)');
    });

    it('should handle complex types', () => {
      expect(dialect.getCastExpression('"price"', 'NUMERIC(10,2)')).toBe('CAST("price" AS NUMERIC(10,2))');
    });
  });

  describe('getDateTruncExpression()', () => {
    it('should generate date_trunc for month', () => {
      expect(dialect.getDateTruncExpression('"created_at"', 'month')).toBe("date_trunc('month', \"created_at\")");
    });

    it('should generate date_trunc for year', () => {
      expect(dialect.getDateTruncExpression('"ts"', 'year')).toBe("date_trunc('year', \"ts\")");
    });

    it('should generate date_trunc for day', () => {
      expect(dialect.getDateTruncExpression('"ts"', 'day')).toBe("date_trunc('day', \"ts\")");
    });

    it('should generate date_trunc for hour', () => {
      expect(dialect.getDateTruncExpression('"ts"', 'hour')).toBe("date_trunc('hour', \"ts\")");
    });

    it('should generate date_trunc for quarter', () => {
      expect(dialect.getDateTruncExpression('"ts"', 'quarter')).toBe("date_trunc('quarter', \"ts\")");
    });

    it('should generate date_trunc for week', () => {
      expect(dialect.getDateTruncExpression('"ts"', 'week')).toBe("date_trunc('week', \"ts\")");
    });
  });

  describe('getDateDiffExpression()', () => {
    it('should generate EXTRACT EPOCH for seconds', () => {
      const result = dialect.getDateDiffExpression('"start"', '"end"', 'second');
      expect(result).toBe('EXTRACT(EPOCH FROM ("end" - "start"))');
    });

    it('should generate minute diff', () => {
      const result = dialect.getDateDiffExpression('"a"', '"b"', 'minute');
      expect(result).toContain('/ 60');
    });

    it('should generate hour diff', () => {
      const result = dialect.getDateDiffExpression('"a"', '"b"', 'hour');
      expect(result).toContain('/ 3600');
    });

    it('should generate day diff', () => {
      const result = dialect.getDateDiffExpression('"a"', '"b"', 'day');
      expect(result).toContain('/ 86400');
    });

    it('should generate month diff', () => {
      const result = dialect.getDateDiffExpression('"a"', '"b"', 'month');
      expect(result).toContain('EXTRACT(YEAR');
      expect(result).toContain('EXTRACT(MONTH');
    });

    it('should generate year diff', () => {
      const result = dialect.getDateDiffExpression('"a"', '"b"', 'year');
      expect(result).toContain('EXTRACT(YEAR');
    });
  });

  describe('getConcatExpression()', () => {
    it('should use || operator', () => {
      expect(dialect.getConcatExpression(['"a"', '"b"', '"c"'])).toBe('"a" || "b" || "c"');
    });
  });

  describe('formatTableRef()', () => {
    it('should format table without schema', () => {
      expect(dialect.formatTableRef('users')).toBe('"users"');
    });

    it('should format table with schema', () => {
      expect(dialect.formatTableRef('users', 'public')).toBe('"public"."users"');
    });
  });

  describe('getCurrentTimestamp()', () => {
    it('should return NOW()', () => {
      expect(dialect.getCurrentTimestamp()).toBe('NOW()');
    });
  });

  describe('getCoalesceExpression()', () => {
    it('should generate COALESCE', () => {
      expect(dialect.getCoalesceExpression(['"a"', '"b"', "'default'"])).toBe('COALESCE("a", "b", \'default\')');
    });
  });

  // PostgreSQL-specific methods

  describe('getGenerateSeriesExpression()', () => {
    it('should generate generate_series', () => {
      expect(dialect.getGenerateSeriesExpression('1', '10', '1')).toBe('generate_series(1, 10, 1)');
    });
  });

  describe('getIntervalExpression()', () => {
    it('should generate INTERVAL', () => {
      expect(dialect.getIntervalExpression(30, 'days')).toBe("INTERVAL '30 days'");
    });
  });

  describe('getArrayAggExpression()', () => {
    it('should generate array_agg', () => {
      expect(dialect.getArrayAggExpression('"name"')).toBe('array_agg("name")');
    });

    it('should generate array_agg with DISTINCT', () => {
      expect(dialect.getArrayAggExpression('"name"', true)).toBe('array_agg(DISTINCT "name")');
    });
  });

  describe('getJsonAggExpression()', () => {
    it('should generate json_agg', () => {
      expect(dialect.getJsonAggExpression('"row"')).toBe('json_agg("row")');
    });
  });

  describe('getStringAggExpression()', () => {
    it('should generate string_agg', () => {
      expect(dialect.getStringAggExpression('"name"', ', ')).toBe("string_agg(\"name\", ', ')");
    });
  });
});
