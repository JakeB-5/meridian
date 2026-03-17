import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { MeridianError } from '@meridian/shared';
import type { QueryResult, ColumnInfo } from '@meridian/shared';
import type {
  TransformationPlugin,
  PluginContext,
  PluginModule,
} from '../plugin-types.js';

// ── Config Schema ────────────────────────────────────────────────────

export const JsonImportConfigSchema = z.object({
  /**
   * JSONPath-like selector to extract the array of records from the
   * root JSON value. Supports simple dot-notation and array index.
   *   ""           → use root directly (must be an array)
   *   "data"       → obj.data (must be an array)
   *   "result.rows" → obj.result.rows
   * Default: "" (root)
   */
  dataPath: z.string().default(''),

  /**
   * Whether to flatten nested objects into dot-notation column names.
   * e.g. { address: { city: "NY" } } → "address.city": "NY"
   * Default: false
   */
  flattenObjects: z.boolean().default(false),

  /**
   * Maximum depth for object flattening (only used when flattenObjects=true).
   * Default: 3
   */
  flattenDepth: z.number().int().min(1).max(10).default(3),

  /**
   * Whether to include array values as JSON string columns rather than
   * skipping them. Default: false
   */
  includeArraysAsJson: z.boolean().default(false),

  /**
   * Columns to include. Empty = include all. Default: []
   */
  includeColumns: z.array(z.string()).default([]),

  /**
   * Columns to exclude. Applied after includeColumns. Default: []
   */
  excludeColumns: z.array(z.string()).default([]),

  /**
   * Maximum number of rows to import (0 = unlimited). Default: 0
   */
  maxRows: z.number().int().min(0).default(0),

  /**
   * Treat JSON null values as null in result. Default: true
   */
  preserveNulls: z.boolean().default(true),

  /**
   * Encoding for file reads. Default: "utf-8"
   */
  encoding: z.enum(['utf-8', 'utf8', 'ascii', 'latin1']).default('utf-8'),

  /**
   * If true, single JSON objects (not arrays) are wrapped in a single-row
   * result set. Default: true
   */
  wrapObject: z.boolean().default(true),

  /**
   * If true, parse JSON strings inside record values as nested objects.
   * Default: false
   */
  parseStringValues: z.boolean().default(false),
});

export type JsonImportConfig = z.infer<typeof JsonImportConfigSchema>;

// ── Path Resolution ──────────────────────────────────────────────────

/**
 * Resolve a dot-notation path into a nested object.
 * Returns undefined if any key along the path does not exist.
 */
function resolvePath(obj: unknown, path: string): unknown {
  if (!path || path.trim() === '') return obj;

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;

    // Support array index access: "items.0.name"
    const idx = Number(part);
    if (!isNaN(idx) && Array.isArray(current)) {
      current = (current as unknown[])[idx];
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

// ── Object Flattening ────────────────────────────────────────────────

/**
 * Recursively flatten a nested object into a flat key-value map with
 * dot-notation keys. Arrays are stringified unless includeArraysAsJson
 * is true (they are included as JSON strings).
 */
function flattenObject(
  obj: Record<string, unknown>,
  config: JsonImportConfig,
  prefix = '',
  depth = 0,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      depth < config.flattenDepth
    ) {
      const nested = flattenObject(
        value as Record<string, unknown>,
        config,
        fullKey,
        depth + 1,
      );
      Object.assign(result, nested);
    } else if (Array.isArray(value)) {
      if (config.includeArraysAsJson) {
        result[fullKey] = JSON.stringify(value);
      }
      // Otherwise skip arrays entirely
    } else {
      result[fullKey] = value;
    }
  }

  return result;
}

// ── Type Inference ───────────────────────────────────────────────────

/**
 * Infer a column type string from the JS type of a sampled value.
 */
function inferTypeFromValue(value: unknown): string {
  if (value === null || value === undefined) return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'float';
  }
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?/.test(value)) {
      return 'datetime';
    }
    if (/^-?\d+$/.test(value)) return 'integer';
    if (/^-?\d+\.\d+$/.test(value)) return 'float';
    if (/^(true|false)$/i.test(value)) return 'boolean';
  }
  return 'string';
}

/**
 * Merge two type strings — if they differ, fall back to 'string'.
 */
function mergeTypes(a: string, b: string): string {
  if (a === b) return a;
  if (a === 'string' || b === 'string') return 'string';
  // integer + float → float
  if (
    (a === 'integer' && b === 'float') ||
    (a === 'float' && b === 'integer')
  ) {
    return 'float';
  }
  return 'string';
}

// ── Schema Discovery ─────────────────────────────────────────────────

/**
 * Discover all column names and infer their types from a sample of rows.
 */
function discoverSchema(
  rows: Record<string, unknown>[],
  config: JsonImportConfig,
): ColumnInfo[] {
  const typeMap = new Map<string, string>();
  const sampleSize = Math.min(rows.length, 200);

  for (let i = 0; i < sampleSize; i++) {
    for (const [key, value] of Object.entries(rows[i])) {
      const inferred = inferTypeFromValue(value);
      if (typeMap.has(key)) {
        typeMap.set(key, mergeTypes(typeMap.get(key)!, inferred));
      } else {
        typeMap.set(key, inferred);
      }
    }
  }

  return Array.from(typeMap.entries()).map(([name, type]) => ({
    name,
    type,
    nullable: true,
  }));
}

// ── Column Filtering ─────────────────────────────────────────────────

function applyColumnFilter(
  columns: ColumnInfo[],
  config: JsonImportConfig,
): ColumnInfo[] {
  let filtered = columns;

  if (config.includeColumns.length > 0) {
    const includeSet = new Set(config.includeColumns);
    filtered = filtered.filter((c) => includeSet.has(c.name));
  }

  if (config.excludeColumns.length > 0) {
    const excludeSet = new Set(config.excludeColumns);
    filtered = filtered.filter((c) => !excludeSet.has(c.name));
  }

  return filtered;
}

// ── Row Normalisation ────────────────────────────────────────────────

/**
 * Normalise a raw JSON object into a flat record using the config options.
 */
function normaliseRow(
  raw: unknown,
  config: JsonImportConfig,
): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { value: raw };
  }

  let record = raw as Record<string, unknown>;

  if (config.flattenObjects) {
    record = flattenObject(record, config);
  }

  if (config.parseStringValues) {
    const parsed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(record)) {
      if (typeof v === 'string') {
        try {
          parsed[k] = JSON.parse(v);
        } catch {
          parsed[k] = v;
        }
      } else {
        parsed[k] = v;
      }
    }
    record = parsed;
  }

  return record;
}

// ── JSON Import Plugin ───────────────────────────────────────────────

export class JsonImportPlugin implements TransformationPlugin {
  readonly name = 'json-import';
  readonly description =
    'Import data from JSON files or JSON text into a QueryResult';
  readonly configSchema = JsonImportConfigSchema;

  private readonly context: PluginContext;

  constructor(context: PluginContext) {
    this.context = context;
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Parse JSON from a file path.
   */
  async importFile(filePath: string, rawConfig: unknown = {}): Promise<QueryResult> {
    const config = JsonImportConfigSchema.parse(rawConfig);
    this.context.logger.info('Importing JSON file', { filePath });

    let text: string;
    try {
      text = await readFile(filePath, config.encoding as BufferEncoding);
    } catch (error) {
      throw new MeridianError(
        `Failed to read JSON file '${filePath}': ${String(error)}`,
        'ERR_PLUGIN_LOAD',
        500,
        { filePath },
      );
    }

    return this.parseText(text, config);
  }

  /**
   * Parse JSON from a raw text string.
   */
  parseText(text: string, rawConfig: unknown = {}): QueryResult {
    const config = JsonImportConfigSchema.parse(rawConfig);
    const startTime = Date.now();

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new MeridianError(
        `Invalid JSON: ${String(error)}`,
        'ERR_VALIDATION',
        400,
      );
    }

    // Navigate to the desired data path
    const data = resolvePath(parsed, config.dataPath);

    if (data === undefined || data === null) {
      this.context.logger.warn('JSON data path resolved to null/undefined', {
        dataPath: config.dataPath,
      });
      return emptyResult(startTime);
    }

    // Normalise to an array of records
    let records: unknown[];
    if (Array.isArray(data)) {
      records = data;
    } else if (typeof data === 'object') {
      if (config.wrapObject) {
        records = [data];
      } else {
        this.context.logger.warn(
          'JSON root is an object but wrapObject=false; returning empty result',
        );
        return emptyResult(startTime);
      }
    } else {
      // Scalar value — wrap in a single row
      records = [{ value: data }];
    }

    // Normalise each row
    let rows: Record<string, unknown>[] = records.map((r) =>
      normaliseRow(r, config),
    );

    // Apply maxRows
    let truncated = false;
    if (config.maxRows > 0 && rows.length > config.maxRows) {
      rows = rows.slice(0, config.maxRows);
      truncated = true;
    }

    if (rows.length === 0) {
      return emptyResult(startTime);
    }

    // Discover schema
    let columns = discoverSchema(rows, config);
    columns = applyColumnFilter(columns, config);

    const colNames = new Set(columns.map((c) => c.name));

    // Build result rows containing only the selected columns
    const resultRows: Record<string, unknown>[] = rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const col of columns) {
        const val = row[col.name];
        out[col.name] =
          !config.preserveNulls && (val === null || val === undefined)
            ? ''
            : val ?? null;
      }
      // Add any column present in this row that was not in schema discovery sample
      for (const key of Object.keys(row)) {
        if (!colNames.has(key)) {
          // Add dynamically discovered column
          out[key] = row[key];
        }
      }
      return out;
    });

    this.context.logger.info('JSON import complete', {
      rows: resultRows.length,
      columns: columns.length,
      truncated,
    });

    return {
      columns,
      rows: resultRows,
      rowCount: resultRows.length,
      executionTimeMs: Date.now() - startTime,
      truncated,
    };
  }

  /**
   * TransformationPlugin.transform implementation.
   *
   * Expects config to contain either:
   * - jsonText: string — parse inline JSON text
   * - (or falls back to first cell of input QueryResult)
   */
  transform(data: QueryResult, config: unknown): QueryResult {
    const rawConfig = config as Record<string, unknown> & {
      jsonText?: string;
    };

    if (typeof rawConfig?.jsonText === 'string') {
      return this.parseText(rawConfig.jsonText, rawConfig);
    }

    // Fall back to first cell of input as JSON text
    if (data.rows.length > 0 && data.columns.length > 0) {
      const firstCol = data.columns[0].name;
      const jsonText = String(data.rows[0][firstCol] ?? 'null');
      return this.parseText(jsonText, rawConfig);
    }

    return emptyResult(0);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function emptyResult(startTime: number): QueryResult {
  return {
    columns: [],
    rows: [],
    rowCount: 0,
    executionTimeMs: Date.now() - startTime,
    truncated: false,
  };
}

// ── Plugin Module Export ─────────────────────────────────────────────

const pluginModule: PluginModule = {
  default: (context: PluginContext) => new JsonImportPlugin(context),
};

export default pluginModule.default;

// ── Built-in Manifest ────────────────────────────────────────────────

export const JSON_IMPORT_MANIFEST = {
  name: 'json-import',
  version: '1.0.0',
  type: 'transformation' as const,
  description: 'Import and parse JSON files or text into QueryResult format',
  author: 'Meridian Core Team',
  entryPoint: './built-in/json-import.plugin.js',
  tags: ['json', 'import', 'transformation', 'built-in'],
  configKeys: [
    'dataPath',
    'flattenObjects',
    'flattenDepth',
    'includeArraysAsJson',
    'includeColumns',
    'excludeColumns',
    'maxRows',
    'preserveNulls',
    'encoding',
    'wrapObject',
    'parseStringValues',
  ],
};
