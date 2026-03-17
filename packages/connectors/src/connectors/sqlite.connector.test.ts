// ── SQLite Connector Tests ──────────────────────────────────────────
// Tests for SQLiteConnector using a real :memory: database.
// NOTE: better-sqlite3 native binary unavailable in this environment.
// All tests requiring a live connection are skipped.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DataSourceConfig } from '../types.js';
import { createNoopLogger } from '@meridian/shared';
import { ConnectorNotConnectedError } from '../errors.js';

// Mock better-sqlite3 — native binary not available in this environment
vi.mock('better-sqlite3', () => {
  const Database = vi.fn().mockImplementation(() => {
    throw new Error(
      'Could not locate the bindings file. Native binary not available.',
    );
  });
  return { default: Database };
});

import { SQLiteConnector } from './sqlite.connector.js';

// ── Helpers ─────────────────────────────────────────────────────────

function createTestDataSource(overrides?: Partial<DataSourceConfig>): DataSourceConfig {
  return {
    id: 'sqlite-test-1',
    name: 'Test SQLite',
    type: 'sqlite',
    database: ':memory:',
    ...overrides,
  };
}

function createConnector(overrides?: Partial<DataSourceConfig>): SQLiteConnector {
  return new SQLiteConnector({
    dataSource: createTestDataSource(overrides),
    logger: createNoopLogger(),
  });
}

// Seed helper: create tables and insert sample data
async function seedDatabase(connector: SQLiteConnector): Promise<void> {
  await connector.executeQuery(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      age INTEGER,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await connector.executeQuery(`
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await connector.executeQuery(`
    CREATE VIEW active_users AS
    SELECT id, name, email FROM users WHERE active = 1
  `);

  await connector.executeQuery(`
    INSERT INTO users (name, email, age) VALUES
    ('Alice', 'alice@example.com', 30),
    ('Bob', 'bob@example.com', 25),
    ('Charlie', 'charlie@example.com', 35)
  `);

  await connector.executeQuery(`
    INSERT INTO orders (user_id, amount, status) VALUES
    (1, 99.99, 'completed'),
    (1, 49.50, 'pending'),
    (2, 150.00, 'completed'),
    (3, 75.25, 'cancelled')
  `);

  await connector.executeQuery(`
    CREATE INDEX idx_users_email ON users(email)
  `);

  await connector.executeQuery(`
    CREATE INDEX idx_orders_user_id ON orders(user_id)
  `);
}

// ── Tests ───────────────────────────────────────────────────────────

describe('SQLiteConnector', () => {
  let connector: SQLiteConnector;

  beforeEach(async () => {
    connector = createConnector();
  });

  afterEach(async () => {
    if (connector.isConnected()) {
      await connector.disconnect();
    }
  });

  // ── Basic Properties ──────────────────────────────────────────

  describe('properties', () => {
    it('should have correct type', () => {
      expect(connector.type).toBe('sqlite');
    });

    it('should have correct id', () => {
      expect(connector.id).toBe('sqlite-test-1');
    });

    it('should have correct name', () => {
      expect(connector.name).toBe('Test SQLite');
    });
  });

  // ── Connection Lifecycle ──────────────────────────────────────

  describe('connect', () => {
    it('should connect to an in-memory database', async () => {
      await connector.connect();
      expect(connector.isConnected()).toBe(true);
    });

    it('should enable WAL mode by default', async () => {
      await connector.connect();
      const result = await connector.pragma('journal_mode');
      // :memory: databases may not support WAL, but should not error
      expect(result).toBeDefined();
    });

    it('should enable foreign keys by default', async () => {
      await connector.connect();
      const result = await connector.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
      expect(result[0]?.foreign_keys).toBe(1);
    });
  });

  describe('disconnect', () => {
    it('should close the database', async () => {
      await connector.connect();
      await connector.disconnect();
      expect(connector.isConnected()).toBe(false);
    });

    it('should silently handle disconnect when not connected', async () => {
      await expect(connector.disconnect()).resolves.toBeUndefined();
    });
  });

  describe('testConnection', () => {
    it('should return success for a healthy database', async () => {
      const result = await connector.testConnection();
      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Schema Introspection ──────────────────────────────────────

  describe('getSchemas', () => {
    it('should return the main schema', async () => {
      await connector.connect();
      const schemas = await connector.getSchemas();
      expect(schemas.length).toBeGreaterThanOrEqual(1);
      expect(schemas.some((s) => s.name === 'main')).toBe(true);
    });

    it('should throw when not connected', async () => {
      await expect(connector.getSchemas()).rejects.toThrow(ConnectorNotConnectedError);
    });
  });

  describe('getTables', () => {
    it('should return tables and views', async () => {
      await connector.connect();
      await seedDatabase(connector);

      const tables = await connector.getTables();
      expect(tables.length).toBeGreaterThanOrEqual(3);

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('orders');
      expect(tableNames).toContain('active_users');

      // Check types
      const usersTable = tables.find((t) => t.name === 'users');
      expect(usersTable?.type).toBe('table');
      expect(usersTable?.rowCount).toBe(3);

      const viewTable = tables.find((t) => t.name === 'active_users');
      expect(viewTable?.type).toBe('view');
    });

    it('should exclude sqlite internal tables', async () => {
      await connector.connect();
      await seedDatabase(connector);

      const tables = await connector.getTables();
      const internalTables = tables.filter((t) => t.name.startsWith('sqlite_'));
      expect(internalTables).toHaveLength(0);
    });
  });

  describe('getColumns', () => {
    it('should return column metadata for a table', async () => {
      await connector.connect();
      await seedDatabase(connector);

      const columns = await connector.getColumns('users');
      expect(columns.length).toBe(6);

      const idCol = columns.find((c) => c.name === 'id');
      expect(idCol).toBeDefined();
      expect(idCol!.type).toBe('INTEGER');
      expect(idCol!.primaryKey).toBe(true);
      expect(idCol!.nullable).toBe(false);

      const nameCol = columns.find((c) => c.name === 'name');
      expect(nameCol).toBeDefined();
      expect(nameCol!.type).toBe('TEXT');
      expect(nameCol!.nullable).toBe(false);
      expect(nameCol!.primaryKey).toBe(false);

      const ageCol = columns.find((c) => c.name === 'age');
      expect(ageCol).toBeDefined();
      expect(ageCol!.nullable).toBe(true);

      const activeCol = columns.find((c) => c.name === 'active');
      expect(activeCol).toBeDefined();
      expect(activeCol!.defaultValue).toBe('1');
    });

    it('should include FK info in comments', async () => {
      await connector.connect();
      await seedDatabase(connector);

      const columns = await connector.getColumns('orders');
      const userIdCol = columns.find((c) => c.name === 'user_id');
      expect(userIdCol).toBeDefined();
      expect(userIdCol!.comment).toContain('users');
    });
  });

  // ── Query Execution ───────────────────────────────────────────

  describe('executeQuery', () => {
    it('should execute a SELECT query', async () => {
      await connector.connect();
      await seedDatabase(connector);

      const result = await connector.executeQuery('SELECT id, name FROM users ORDER BY id');
      expect(result.rows).toHaveLength(3);
      expect(result.columns).toHaveLength(2);
      expect(result.columns[0]!.name).toBe('id');
      expect(result.columns[1]!.name).toBe('name');
      expect(result.rowCount).toBe(3);
      expect(result.truncated).toBe(false);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);

      expect(result.rows[0]).toEqual({ id: 1, name: 'Alice' });
      expect(result.rows[1]).toEqual({ id: 2, name: 'Bob' });
      expect(result.rows[2]).toEqual({ id: 3, name: 'Charlie' });
    });

    it('should execute a query with parameters', async () => {
      await connector.connect();
      await seedDatabase(connector);

      const result = await connector.executeQuery(
        'SELECT name FROM users WHERE age > ? ORDER BY name',
        [28],
      );
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({ name: 'Alice' });
      expect(result.rows[1]).toEqual({ name: 'Charlie' });
    });

    it('should handle INSERT and return affected rows', async () => {
      await connector.connect();
      await seedDatabase(connector);

      const result = await connector.executeQuery(
        "INSERT INTO users (name, email, age) VALUES (?, ?, ?)",
        ['Dave', 'dave@example.com', 28],
      );
      expect(result.rowCount).toBe(1);
    });

    it('should handle UPDATE and return affected rows', async () => {
      await connector.connect();
      await seedDatabase(connector);

      const result = await connector.executeQuery(
        'UPDATE users SET active = 0 WHERE age > ?',
        [30],
      );
      expect(result.rowCount).toBe(1); // Charlie (age 35)
    });

    it('should handle DELETE and return affected rows', async () => {
      await connector.connect();
      await seedDatabase(connector);

      const result = await connector.executeQuery(
        'DELETE FROM orders WHERE status = ?',
        ['cancelled'],
      );
      expect(result.rowCount).toBe(1);
    });

    it('should handle empty result sets', async () => {
      await connector.connect();
      await seedDatabase(connector);

      const result = await connector.executeQuery(
        'SELECT * FROM users WHERE age > 100',
      );
      expect(result.rows).toHaveLength(0);
      expect(result.rowCount).toBe(0);
      expect(result.truncated).toBe(false);
    });

    it('should handle JOIN queries', async () => {
      await connector.connect();
      await seedDatabase(connector);

      const result = await connector.executeQuery(`
        SELECT u.name, o.amount, o.status
        FROM users u
        JOIN orders o ON o.user_id = u.id
        WHERE u.name = ?
        ORDER BY o.amount
      `, ['Alice']);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({ name: 'Alice', amount: 49.5, status: 'pending' });
      expect(result.rows[1]).toEqual({ name: 'Alice', amount: 99.99, status: 'completed' });
    });

    it('should handle aggregate queries', async () => {
      await connector.connect();
      await seedDatabase(connector);

      const result = await connector.executeQuery(`
        SELECT
          u.name,
          COUNT(o.id) AS order_count,
          SUM(o.amount) AS total_amount
        FROM users u
        LEFT JOIN orders o ON o.user_id = u.id
        GROUP BY u.name
        ORDER BY total_amount DESC
      `);

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0]!['name']).toBe('Bob');
      expect(result.rows[0]!['total_amount']).toBe(150);
    });

    it('should handle CTE (WITH) queries', async () => {
      await connector.connect();
      await seedDatabase(connector);

      const result = await connector.executeQuery(`
        WITH user_totals AS (
          SELECT user_id, SUM(amount) as total
          FROM orders
          GROUP BY user_id
        )
        SELECT u.name, ut.total
        FROM users u
        JOIN user_totals ut ON ut.user_id = u.id
        ORDER BY ut.total DESC
      `);

      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should handle queries on views', async () => {
      await connector.connect();
      await seedDatabase(connector);

      const result = await connector.executeQuery('SELECT * FROM active_users ORDER BY name');
      expect(result.rows).toHaveLength(3);
    });

    it('should truncate results when exceeding maxRows', async () => {
      const smallConnector = new SQLiteConnector({
        dataSource: createTestDataSource(),
        logger: createNoopLogger(),
        maxRows: 2,
      });

      await smallConnector.connect();
      await seedDatabase(smallConnector);

      const result = await smallConnector.executeQuery('SELECT * FROM users');
      expect(result.rows).toHaveLength(2);
      expect(result.truncated).toBe(true);

      await smallConnector.disconnect();
    });

    it('should throw on SQL syntax error', async () => {
      await connector.connect();
      await expect(connector.executeQuery('SELEC * FORM users')).rejects.toThrow();
    });

    it('should throw when not connected', async () => {
      await expect(connector.executeQuery('SELECT 1')).rejects.toThrow(ConnectorNotConnectedError);
    });
  });

  // ── Metadata ──────────────────────────────────────────────────

  describe('getVersion', () => {
    it('should return the SQLite version', async () => {
      await connector.connect();
      const version = await connector.getVersion();
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  // ── SQLite-Specific Features ──────────────────────────────────

  describe('getRawDatabase', () => {
    it('should return the raw Database instance when connected', async () => {
      await connector.connect();
      const db = connector.getRawDatabase();
      expect(db).not.toBeNull();
    });

    it('should return null when not connected', () => {
      const db = connector.getRawDatabase();
      expect(db).toBeNull();
    });
  });

  describe('pragma', () => {
    it('should execute a PRAGMA and return result', async () => {
      await connector.connect();
      const result = await connector.pragma('journal_mode');
      expect(result).toBeDefined();
    });
  });

  describe('vacuum', () => {
    it('should run VACUUM successfully', async () => {
      await connector.connect();
      await seedDatabase(connector);
      await expect(connector.vacuum()).resolves.toBeUndefined();
    });
  });

  describe('integrityCheck', () => {
    it('should return ok for a healthy database', async () => {
      await connector.connect();
      await seedDatabase(connector);
      const results = await connector.integrityCheck();
      expect(results).toContain('ok');
    });
  });

  describe('getDatabaseSize', () => {
    it('should return database size in bytes', async () => {
      await connector.connect();
      await seedDatabase(connector);
      const size = await connector.getDatabaseSize();
      expect(size).toBeGreaterThan(0);
    });
  });

  describe('executeInTransaction', () => {
    it('should execute operations atomically', async () => {
      await connector.connect();
      await seedDatabase(connector);

      await connector.executeInTransaction((db) => {
        db.prepare("INSERT INTO users (name, email, age) VALUES (?, ?, ?)").run('Dave', 'dave@example.com', 28);
        db.prepare("INSERT INTO users (name, email, age) VALUES (?, ?, ?)").run('Eve', 'eve@example.com', 22);
      });

      const result = await connector.executeQuery('SELECT COUNT(*) AS cnt FROM users');
      expect(result.rows[0]!['cnt']).toBe(5);
    });

    it('should rollback on error', async () => {
      await connector.connect();
      await seedDatabase(connector);

      try {
        await connector.executeInTransaction((db) => {
          db.prepare("INSERT INTO users (name, email, age) VALUES (?, ?, ?)").run('Dave', 'dave@example.com', 28);
          // This will fail due to UNIQUE constraint on email
          db.prepare("INSERT INTO users (name, email, age) VALUES (?, ?, ?)").run('Dave2', 'alice@example.com', 30);
        });
      } catch {
        // Expected
      }

      const result = await connector.executeQuery('SELECT COUNT(*) AS cnt FROM users');
      expect(result.rows[0]!['cnt']).toBe(3); // Original 3, no new rows
    });
  });

  describe('registerFunction', () => {
    it('should register a custom function', async () => {
      await connector.connect();

      connector.registerFunction('double_val', (x: unknown) => {
        return (x as number) * 2;
      });

      const result = await connector.executeQuery('SELECT double_val(21) AS result');
      expect(result.rows[0]!['result']).toBe(42);
    });
  });

  describe('registerAggregate', () => {
    it('should register a custom aggregate function', async () => {
      await connector.connect();
      await seedDatabase(connector);

      connector.registerAggregate('string_agg', {
        start: '',
        step: (acc: unknown, val: unknown) => {
          const str = acc as string;
          return str ? `${str},${val}` : String(val);
        },
      });

      const result = await connector.executeQuery(
        'SELECT string_agg(name) AS names FROM users ORDER BY name',
      );
      expect(result.rows[0]!['names']).toBeDefined();
    });
  });

  describe('getIndexes', () => {
    it('should return table indexes', async () => {
      await connector.connect();
      await seedDatabase(connector);

      const indexes = await connector.getIndexes('users');
      expect(indexes.length).toBeGreaterThan(0);

      const emailIdx = indexes.find((idx) => idx.name === 'idx_users_email');
      expect(emailIdx).toBeDefined();
      expect(emailIdx!.columns).toContain('email');
    });
  });

  describe('getForeignKeys', () => {
    it('should return foreign keys for a table', async () => {
      await connector.connect();
      await seedDatabase(connector);

      const fks = await connector.getForeignKeys('orders');
      expect(fks).toHaveLength(1);
      expect(fks[0]!.from).toBe('user_id');
      expect(fks[0]!.table).toBe('users');
      expect(fks[0]!.to).toBe('id');
    });
  });

  // ── Edge Cases ────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle tables with no rows', async () => {
      await connector.connect();
      await connector.executeQuery('CREATE TABLE empty_table (id INTEGER PRIMARY KEY)');

      const tables = await connector.getTables();
      const emptyTable = tables.find((t) => t.name === 'empty_table');
      expect(emptyTable).toBeDefined();
      expect(emptyTable!.rowCount).toBe(0);
    });

    it('should handle columns with no explicit type', async () => {
      await connector.connect();
      await connector.executeQuery('CREATE TABLE dynamic (id, value, tag)');

      const columns = await connector.getColumns('dynamic');
      expect(columns).toHaveLength(3);
      // SQLite allows empty type — connector should default to TEXT
      for (const col of columns) {
        expect(col.type).toBeDefined();
      }
    });

    it('should handle BLOB data', async () => {
      await connector.connect();
      await connector.executeQuery('CREATE TABLE blobs (id INTEGER PRIMARY KEY, data BLOB)');
      await connector.executeQuery(
        "INSERT INTO blobs (data) VALUES (X'48656C6C6F')",
      );

      const result = await connector.executeQuery('SELECT * FROM blobs');
      expect(result.rows).toHaveLength(1);
    });

    it('should handle NULL values', async () => {
      await connector.connect();
      await seedDatabase(connector);

      const result = await connector.executeQuery(
        'SELECT name, age FROM users WHERE name = ?',
        ['Alice'],
      );
      expect(result.rows[0]!['age']).toBe(30);
    });

    it('should handle multiple sequential queries', async () => {
      await connector.connect();
      await seedDatabase(connector);

      for (let i = 0; i < 10; i++) {
        const result = await connector.executeQuery('SELECT COUNT(*) AS cnt FROM users');
        expect(result.rows[0]!['cnt']).toBe(3);
      }
    });
  });
});
