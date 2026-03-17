import { describe, it, expect } from 'vitest';
import { DataSource, getDefaultPort } from './datasource.model.js';
import { isOk, isErr } from '@meridian/shared';

describe('DataSource', () => {
  const validParams = {
    name: 'Test PostgreSQL',
    type: 'postgresql' as const,
    host: 'localhost',
    port: 5432,
    database: 'test_db',
    username: 'admin',
    password: 'secret',
    ssl: false,
    organizationId: 'org-123',
  };

  describe('create()', () => {
    it('should create a valid data source with all fields', () => {
      const result = DataSource.create(validParams);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      const ds = result.value;
      expect(ds.name).toBe('Test PostgreSQL');
      expect(ds.type).toBe('postgresql');
      expect(ds.host).toBe('localhost');
      expect(ds.port).toBe(5432);
      expect(ds.database).toBe('test_db');
      expect(ds.credentials.username).toBe('admin');
      expect(ds.credentials.password).toBe('secret');
      expect(ds.credentials.ssl).toBe(false);
      expect(ds.organizationId).toBe('org-123');
      expect(ds.status).toBe('disconnected');
      expect(ds.id).toBeDefined();
      expect(ds.createdAt).toBeInstanceOf(Date);
      expect(ds.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a data source with default port for postgresql', () => {
      const result = DataSource.create({
        ...validParams,
        port: undefined,
      });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.port).toBe(5432);
    });

    it('should create a sqlite data source without host', () => {
      const result = DataSource.create({
        name: 'Local SQLite',
        type: 'sqlite',
        database: '/path/to/db.sqlite',
        organizationId: 'org-123',
      });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.host).toBeUndefined();
      expect(result.value.type).toBe('sqlite');
    });

    it('should create a duckdb data source without host', () => {
      const result = DataSource.create({
        name: 'DuckDB',
        type: 'duckdb',
        database: '/path/to/db.duckdb',
        organizationId: 'org-123',
      });
      expect(isOk(result)).toBe(true);
    });

    it('should trim the name', () => {
      const result = DataSource.create({
        ...validParams,
        name: '  Trimmed Name  ',
      });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.name).toBe('Trimmed Name');
    });

    it('should apply default pool config', () => {
      const result = DataSource.create(validParams);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.poolConfig.minConnections).toBe(1);
      expect(result.value.poolConfig.maxConnections).toBe(10);
    });

    it('should merge custom pool config with defaults', () => {
      const result = DataSource.create({
        ...validParams,
        poolConfig: { maxConnections: 50 },
      });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.poolConfig.maxConnections).toBe(50);
      expect(result.value.poolConfig.minConnections).toBe(1);
    });

    it('should default ssl to false', () => {
      const result = DataSource.create({
        ...validParams,
        ssl: undefined,
      });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.credentials.ssl).toBe(false);
    });

    // --- Validation errors ---

    it('should reject empty name', () => {
      const result = DataSource.create({ ...validParams, name: '' });
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.message).toContain('name is required');
    });

    it('should reject whitespace-only name', () => {
      const result = DataSource.create({ ...validParams, name: '   ' });
      expect(isErr(result)).toBe(true);
    });

    it('should reject name exceeding 255 chars', () => {
      const result = DataSource.create({
        ...validParams,
        name: 'a'.repeat(256),
      });
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.message).toContain('255 characters');
    });

    it('should reject empty database name', () => {
      const result = DataSource.create({ ...validParams, database: '' });
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.message).toContain('Database name is required');
    });

    it('should reject missing host for non-embedded databases', () => {
      const result = DataSource.create({
        ...validParams,
        type: 'mysql',
        host: '',
      });
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.message).toContain('Host is required');
    });

    it('should reject port out of range (0)', () => {
      const result = DataSource.create({ ...validParams, port: 0 });
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.message).toContain('Port must be between');
    });

    it('should reject port out of range (65536)', () => {
      const result = DataSource.create({ ...validParams, port: 65536 });
      expect(isErr(result)).toBe(true);
    });

    it('should reject empty organizationId', () => {
      const result = DataSource.create({
        ...validParams,
        organizationId: '',
      });
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.message).toContain('Organization ID is required');
    });
  });

  describe('fromPersistence()', () => {
    it('should reconstitute a data source from stored data', () => {
      const now = new Date();
      const ds = DataSource.fromPersistence({
        id: 'ds-123',
        name: 'Persisted',
        type: 'mysql',
        host: 'db.example.com',
        port: 3306,
        database: 'mydb',
        username: 'user',
        password: 'pass',
        ssl: true,
        options: { charset: 'utf8mb4' },
        organizationId: 'org-1',
        poolConfig: {
          minConnections: 2,
          maxConnections: 20,
          idleTimeoutMs: 60000,
          acquireTimeoutMs: 15000,
        },
        createdAt: now,
        updatedAt: now,
        status: 'connected',
        lastTestedAt: now,
      });

      expect(ds.id).toBe('ds-123');
      expect(ds.name).toBe('Persisted');
      expect(ds.status).toBe('connected');
      expect(ds.lastTestedAt).toBe(now);
      expect(ds.credentials.ssl).toBe(true);
    });
  });

  describe('testConnection()', () => {
    it('should return testing status for valid data source', () => {
      const dsResult = DataSource.create(validParams);
      expect(isOk(dsResult)).toBe(true);
      if (!isOk(dsResult)) return;

      const result = dsResult.value.testConnection();
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.status).toBe('testing');
      expect(result.value.dataSourceId).toBe(dsResult.value.id);
    });

    it('should fail for sqlite without database', () => {
      const ds = DataSource.fromPersistence({
        id: 'ds-1',
        name: 'Bad',
        type: 'postgresql',
        host: undefined,
        database: '',
        ssl: false,
        options: {},
        organizationId: 'org-1',
        poolConfig: { minConnections: 1, maxConnections: 10, idleTimeoutMs: 30000, acquireTimeoutMs: 10000 },
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'disconnected',
        username: undefined,
        password: undefined,
      });

      const result = ds.testConnection();
      expect(isErr(result)).toBe(true);
    });
  });

  describe('markConnected() / markConnectionFailed() / markDisconnected()', () => {
    it('should update status on successful connection', () => {
      const dsResult = DataSource.create(validParams);
      if (!isOk(dsResult)) return;
      const ds = dsResult.value;

      ds.markConnected();
      expect(ds.status).toBe('connected');
      expect(ds.lastTestedAt).toBeInstanceOf(Date);
      expect(ds.lastError).toBeUndefined();
    });

    it('should update status on failed connection', () => {
      const dsResult = DataSource.create(validParams);
      if (!isOk(dsResult)) return;
      const ds = dsResult.value;

      ds.markConnectionFailed('Connection refused');
      expect(ds.status).toBe('error');
      expect(ds.lastError).toBe('Connection refused');
    });

    it('should update status on disconnect', () => {
      const dsResult = DataSource.create(validParams);
      if (!isOk(dsResult)) return;
      const ds = dsResult.value;

      ds.markConnected();
      ds.markDisconnected();
      expect(ds.status).toBe('disconnected');
    });
  });

  describe('getSchema()', () => {
    it('should return success for non-error data source', () => {
      const dsResult = DataSource.create(validParams);
      if (!isOk(dsResult)) return;

      const result = dsResult.value.getSchema();
      expect(isOk(result)).toBe(true);
    });

    it('should fail for data source in error state', () => {
      const dsResult = DataSource.create(validParams);
      if (!isOk(dsResult)) return;

      dsResult.value.markConnectionFailed('error');
      const result = dsResult.value.getSchema();
      expect(isErr(result)).toBe(true);
    });
  });

  describe('getTables()', () => {
    it('should return success for non-error data source', () => {
      const dsResult = DataSource.create(validParams);
      if (!isOk(dsResult)) return;

      const result = dsResult.value.getTables();
      expect(isOk(result)).toBe(true);
    });

    it('should fail for data source in error state', () => {
      const dsResult = DataSource.create(validParams);
      if (!isOk(dsResult)) return;

      dsResult.value.markConnectionFailed('error');
      const result = dsResult.value.getTables();
      expect(isErr(result)).toBe(true);
    });
  });

  describe('update()', () => {
    it('should return a new DataSource with updated fields', () => {
      const dsResult = DataSource.create(validParams);
      if (!isOk(dsResult)) return;
      const ds = dsResult.value;

      const updated = ds.update({ name: 'Updated Name', port: 5433 });
      expect(isOk(updated)).toBe(true);
      if (!isOk(updated)) return;
      expect(updated.value.name).toBe('Updated Name');
      expect(updated.value.port).toBe(5433);
      expect(updated.value.id).toBe(ds.id);
      expect(updated.value.status).toBe('disconnected');
    });

    it('should reset status on config change', () => {
      const dsResult = DataSource.create(validParams);
      if (!isOk(dsResult)) return;
      dsResult.value.markConnected();

      const updated = dsResult.value.update({ host: 'new-host' });
      expect(isOk(updated)).toBe(true);
      if (!isOk(updated)) return;
      expect(updated.value.status).toBe('disconnected');
    });

    it('should reject empty name on update', () => {
      const dsResult = DataSource.create(validParams);
      if (!isOk(dsResult)) return;

      const updated = dsResult.value.update({ name: '' });
      expect(isErr(updated)).toBe(true);
    });

    it('should reject invalid port on update', () => {
      const dsResult = DataSource.create(validParams);
      if (!isOk(dsResult)) return;

      const updated = dsResult.value.update({ port: 99999 });
      expect(isErr(updated)).toBe(true);
    });
  });

  describe('toConfig()', () => {
    it('should return a DataSourceConfig object', () => {
      const dsResult = DataSource.create(validParams);
      if (!isOk(dsResult)) return;
      const config = dsResult.value.toConfig();

      expect(config.id).toBe(dsResult.value.id);
      expect(config.name).toBe('Test PostgreSQL');
      expect(config.type).toBe('postgresql');
      expect(config.host).toBe('localhost');
      expect(config.database).toBe('test_db');
      expect(config.username).toBe('admin');
      expect(config.password).toBe('secret');
    });
  });

  describe('toSafeDisplay()', () => {
    it('should not include credentials', () => {
      const dsResult = DataSource.create(validParams);
      if (!isOk(dsResult)) return;
      const display = dsResult.value.toSafeDisplay();

      expect(display).not.toHaveProperty('username');
      expect(display).not.toHaveProperty('password');
      expect(display).not.toHaveProperty('credentials');
      expect(display).toHaveProperty('name', 'Test PostgreSQL');
      expect(display).toHaveProperty('ssl', false);
    });
  });
});

describe('getDefaultPort()', () => {
  it('should return 5432 for postgresql', () => {
    expect(getDefaultPort('postgresql')).toBe(5432);
  });

  it('should return 3306 for mysql', () => {
    expect(getDefaultPort('mysql')).toBe(3306);
  });

  it('should return undefined for sqlite', () => {
    expect(getDefaultPort('sqlite')).toBeUndefined();
  });

  it('should return undefined for duckdb', () => {
    expect(getDefaultPort('duckdb')).toBeUndefined();
  });

  it('should return 8123 for clickhouse', () => {
    expect(getDefaultPort('clickhouse')).toBe(8123);
  });

  it('should return 443 for snowflake', () => {
    expect(getDefaultPort('snowflake')).toBe(443);
  });
});
