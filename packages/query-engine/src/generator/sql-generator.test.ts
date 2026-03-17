// ── SQL Generator Tests ─────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { SQLGenerator } from './sql-generator.js';
import { PostgreSQLDialect } from '../dialects/postgresql.dialect.js';
import { MySQLDialect } from '../dialects/mysql.dialect.js';
import { SQLiteDialect } from '../dialects/sqlite.dialect.js';
import { ClickHouseDialect } from '../dialects/clickhouse.dialect.js';
import { DuckDBDialect } from '../dialects/duckdb.dialect.js';
import { QueryBuilder } from '../ir/query-builder.js';

// ── Helpers ─────────────────────────────────────────────────────────

function pgGen(options = {}): SQLGenerator {
  return new SQLGenerator(new PostgreSQLDialect(), options);
}

function mysqlGen(options = {}): SQLGenerator {
  return new SQLGenerator(new MySQLDialect(), options);
}

function sqliteGen(options = {}): SQLGenerator {
  return new SQLGenerator(new SQLiteDialect(), options);
}

function chGen(options = {}): SQLGenerator {
  return new SQLGenerator(new ClickHouseDialect(), options);
}

function duckGen(options = {}): SQLGenerator {
  return new SQLGenerator(new DuckDBDialect(), options);
}

// ── PostgreSQL ──────────────────────────────────────────────────────

describe('SQLGenerator with PostgreSQL', () => {
  const gen = pgGen();

  describe('SELECT', () => {
    it('should generate SELECT * from empty selections', () => {
      const query = new QueryBuilder().from('users').build();
      const { sql, params } = gen.generate(query);
      expect(sql).toBe('SELECT * FROM "users"');
      expect(params).toEqual([]);
    });

    it('should generate SELECT with specific columns', () => {
      const query = new QueryBuilder().from('users').select('id', 'name', 'email').build();
      const { sql } = gen.generate(query);
      expect(sql).toBe('SELECT "id", "name", "email" FROM "users"');
    });

    it('should generate SELECT with alias', () => {
      const query = new QueryBuilder().from('users').selectAs('first_name', 'name').build();
      const { sql } = gen.generate(query);
      expect(sql).toBe('SELECT "first_name" AS "name" FROM "users"');
    });

    it('should generate SELECT with table-scoped column', () => {
      const query = new QueryBuilder().from('users').selectAs('id', 'user_id', 'u').build();
      const { sql } = gen.generate(query);
      expect(sql).toBe('SELECT "u"."id" AS "user_id" FROM "users"');
    });

    it('should generate SELECT DISTINCT', () => {
      const query = new QueryBuilder().from('users').select('name').distinct().build();
      const { sql } = gen.generate(query);
      expect(sql).toBe('SELECT DISTINCT "name" FROM "users"');
    });

    it('should generate SELECT * with table scope', () => {
      const query = new QueryBuilder().from('users').selectAll('u').build();
      const { sql } = gen.generate(query);
      expect(sql).toBe('SELECT "u".* FROM "users"');
    });

    it('should generate SELECT with raw expression', () => {
      const query = new QueryBuilder().from('users').selectRaw('1 + 1', 'result').build();
      const { sql } = gen.generate(query);
      expect(sql).toBe('SELECT 1 + 1 AS "result" FROM "users"');
    });
  });

  describe('FROM', () => {
    it('should generate FROM with schema', () => {
      const query = new QueryBuilder().from('users', 'public').build();
      const { sql } = gen.generate(query);
      expect(sql).toBe('SELECT * FROM "public"."users"');
    });

    it('should generate FROM with alias', () => {
      const query = new QueryBuilder().from('users', undefined, 'u').build();
      const { sql } = gen.generate(query);
      expect(sql).toBe('SELECT * FROM "users" AS "u"');
    });

    it('should generate FROM with schema and alias', () => {
      const query = new QueryBuilder().from('users', 'public', 'u').build();
      const { sql } = gen.generate(query);
      expect(sql).toBe('SELECT * FROM "public"."users" AS "u"');
    });

    it('should generate FROM subquery', () => {
      const inner = new QueryBuilder().from('orders').select('user_id').build();
      const query = new QueryBuilder().fromSubquery(inner, 'sub').selectAll().build();
      const { sql } = gen.generate(query);
      expect(sql).toBe('SELECT * FROM (SELECT "user_id" FROM "orders") AS "sub"');
    });
  });

  describe('WHERE', () => {
    it('should generate WHERE with eq', () => {
      const query = new QueryBuilder().from('users').where('active', 'eq', true).build();
      const { sql, params } = gen.generate(query);
      expect(sql).toBe('SELECT * FROM "users" WHERE "active" = $1');
      expect(params).toEqual([true]);
    });

    it('should generate WHERE with neq', () => {
      const query = new QueryBuilder().from('users').where('status', 'neq', 'deleted').build();
      const { sql, params } = gen.generate(query);
      expect(sql).toBe('SELECT * FROM "users" WHERE "status" <> $1');
      expect(params).toEqual(['deleted']);
    });

    it('should generate WHERE with gt/gte/lt/lte', () => {
      const q1 = new QueryBuilder().from('t').where('a', 'gt', 1).build();
      expect(gen.generate(q1).sql).toContain('> $1');

      const q2 = new QueryBuilder().from('t').where('a', 'gte', 1).build();
      expect(gen.generate(q2).sql).toContain('>= $1');

      const q3 = new QueryBuilder().from('t').where('a', 'lt', 1).build();
      expect(gen.generate(q3).sql).toContain('< $1');

      const q4 = new QueryBuilder().from('t').where('a', 'lte', 1).build();
      expect(gen.generate(q4).sql).toContain('<= $1');
    });

    it('should generate WHERE with LIKE', () => {
      const query = new QueryBuilder().from('users').where('name', 'like', '%john%').build();
      const { sql, params } = gen.generate(query);
      expect(sql).toBe('SELECT * FROM "users" WHERE "name" LIKE $1');
      expect(params).toEqual(['%john%']);
    });

    it('should generate WHERE with NOT LIKE', () => {
      const query = new QueryBuilder().from('users').where('name', 'not_like', '%test%').build();
      const { sql } = gen.generate(query);
      expect(sql).toContain('NOT LIKE');
    });

    it('should generate WHERE with IN', () => {
      const query = new QueryBuilder().from('users').where('role', 'in', ['admin', 'mod']).build();
      const { sql, params } = gen.generate(query);
      expect(sql).toBe('SELECT * FROM "users" WHERE "role" IN ($1, $2)');
      expect(params).toEqual(['admin', 'mod']);
    });

    it('should generate WHERE with NOT IN', () => {
      const query = new QueryBuilder().from('users').where('role', 'not_in', ['banned']).build();
      const { sql, params } = gen.generate(query);
      expect(sql).toBe('SELECT * FROM "users" WHERE "role" NOT IN ($1)');
      expect(params).toEqual(['banned']);
    });

    it('should generate WHERE with empty IN as 1=0', () => {
      const query = new QueryBuilder().from('users').where('id', 'in', []).build();
      const { sql } = gen.generate(query);
      expect(sql).toContain('1 = 0');
    });

    it('should generate WHERE with empty NOT IN as 1=1', () => {
      const query = new QueryBuilder().from('users').where('id', 'not_in', []).build();
      const { sql } = gen.generate(query);
      expect(sql).toContain('1 = 1');
    });

    it('should generate WHERE with IS NULL', () => {
      const query = new QueryBuilder().from('users').where('deleted_at', 'is_null').build();
      const { sql, params } = gen.generate(query);
      expect(sql).toBe('SELECT * FROM "users" WHERE "deleted_at" IS NULL');
      expect(params).toEqual([]);
    });

    it('should generate WHERE with IS NOT NULL', () => {
      const query = new QueryBuilder().from('users').where('email', 'is_not_null').build();
      const { sql } = gen.generate(query);
      expect(sql).toContain('IS NOT NULL');
    });

    it('should generate WHERE with BETWEEN', () => {
      const query = new QueryBuilder().from('users').where('age', 'between', [18, 65]).build();
      const { sql, params } = gen.generate(query);
      expect(sql).toBe('SELECT * FROM "users" WHERE "age" BETWEEN $1 AND $2');
      expect(params).toEqual([18, 65]);
    });

    it('should throw on invalid BETWEEN value', () => {
      const query = new QueryBuilder().from('users').where('age', 'between', 18).build();
      expect(() => gen.generate(query)).toThrow('two-element array');
    });

    it('should AND multiple top-level filters', () => {
      const query = new QueryBuilder()
        .from('users')
        .where('active', 'eq', true)
        .where('age', 'gte', 18)
        .build();
      const { sql, params } = gen.generate(query);
      expect(sql).toBe('SELECT * FROM "users" WHERE "active" = $1 AND "age" >= $2');
      expect(params).toEqual([true, 18]);
    });

    it('should generate OR filter group', () => {
      const query = new QueryBuilder()
        .from('users')
        .whereOr(
          { kind: 'comparison', column: 'role', operator: 'eq', value: 'admin' },
          { kind: 'comparison', column: 'role', operator: 'eq', value: 'mod' },
        )
        .build();
      const { sql, params } = gen.generate(query);
      expect(sql).toBe('SELECT * FROM "users" WHERE ("role" = $1 OR "role" = $2)');
      expect(params).toEqual(['admin', 'mod']);
    });

    it('should generate NOT filter', () => {
      const query = new QueryBuilder()
        .from('users')
        .whereNot({ kind: 'comparison', column: 'deleted', operator: 'eq', value: true })
        .build();
      const { sql, params } = gen.generate(query);
      expect(sql).toBe('SELECT * FROM "users" WHERE NOT ("deleted" = $1)');
      expect(params).toEqual([true]);
    });

    it('should generate raw filter', () => {
      const query = new QueryBuilder()
        .from('users')
        .whereRaw('age > $1', [18])
        .build();
      const { sql, params } = gen.generate(query);
      expect(sql).toContain('age > $1');
      expect(params).toEqual([18]);
    });

    it('should handle table-scoped filters', () => {
      const query = new QueryBuilder()
        .from('users')
        .whereTable('u', 'active', 'eq', true)
        .build();
      const { sql } = gen.generate(query);
      expect(sql).toContain('"u"."active" = $1');
    });
  });

  describe('GROUP BY', () => {
    it('should generate GROUP BY', () => {
      const query = new QueryBuilder()
        .from('orders')
        .select('status')
        .aggregate('count', '*', 'cnt')
        .groupBy('status')
        .build();
      const { sql } = gen.generate(query);
      expect(sql).toBe('SELECT "status", COUNT(*) AS "cnt" FROM "orders" GROUP BY "status"');
    });

    it('should generate GROUP BY with multiple columns', () => {
      const query = new QueryBuilder()
        .from('orders')
        .groupBy('status', 'region')
        .build();
      const { sql } = gen.generate(query);
      expect(sql).toContain('GROUP BY "status", "region"');
    });

    it('should generate GROUP BY with raw expression', () => {
      const query = new QueryBuilder()
        .from('orders')
        .groupByRaw('YEAR("created_at")')
        .build();
      const { sql } = gen.generate(query);
      expect(sql).toContain('GROUP BY YEAR("created_at")');
    });
  });

  describe('HAVING', () => {
    it('should generate HAVING', () => {
      const query = new QueryBuilder()
        .from('orders')
        .groupBy('user_id')
        .having('total', 'gt', 100)
        .build();
      const { sql, params } = gen.generate(query);
      expect(sql).toContain('HAVING "total" > $1');
      expect(params).toEqual([100]);
    });
  });

  describe('ORDER BY', () => {
    it('should generate ORDER BY ASC', () => {
      const query = new QueryBuilder().from('users').orderBy('name', 'asc').build();
      const { sql } = gen.generate(query);
      expect(sql).toBe('SELECT * FROM "users" ORDER BY "name" ASC');
    });

    it('should generate ORDER BY DESC', () => {
      const query = new QueryBuilder().from('users').orderBy('created_at', 'desc').build();
      const { sql } = gen.generate(query);
      expect(sql).toContain('ORDER BY "created_at" DESC');
    });

    it('should generate ORDER BY with NULLS LAST', () => {
      const query = new QueryBuilder().from('users').orderBy('score', 'desc', 'last').build();
      const { sql } = gen.generate(query);
      expect(sql).toContain('ORDER BY "score" DESC NULLS LAST');
    });

    it('should generate ORDER BY with NULLS FIRST', () => {
      const query = new QueryBuilder().from('users').orderBy('score', 'asc', 'first').build();
      const { sql } = gen.generate(query);
      expect(sql).toContain('NULLS FIRST');
    });

    it('should generate ORDER BY with multiple columns', () => {
      const query = new QueryBuilder()
        .from('users')
        .orderBy('name', 'asc')
        .orderBy('id', 'desc')
        .build();
      const { sql } = gen.generate(query);
      expect(sql).toContain('ORDER BY "name" ASC, "id" DESC');
    });

    it('should generate ORDER BY with raw expression', () => {
      const query = new QueryBuilder().from('users').orderByRaw('RANDOM()', 'asc').build();
      const { sql } = gen.generate(query);
      expect(sql).toContain('ORDER BY RANDOM() ASC');
    });
  });

  describe('LIMIT / OFFSET', () => {
    it('should generate LIMIT', () => {
      const query = new QueryBuilder().from('users').limit(10).build();
      const { sql } = gen.generate(query);
      expect(sql).toBe('SELECT * FROM "users" LIMIT 10');
    });

    it('should generate LIMIT with OFFSET', () => {
      const query = new QueryBuilder().from('users').limit(10).offset(20).build();
      const { sql } = gen.generate(query);
      expect(sql).toBe('SELECT * FROM "users" LIMIT 10 OFFSET 20');
    });
  });

  describe('JOIN', () => {
    it('should generate INNER JOIN', () => {
      const query = new QueryBuilder()
        .from('users', undefined, 'u')
        .innerJoin('orders', 'id', 'user_id', 'o')
        .build();
      const { sql } = gen.generate(query);
      expect(sql).toBe('SELECT * FROM "users" AS "u" INNER JOIN "orders" AS "o" ON "id" = "o"."user_id"');
    });

    it('should generate LEFT JOIN', () => {
      const query = new QueryBuilder()
        .from('users')
        .leftJoin('orders', 'id', 'user_id', 'o')
        .build();
      const { sql } = gen.generate(query);
      expect(sql).toContain('LEFT JOIN "orders" AS "o"');
    });

    it('should generate RIGHT JOIN', () => {
      const query = new QueryBuilder()
        .from('users')
        .rightJoin('orders', 'id', 'user_id')
        .build();
      const { sql } = gen.generate(query);
      expect(sql).toContain('RIGHT JOIN');
    });

    it('should generate FULL OUTER JOIN', () => {
      const query = new QueryBuilder()
        .from('users')
        .fullJoin('orders', 'id', 'user_id')
        .build();
      const { sql } = gen.generate(query);
      expect(sql).toContain('FULL OUTER JOIN');
    });

    it('should generate CROSS JOIN', () => {
      const query = new QueryBuilder()
        .from('users')
        .crossJoin('settings')
        .build();
      const { sql } = gen.generate(query);
      expect(sql).toBe('SELECT * FROM "users" CROSS JOIN "settings"');
    });

    it('should generate JOIN with schema', () => {
      const query = new QueryBuilder()
        .from('users')
        .join('inner', 'orders', { leftColumn: 'id', rightColumn: 'user_id' }, { schema: 'public' })
        .build();
      const { sql } = gen.generate(query);
      expect(sql).toContain('"public"."orders"');
    });

    it('should generate JOIN with multiple conditions', () => {
      const query = new QueryBuilder()
        .from('a')
        .join('inner', 'b', [
          { leftColumn: 'x', rightColumn: 'y' },
          { leftColumn: 'p', rightColumn: 'q' },
        ], { alias: 'b1' })
        .build();
      const { sql } = gen.generate(query);
      expect(sql).toContain('ON "x" = "b1"."y" AND "p" = "b1"."q"');
    });

    it('should generate multiple JOINs', () => {
      const query = new QueryBuilder()
        .from('users', undefined, 'u')
        .innerJoin('orders', 'id', 'user_id', 'o')
        .leftJoin('payments', 'id', 'order_id', 'p')
        .build();
      const { sql } = gen.generate(query);
      expect(sql).toContain('INNER JOIN');
      expect(sql).toContain('LEFT JOIN');
    });
  });

  describe('Aggregation', () => {
    it('should generate COUNT(*)', () => {
      const query = new QueryBuilder().from('users').aggregate('count', '*', 'total').build();
      const { sql } = gen.generate(query);
      expect(sql).toBe('SELECT COUNT(*) AS "total" FROM "users"');
    });

    it('should generate COUNT(DISTINCT col)', () => {
      const query = new QueryBuilder().from('users').aggregate('count_distinct', 'email', 'unique_emails').build();
      const { sql } = gen.generate(query);
      expect(sql).toBe('SELECT COUNT(DISTINCT "email") AS "unique_emails" FROM "users"');
    });

    it('should generate SUM', () => {
      const query = new QueryBuilder().from('orders').aggregate('sum', 'amount', 'total').build();
      const { sql } = gen.generate(query);
      expect(sql).toBe('SELECT SUM("amount") AS "total" FROM "orders"');
    });

    it('should generate AVG', () => {
      const query = new QueryBuilder().from('orders').aggregate('avg', 'amount', 'average').build();
      const { sql } = gen.generate(query);
      expect(sql).toBe('SELECT AVG("amount") AS "average" FROM "orders"');
    });

    it('should generate MIN', () => {
      const query = new QueryBuilder().from('orders').aggregate('min', 'amount', 'minimum').build();
      const { sql } = gen.generate(query);
      expect(sql).toContain('MIN("amount")');
    });

    it('should generate MAX', () => {
      const query = new QueryBuilder().from('orders').aggregate('max', 'amount', 'maximum').build();
      const { sql } = gen.generate(query);
      expect(sql).toContain('MAX("amount")');
    });
  });

  describe('Complex queries', () => {
    it('should generate a full analytics query', () => {
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
        .build();

      const { sql, params } = gen.generate(query);

      expect(sql).toContain('SELECT "status", SUM("amount") AS "total_amount", COUNT(*) AS "order_count"');
      expect(sql).toContain('FROM "public"."orders" AS "o"');
      expect(sql).toContain('INNER JOIN "users" AS "u"');
      expect(sql).toContain('WHERE "status" <> $1 AND "u"."active" = $2');
      expect(sql).toContain('GROUP BY "status"');
      expect(sql).toContain('HAVING "total_amount" > $3');
      expect(sql).toContain('ORDER BY "total_amount" DESC');
      expect(sql).toContain('LIMIT 10');
      expect(params).toEqual(['cancelled', true, 1000]);
    });
  });

  describe('generateCount()', () => {
    it('should wrap query in COUNT subquery', () => {
      const query = new QueryBuilder()
        .from('users')
        .where('active', 'eq', true)
        .orderBy('name')
        .limit(10)
        .build();

      const { sql, params } = gen.generateCount(query);
      expect(sql).toContain('SELECT COUNT(*) AS "total_count"');
      expect(sql).toContain('FROM (');
      expect(sql).not.toContain('ORDER BY');
      expect(sql).not.toContain('LIMIT');
      expect(params).toEqual([true]);
    });
  });
});

// ── MySQL ───────────────────────────────────────────────────────────

describe('SQLGenerator with MySQL', () => {
  const gen = mysqlGen();

  it('should use backtick identifiers', () => {
    const query = new QueryBuilder().from('users').select('id', 'name').build();
    const { sql } = gen.generate(query);
    expect(sql).toBe('SELECT `id`, `name` FROM `users`');
  });

  it('should use ? parameter placeholders', () => {
    const query = new QueryBuilder().from('users').where('active', 'eq', true).build();
    const { sql, params } = gen.generate(query);
    expect(sql).toBe('SELECT * FROM `users` WHERE `active` = ?');
    expect(params).toEqual([true]);
  });

  it('should use ? for all parameters', () => {
    const query = new QueryBuilder()
      .from('users')
      .where('a', 'eq', 1)
      .where('b', 'eq', 2)
      .where('c', 'eq', 3)
      .build();
    const { sql, params } = gen.generate(query);
    expect(sql).toBe('SELECT * FROM `users` WHERE `a` = ? AND `b` = ? AND `c` = ?');
    expect(params).toEqual([1, 2, 3]);
  });

  it('should generate MySQL IN clause', () => {
    const query = new QueryBuilder().from('t').where('col', 'in', [1, 2, 3]).build();
    const { sql } = gen.generate(query);
    expect(sql).toBe('SELECT * FROM `t` WHERE `col` IN (?, ?, ?)');
  });

  it('should generate MySQL BETWEEN', () => {
    const query = new QueryBuilder().from('t').where('col', 'between', [1, 10]).build();
    const { sql } = gen.generate(query);
    expect(sql).toBe('SELECT * FROM `t` WHERE `col` BETWEEN ? AND ?');
  });
});

// ── SQLite ──────────────────────────────────────────────────────────

describe('SQLGenerator with SQLite', () => {
  const gen = sqliteGen();

  it('should use double-quote identifiers', () => {
    const query = new QueryBuilder().from('users').select('id').build();
    const { sql } = gen.generate(query);
    expect(sql).toBe('SELECT "id" FROM "users"');
  });

  it('should use ? parameter placeholders', () => {
    const query = new QueryBuilder().from('users').where('id', 'eq', 1).build();
    const { sql, params } = gen.generate(query);
    expect(sql).toBe('SELECT * FROM "users" WHERE "id" = ?');
    expect(params).toEqual([1]);
  });
});

// ── ClickHouse ──────────────────────────────────────────────────────

describe('SQLGenerator with ClickHouse', () => {
  const gen = chGen();

  it('should use backtick identifiers', () => {
    const query = new QueryBuilder().from('events').select('event_type').build();
    const { sql } = gen.generate(query);
    expect(sql).toBe('SELECT `event_type` FROM `events`');
  });

  it('should use named parameter placeholders', () => {
    const query = new QueryBuilder().from('events').where('user_id', 'eq', 123).build();
    const { sql, params } = gen.generate(query);
    expect(sql).toBe('SELECT * FROM `events` WHERE `user_id` = {p0:String}');
    expect(params).toEqual([123]);
  });
});

// ── DuckDB ──────────────────────────────────────────────────────────

describe('SQLGenerator with DuckDB', () => {
  const gen = duckGen();

  it('should use double-quote identifiers', () => {
    const query = new QueryBuilder().from('data').select('col1').build();
    const { sql } = gen.generate(query);
    expect(sql).toBe('SELECT "col1" FROM "data"');
  });

  it('should use $ parameter placeholders', () => {
    const query = new QueryBuilder().from('data').where('id', 'eq', 1).build();
    const { sql, params } = gen.generate(query);
    expect(sql).toBe('SELECT * FROM "data" WHERE "id" = $1');
    expect(params).toEqual([1]);
  });
});

// ── Pretty Print ────────────────────────────────────────────────────

describe('SQLGenerator with prettyPrint', () => {
  const gen = pgGen({ prettyPrint: true });

  it('should generate multi-line SQL', () => {
    const query = new QueryBuilder()
      .from('users')
      .select('id', 'name')
      .where('active', 'eq', true)
      .orderBy('name')
      .limit(10)
      .build();
    const { sql } = gen.generate(query);
    const lines = sql.split('\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toContain('SELECT');
    expect(lines[1]).toContain('FROM');
  });
});

// ── Lowercase Keywords ──────────────────────────────────────────────

describe('SQLGenerator with lowercase keywords', () => {
  const gen = pgGen({ uppercaseKeywords: false });

  it('should generate lowercase SQL keywords', () => {
    const query = new QueryBuilder()
      .from('users')
      .select('id')
      .where('active', 'eq', true)
      .orderBy('id', 'desc')
      .limit(10)
      .build();
    const { sql } = gen.generate(query);
    expect(sql).toContain('select');
    expect(sql).toContain('from');
    expect(sql).toContain('where');
    expect(sql).toContain('order by');
    expect(sql).not.toContain('SELECT');
  });
});

// ── parameterized flag ──────────────────────────────────────────────

describe('GeneratedSQL.parameterized', () => {
  const gen = pgGen();

  it('should be false when no params', () => {
    const query = new QueryBuilder().from('users').build();
    const result = gen.generate(query);
    expect(result.parameterized).toBe(false);
  });

  it('should be true when params exist', () => {
    const query = new QueryBuilder().from('users').where('id', 'eq', 1).build();
    const result = gen.generate(query);
    expect(result.parameterized).toBe(true);
  });
});
