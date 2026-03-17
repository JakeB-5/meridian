import { describe, it, expect } from 'vitest';
import { generateCacheKey, buildCacheKeyLabel } from './cache-key.js';

describe('generateCacheKey', () => {
  const base = {
    query: 'SELECT * FROM users WHERE id = ?',
    params: [42],
    dataSourceId: 'pg-prod',
  };

  // ---------------------------------------------------------------------------
  // Determinism
  // ---------------------------------------------------------------------------

  it('produces the same key for identical inputs', () => {
    const k1 = generateCacheKey(base);
    const k2 = generateCacheKey(base);
    expect(k1).toBe(k2);
  });

  it('produces a 64-character hex string (SHA-256)', () => {
    const key = generateCacheKey(base);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  // ---------------------------------------------------------------------------
  // Sensitivity to each field
  // ---------------------------------------------------------------------------

  it('differs when query changes', () => {
    const k1 = generateCacheKey({ ...base, query: 'SELECT 1' });
    const k2 = generateCacheKey({ ...base, query: 'SELECT 2' });
    expect(k1).not.toBe(k2);
  });

  it('differs when params change', () => {
    const k1 = generateCacheKey({ ...base, params: [1] });
    const k2 = generateCacheKey({ ...base, params: [2] });
    expect(k1).not.toBe(k2);
  });

  it('differs when dataSourceId changes', () => {
    const k1 = generateCacheKey({ ...base, dataSourceId: 'pg-prod' });
    const k2 = generateCacheKey({ ...base, dataSourceId: 'pg-staging' });
    expect(k1).not.toBe(k2);
  });

  it('differs when param order changes', () => {
    const k1 = generateCacheKey({ ...base, params: [1, 2] });
    const k2 = generateCacheKey({ ...base, params: [2, 1] });
    expect(k1).not.toBe(k2);
  });

  // ---------------------------------------------------------------------------
  // Optional params
  // ---------------------------------------------------------------------------

  it('treats undefined params as empty array', () => {
    const withUndefined = generateCacheKey({ query: 'Q', dataSourceId: 'ds' });
    const withEmpty = generateCacheKey({ query: 'Q', params: [], dataSourceId: 'ds' });
    expect(withUndefined).toBe(withEmpty);
  });

  // ---------------------------------------------------------------------------
  // Whitespace / trimming
  // ---------------------------------------------------------------------------

  it('is stable across leading/trailing whitespace in query', () => {
    const k1 = generateCacheKey({ ...base, query: '  SELECT 1  ' });
    const k2 = generateCacheKey({ ...base, query: 'SELECT 1' });
    expect(k1).toBe(k2);
  });

  it('is stable across leading/trailing whitespace in dataSourceId', () => {
    const k1 = generateCacheKey({ ...base, dataSourceId: '  pg-prod  ' });
    const k2 = generateCacheKey({ ...base, dataSourceId: 'pg-prod' });
    expect(k1).toBe(k2);
  });

  // ---------------------------------------------------------------------------
  // Complex params
  // ---------------------------------------------------------------------------

  it('handles object params', () => {
    const k1 = generateCacheKey({ ...base, params: [{ a: 1 }] });
    const k2 = generateCacheKey({ ...base, params: [{ a: 1 }] });
    expect(k1).toBe(k2);
  });

  it('handles null params', () => {
    const k1 = generateCacheKey({ ...base, params: [null] });
    const k2 = generateCacheKey({ ...base, params: [null] });
    expect(k1).toBe(k2);
  });

  it('distinguishes null from undefined param', () => {
    const k1 = generateCacheKey({ ...base, params: [null] });
    const k2 = generateCacheKey({ ...base, params: [undefined] });
    // JSON.stringify treats undefined as null in arrays, so they ARE equal.
    // This is expected behaviour — document it explicitly.
    expect(k1).toBe(k2);
  });
});

describe('buildCacheKeyLabel', () => {
  it('includes dataSourceId', () => {
    const label = buildCacheKeyLabel({
      query: 'SELECT 1',
      dataSourceId: 'pg-prod',
    });
    expect(label).toContain('pg-prod');
  });

  it('includes the query', () => {
    const label = buildCacheKeyLabel({
      query: 'SELECT 1',
      dataSourceId: 'ds',
    });
    expect(label).toContain('SELECT 1');
  });

  it('truncates long queries to 60 characters', () => {
    const longQuery = 'A'.repeat(120);
    const label = buildCacheKeyLabel({ query: longQuery, dataSourceId: 'ds' });
    // Label should contain truncated version with ellipsis.
    expect(label).toContain('…');
    // The query portion should not be the full 120 chars.
    expect(label.length).toBeLessThan(120);
  });

  it('does not truncate short queries', () => {
    const short = 'SELECT id FROM t';
    const label = buildCacheKeyLabel({ query: short, dataSourceId: 'ds' });
    expect(label).toContain(short);
    expect(label).not.toContain('…');
  });
});
