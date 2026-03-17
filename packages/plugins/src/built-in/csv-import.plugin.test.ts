import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  CsvImportPlugin,
  CsvImportConfigSchema,
  CSV_IMPORT_MANIFEST,
} from './csv-import.plugin.js';
import { createTestPluginContext } from '../plugin-context.js';
import type { PluginManifest, QueryResult } from '@meridian/shared';

// ── Fixture manifest ──────────────────────────────────────────────────

const MANIFEST: PluginManifest = {
  name: 'csv-import',
  version: '1.0.0',
  type: 'transformation',
  description: 'CSV import plugin',
  entryPoint: './built-in/csv-import.plugin.js',
};

function makePlugin(): CsvImportPlugin {
  return new CsvImportPlugin(createTestPluginContext(MANIFEST));
}

// ── CsvImportConfigSchema ─────────────────────────────────────────────

describe('CsvImportConfigSchema', () => {
  it('parses valid config with defaults', () => {
    const result = CsvImportConfigSchema.parse({});
    expect(result.delimiter).toBe(',');
    expect(result.hasHeaders).toBe(true);
    expect(result.quoteChar).toBe('"');
    expect(result.skipLines).toBe(0);
    expect(result.maxRows).toBe(0);
    expect(result.trimValues).toBe(true);
    expect(result.emptyAsNull).toBe(false);
    expect(result.encoding).toBe('utf-8');
  });

  it('accepts custom delimiter', () => {
    const result = CsvImportConfigSchema.parse({ delimiter: ';' });
    expect(result.delimiter).toBe(';');
  });

  it('accepts tab delimiter', () => {
    const result = CsvImportConfigSchema.parse({ delimiter: '\t' });
    expect(result.delimiter).toBe('\t');
  });

  it('rejects empty delimiter', () => {
    expect(() => CsvImportConfigSchema.parse({ delimiter: '' })).toThrow();
  });

  it('rejects negative skipLines', () => {
    expect(() => CsvImportConfigSchema.parse({ skipLines: -1 })).toThrow();
  });

  it('rejects negative maxRows', () => {
    expect(() => CsvImportConfigSchema.parse({ maxRows: -1 })).toThrow();
  });
});

// ── parseText — basic functionality ──────────────────────────────────

describe('CsvImportPlugin.parseText', () => {
  let plugin: CsvImportPlugin;
  beforeEach(() => { plugin = makePlugin(); });

  it('parses a simple CSV with headers', () => {
    const csv = 'name,age,city\nAlice,30,New York\nBob,25,London\n';
    const result = plugin.parseText(csv);

    expect(result.columns).toHaveLength(3);
    expect(result.columns[0].name).toBe('name');
    expect(result.columns[1].name).toBe('age');
    expect(result.columns[2].name).toBe('city');
    expect(result.rowCount).toBe(2);
    expect(result.rows[0]['name']).toBe('Alice');
    expect(result.rows[1]['name']).toBe('Bob');
  });

  it('parses CSV without trailing newline', () => {
    const csv = 'a,b\n1,2\n3,4';
    const result = plugin.parseText(csv);
    expect(result.rowCount).toBe(2);
  });

  it('infers integer type for numeric columns', () => {
    const csv = 'id,value\n1,100\n2,200\n';
    const result = plugin.parseText(csv);
    const idCol = result.columns.find((c) => c.name === 'id')!;
    expect(idCol.type).toBe('integer');
  });

  it('infers float type for decimal columns', () => {
    const csv = 'price\n1.99\n2.50\n';
    const result = plugin.parseText(csv);
    expect(result.columns[0].type).toBe('float');
  });

  it('infers boolean type for boolean columns', () => {
    const csv = 'active\ntrue\nfalse\ntrue\n';
    const result = plugin.parseText(csv);
    expect(result.columns[0].type).toBe('boolean');
  });

  it('infers datetime type for ISO date columns', () => {
    const csv = 'created_at\n2024-01-01\n2024-06-15\n';
    const result = plugin.parseText(csv);
    expect(result.columns[0].type).toBe('datetime');
  });

  it('infers string type for mixed columns', () => {
    const csv = 'value\nabc\n123\ntrue\n';
    const result = plugin.parseText(csv);
    expect(result.columns[0].type).toBe('string');
  });

  it('returns correct rowCount', () => {
    const csv = 'x\n1\n2\n3\n4\n5\n';
    const result = plugin.parseText(csv);
    expect(result.rowCount).toBe(5);
    expect(result.rows).toHaveLength(5);
  });

  it('includes executionTimeMs', () => {
    const result = plugin.parseText('a,b\n1,2\n');
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('sets truncated=false when no limit', () => {
    const csv = 'x\n1\n2\n3\n';
    expect(plugin.parseText(csv).truncated).toBe(false);
  });

  it('all columns are nullable', () => {
    const csv = 'a,b,c\n1,2,3\n';
    const result = plugin.parseText(csv);
    expect(result.columns.every((c) => c.nullable)).toBe(true);
  });
});

// ── Header handling ───────────────────────────────────────────────────

describe('CsvImportPlugin.parseText — headers', () => {
  let plugin: CsvImportPlugin;
  beforeEach(() => { plugin = makePlugin(); });

  it('generates col_N headers when hasHeaders=false', () => {
    const csv = '1,2,3\n4,5,6\n';
    const result = plugin.parseText(csv, { hasHeaders: false });
    expect(result.columns.map((c) => c.name)).toEqual(['col_0', 'col_1', 'col_2']);
    expect(result.rowCount).toBe(2);
  });

  it('generates fallback col_N for empty header cells', () => {
    const csv = 'name,,city\nAlice,,NY\n';
    const result = plugin.parseText(csv);
    expect(result.columns[1].name).toBe('col_1');
  });
});

// ── Delimiter handling ────────────────────────────────────────────────

describe('CsvImportPlugin.parseText — delimiters', () => {
  let plugin: CsvImportPlugin;
  beforeEach(() => { plugin = makePlugin(); });

  it('parses semicolon-delimited CSV', () => {
    const csv = 'a;b;c\n1;2;3\n';
    const result = plugin.parseText(csv, { delimiter: ';' });
    expect(result.columns).toHaveLength(3);
    expect(result.rows[0]['a']).toBe(1);
  });

  it('parses tab-delimited CSV (TSV)', () => {
    const csv = 'a\tb\tc\n1\t2\t3\n';
    const result = plugin.parseText(csv, { delimiter: '\t' });
    expect(result.columns).toHaveLength(3);
    expect(result.rows[0]['b']).toBe(2);
  });

  it('parses pipe-delimited CSV', () => {
    const csv = 'x|y\n10|20\n';
    const result = plugin.parseText(csv, { delimiter: '|' });
    expect(result.rows[0]['x']).toBe(10);
  });
});

// ── Quoted fields ─────────────────────────────────────────────────────

describe('CsvImportPlugin.parseText — quoted fields', () => {
  let plugin: CsvImportPlugin;
  beforeEach(() => { plugin = makePlugin(); });

  it('handles quoted fields containing delimiter', () => {
    const csv = 'a,b\n"hello, world",42\n';
    const result = plugin.parseText(csv);
    expect(result.rows[0]['a']).toBe('hello, world');
  });

  it('handles doubled-quote escape within quoted field', () => {
    const csv = 'a\n"He said ""hello"""\n';
    const result = plugin.parseText(csv);
    expect(result.rows[0]['a']).toBe('He said "hello"');
  });

  it('handles quoted field spanning the whole value', () => {
    const csv = 'name\n"Alice"\n';
    const result = plugin.parseText(csv);
    expect(result.rows[0]['name']).toBe('Alice');
  });
});

// ── maxRows limit ─────────────────────────────────────────────────────

describe('CsvImportPlugin.parseText — maxRows', () => {
  let plugin: CsvImportPlugin;
  beforeEach(() => { plugin = makePlugin(); });

  it('limits number of rows when maxRows is set', () => {
    const csv = 'x\n1\n2\n3\n4\n5\n';
    const result = plugin.parseText(csv, { maxRows: 3 });
    expect(result.rowCount).toBe(3);
    expect(result.truncated).toBe(true);
  });

  it('does not truncate when rows <= maxRows', () => {
    const csv = 'x\n1\n2\n';
    const result = plugin.parseText(csv, { maxRows: 10 });
    expect(result.rowCount).toBe(2);
    expect(result.truncated).toBe(false);
  });
});

// ── skipLines ─────────────────────────────────────────────────────────

describe('CsvImportPlugin.parseText — skipLines', () => {
  let plugin: CsvImportPlugin;
  beforeEach(() => { plugin = makePlugin(); });

  it('skips leading comment/metadata lines before header', () => {
    const csv = '# generated by system\nname,age\nAlice,30\n';
    const result = plugin.parseText(csv, { skipLines: 1 });
    expect(result.columns[0].name).toBe('name');
    expect(result.rowCount).toBe(1);
  });
});

// ── trimValues / emptyAsNull ──────────────────────────────────────────

describe('CsvImportPlugin.parseText — trimValues and emptyAsNull', () => {
  let plugin: CsvImportPlugin;
  beforeEach(() => { plugin = makePlugin(); });

  it('trims whitespace from values when trimValues=true', () => {
    const csv = 'name\n  Alice  \n';
    const result = plugin.parseText(csv, { trimValues: true });
    expect(result.rows[0]['name']).toBe('Alice');
  });

  it('preserves whitespace when trimValues=false', () => {
    const csv = 'name\n  Alice  \n';
    const result = plugin.parseText(csv, { trimValues: false });
    expect(result.rows[0]['name']).toBe('  Alice  ');
  });

  it('converts empty strings to empty string by default', () => {
    const csv = 'a,b\n1,\n';
    const result = plugin.parseText(csv);
    expect(result.rows[0]['b']).toBe('');
  });

  it('preserves empty string fields when emptyAsNull=false', () => {
    const csv = 'a,b\n1,\n';
    const result = plugin.parseText(csv, { emptyAsNull: false });
    expect(result.rows[0]['b']).toBe('');
  });
});

// ── empty input ───────────────────────────────────────────────────────

describe('CsvImportPlugin.parseText — edge cases', () => {
  let plugin: CsvImportPlugin;
  beforeEach(() => { plugin = makePlugin(); });

  it('returns empty result for empty string', () => {
    const result = plugin.parseText('');
    expect(result.columns).toHaveLength(0);
    expect(result.rowCount).toBe(0);
  });

  it('returns empty result for whitespace-only input', () => {
    const result = plugin.parseText('   \n   ');
    // headers-only row with empty/whitespace columns, no data rows
    expect(result.rowCount).toBe(0);
  });

  it('handles single column CSV', () => {
    const csv = 'value\naaa\nbbb\n';
    const result = plugin.parseText(csv);
    expect(result.columns).toHaveLength(1);
    expect(result.rowCount).toBe(2);
  });

  it('handles CRLF line endings', () => {
    const csv = 'a,b\r\n1,2\r\n3,4\r\n';
    const result = plugin.parseText(csv);
    expect(result.rowCount).toBe(2);
    expect(result.rows[0]['a']).toBe(1);
  });
});

// ── transform() method ────────────────────────────────────────────────

describe('CsvImportPlugin.transform', () => {
  let plugin: CsvImportPlugin;
  beforeEach(() => { plugin = makePlugin(); });

  const emptyInput: QueryResult = {
    columns: [],
    rows: [],
    rowCount: 0,
    executionTimeMs: 0,
    truncated: false,
  };

  it('parses CSV from csvText config key', () => {
    const result = plugin.transform(emptyInput, {
      csvText: 'x,y\n1,2\n3,4\n',
    });
    expect(result.rowCount).toBe(2);
    expect(result.columns[0].name).toBe('x');
  });

  it('falls back to first cell of input QueryResult when no csvText', () => {
    const input: QueryResult = {
      columns: [{ name: 'csv', type: 'string', nullable: true }],
      rows: [{ csv: 'a,b\n1,2\n' }],
      rowCount: 1,
      executionTimeMs: 0,
      truncated: false,
    };
    const result = plugin.transform(input, {});
    expect(result.rowCount).toBe(1);
    expect(result.columns[0].name).toBe('a');
  });

  it('returns empty result when no csvText and input is empty', () => {
    const result = plugin.transform(emptyInput, {});
    expect(result.rowCount).toBe(0);
    expect(result.columns).toHaveLength(0);
  });
});

// ── importFile ────────────────────────────────────────────────────────

describe('CsvImportPlugin.importFile', () => {
  let plugin: CsvImportPlugin;
  let tmpDir: string;

  beforeEach(async () => {
    plugin = makePlugin();
    tmpDir = join(tmpdir(), `csv-test-${randomUUID()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('reads and parses a CSV file', async () => {
    const filePath = join(tmpDir, 'data.csv');
    await writeFile(filePath, 'id,name\n1,Alice\n2,Bob\n', 'utf-8');
    const result = await plugin.importFile(filePath);
    expect(result.rowCount).toBe(2);
    expect(result.rows[0]['name']).toBe('Alice');
  });

  it('throws MeridianError for non-existent file', async () => {
    const { MeridianError } = await import('@meridian/shared');
    await expect(
      plugin.importFile(join(tmpDir, 'nonexistent.csv')),
    ).rejects.toBeInstanceOf(MeridianError);
  });

  it('respects config options when reading from file', async () => {
    const filePath = join(tmpDir, 'data.tsv');
    await writeFile(filePath, 'a\tb\n10\t20\n', 'utf-8');
    const result = await plugin.importFile(filePath, { delimiter: '\t' });
    expect(result.columns).toHaveLength(2);
    expect(result.rows[0]['a']).toBe(10);
  });
});

// ── CSV_IMPORT_MANIFEST ───────────────────────────────────────────────

describe('CSV_IMPORT_MANIFEST', () => {
  it('has correct name and type', () => {
    expect(CSV_IMPORT_MANIFEST.name).toBe('csv-import');
    expect(CSV_IMPORT_MANIFEST.type).toBe('transformation');
  });

  it('has a semver version', () => {
    expect(CSV_IMPORT_MANIFEST.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
