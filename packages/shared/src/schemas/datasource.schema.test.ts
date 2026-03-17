import { describe, it, expect } from 'vitest';
import { createDataSourceSchema, updateDataSourceSchema, connectionTestResultSchema } from './datasource.schema.js';

describe('createDataSourceSchema', () => {
  const validInput = {
    name: 'My PostgreSQL',
    type: 'postgresql' as const,
    host: 'localhost',
    port: 5432,
    database: 'mydb',
    username: 'admin',
    password: 'secret',
    ssl: true,
    organizationId: 'org-123',
  };

  it('validates a correct input', () => {
    const result = createDataSourceSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('requires name', () => {
    const result = createDataSourceSchema.safeParse({ ...validInput, name: '' });
    expect(result.success).toBe(false);
  });

  it('requires valid database type', () => {
    const result = createDataSourceSchema.safeParse({ ...validInput, type: 'oracle' });
    expect(result.success).toBe(false);
  });

  it('validates port range', () => {
    expect(createDataSourceSchema.safeParse({ ...validInput, port: 0 }).success).toBe(false);
    expect(createDataSourceSchema.safeParse({ ...validInput, port: 70000 }).success).toBe(false);
    expect(createDataSourceSchema.safeParse({ ...validInput, port: 3306 }).success).toBe(true);
  });

  it('requires database name', () => {
    const result = createDataSourceSchema.safeParse({ ...validInput, database: '' });
    expect(result.success).toBe(false);
  });

  it('requires organizationId', () => {
    const { organizationId: _, ...without } = validInput;
    const result = createDataSourceSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it('allows all database types', () => {
    for (const t of ['postgresql', 'mysql', 'sqlite', 'clickhouse', 'bigquery', 'snowflake', 'duckdb']) {
      expect(createDataSourceSchema.safeParse({ ...validInput, type: t }).success).toBe(true);
    }
  });

  it('allows optional fields to be omitted', () => {
    const minimal = { name: 'test', type: 'sqlite', database: 'test.db', organizationId: 'org-1' };
    expect(createDataSourceSchema.safeParse(minimal).success).toBe(true);
  });
});

describe('updateDataSourceSchema', () => {
  it('allows partial updates', () => {
    expect(updateDataSourceSchema.safeParse({ name: 'New name' }).success).toBe(true);
    expect(updateDataSourceSchema.safeParse({ port: 3306 }).success).toBe(true);
    expect(updateDataSourceSchema.safeParse({}).success).toBe(true);
  });

  it('validates provided fields', () => {
    expect(updateDataSourceSchema.safeParse({ name: '' }).success).toBe(false);
    expect(updateDataSourceSchema.safeParse({ port: -1 }).success).toBe(false);
  });
});

describe('connectionTestResultSchema', () => {
  it('validates correct result', () => {
    const result = connectionTestResultSchema.safeParse({
      success: true,
      message: 'Connected',
      latencyMs: 42,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative latency', () => {
    const result = connectionTestResultSchema.safeParse({
      success: true,
      message: 'ok',
      latencyMs: -1,
    });
    expect(result.success).toBe(false);
  });
});
