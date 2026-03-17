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

export const CsvImportConfigSchema = z.object({
  /** Field delimiter character. Default: "," */
  delimiter: z.string().min(1).max(4).default(','),
  /** Whether the first row contains column headers. Default: true */
  hasHeaders: z.boolean().default(true),
  /** Quote character for fields containing delimiters. Default: '"' */
  quoteChar: z.string().length(1).default('"'),
  /** Escape character within quoted fields. Default: '"' (doubled-quote convention) */
  escapeChar: z.string().length(1).default('"'),
  /** Lines to skip at the beginning of the file. Default: 0 */
  skipLines: z.number().int().min(0).default(0),
  /** Maximum rows to parse (0 = unlimited). Default: 0 */
  maxRows: z.number().int().min(0).default(0),
  /** Trim whitespace from field values. Default: true */
  trimValues: z.boolean().default(true),
  /** Treat empty string fields as null. Default: false */
  emptyAsNull: z.boolean().default(false),
  /** Encoding for file reads. Default: "utf-8" */
  encoding: z
    .enum(['utf-8', 'utf8', 'ascii', 'latin1'])
    .default('utf-8'),
  /** Newline style ('auto' detects CRLF vs LF). Default: "auto" */
  newline: z.enum(['auto', '\n', '\r\n']).default('auto'),
});

export type CsvImportConfig = z.infer<typeof CsvImportConfigSchema>;

// ── CSV Parser ───────────────────────────────────────────────────────

/**
 * Parse CSV text into a 2-D array of string values.
 * Handles quoted fields (including multi-line if present), custom delimiters,
 * and escape conventions.
 */
function parseCsvText(
  text: string,
  config: CsvImportConfig,
): string[][] {
  const { delimiter, quoteChar, escapeChar, trimValues, emptyAsNull, newline } =
    config;

  // Normalise line endings
  let normalised = text;
  if (newline === 'auto') {
    normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  } else if (newline === '\r\n') {
    normalised = text.replace(/\r\n/g, '\n');
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuote = false;
  let i = 0;

  const len = normalised.length;

  while (i < len) {
    const ch = normalised[i];

    if (inQuote) {
      // Handle escape sequence inside a quoted field
      if (ch === escapeChar && escapeChar !== quoteChar) {
        // e.g. backslash escape: \, → literal comma
        field += normalised[i + 1] ?? '';
        i += 2;
        continue;
      }

      if (ch === quoteChar) {
        // Doubled-quote escape (standard CSV): "" → "
        if (normalised[i + 1] === quoteChar && escapeChar === quoteChar) {
          field += quoteChar;
          i += 2;
          continue;
        }
        // Closing quote
        inQuote = false;
        i++;
        continue;
      }

      field += ch;
      i++;
      continue;
    }

    // Not in quote
    if (ch === quoteChar) {
      inQuote = true;
      i++;
      continue;
    }

    if (normalised.startsWith(delimiter, i)) {
      let value = field;
      if (trimValues) value = value.trim();
      row.push(emptyAsNull && value === '' ? '' : value);
      field = '';
      i += delimiter.length;
      continue;
    }

    if (ch === '\n') {
      let value = field;
      if (trimValues) value = value.trim();
      row.push(emptyAsNull && value === '' ? '' : value);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }

    field += ch;
    i++;
  }

  // Flush last field / row
  if (field !== '' || row.length > 0) {
    let value = field;
    if (trimValues) value = value.trim();
    row.push(emptyAsNull && value === '' ? '' : value);
    rows.push(row);
  }

  return rows;
}

/**
 * Infer a column type from a sample of values.
 */
function inferColumnType(values: string[]): string {
  const nonEmpty = values.filter((v) => v !== '' && v !== null);
  if (nonEmpty.length === 0) return 'string';

  const allIntegers = nonEmpty.every((v) => /^-?\d+$/.test(v));
  if (allIntegers) return 'integer';

  const allNumbers = nonEmpty.every((v) => /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v));
  if (allNumbers) return 'float';

  const allBooleans = nonEmpty.every((v) =>
    /^(true|false|yes|no|1|0)$/i.test(v),
  );
  if (allBooleans) return 'boolean';

  // ISO 8601 date detection
  const allDates = nonEmpty.every((v) =>
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?/.test(v),
  );
  if (allDates) return 'datetime';

  return 'string';
}

/**
 * Convert a string value to the appropriate JS type based on inferred column type.
 */
function coerceValue(
  value: string,
  type: string,
  emptyAsNull: boolean,
): unknown {
  if (emptyAsNull && value === '') return null;
  switch (type) {
    case 'integer':
      return value === '' ? null : parseInt(value, 10);
    case 'float':
      return value === '' ? null : parseFloat(value);
    case 'boolean':
      return /^(true|yes|1)$/i.test(value);
    default:
      return value;
  }
}

// ── CSV Import as TransformationPlugin ──────────────────────────────

/**
 * Built-in CSV import plugin.
 *
 * When used as a transformation, the input QueryResult is ignored and the
 * plugin reads a file path from config.filePath.
 *
 * The transform() method also accepts a QueryResult whose first column
 * contains raw CSV text when config.filePath is not provided — allowing
 * in-memory CSV transformation pipelines.
 */
export class CsvImportPlugin implements TransformationPlugin {
  readonly name = 'csv-import';
  readonly description =
    'Import data from CSV files or CSV text into a QueryResult';
  readonly configSchema = CsvImportConfigSchema;

  private readonly context: PluginContext;

  constructor(context: PluginContext) {
    this.context = context;
  }

  /**
   * Parse CSV from a file path.
   */
  async importFile(filePath: string, rawConfig: unknown = {}): Promise<QueryResult> {
    const config = CsvImportConfigSchema.parse(rawConfig);
    this.context.logger.info('Importing CSV file', { filePath });

    let text: string;
    try {
      text = await readFile(filePath, config.encoding as BufferEncoding);
    } catch (error) {
      throw new MeridianError(
        `Failed to read CSV file '${filePath}': ${String(error)}`,
        'ERR_PLUGIN_LOAD',
        500,
        { filePath },
      );
    }

    return this.parseText(text, config);
  }

  /**
   * Parse CSV from a raw text string.
   */
  parseText(text: string, rawConfig: unknown = {}): QueryResult {
    const config = CsvImportConfigSchema.parse(rawConfig);
    const startTime = Date.now();

    // Treat whitespace-only input as empty
    if (text.trim().length === 0) {
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: Date.now() - startTime,
        truncated: false,
      };
    }

    let rows = parseCsvText(text, config);

    // Skip leading lines
    if (config.skipLines > 0) {
      rows = rows.slice(config.skipLines);
    }

    if (rows.length === 0) {
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: Date.now() - startTime,
        truncated: false,
      };
    }

    let headers: string[];
    let dataRows: string[][];

    if (config.hasHeaders) {
      headers = rows[0].map((h, idx) => (h.trim() || `col_${idx}`));
      dataRows = rows.slice(1);
    } else {
      const width = rows[0].length;
      headers = Array.from({ length: width }, (_, i) => `col_${i}`);
      dataRows = rows;
    }

    // Apply maxRows limit
    let truncated = false;
    if (config.maxRows > 0 && dataRows.length > config.maxRows) {
      dataRows = dataRows.slice(0, config.maxRows);
      truncated = true;
    }

    // Infer column types from a sample of values (up to 100 rows)
    const sampleSize = Math.min(dataRows.length, 100);
    const columnTypes: string[] = headers.map((_, colIdx) => {
      const sample = dataRows
        .slice(0, sampleSize)
        .map((row) => row[colIdx] ?? '');
      return inferColumnType(sample);
    });

    const columns: ColumnInfo[] = headers.map((name, idx) => ({
      name,
      type: columnTypes[idx],
      nullable: true,
    }));

    const resultRows: Record<string, unknown>[] = dataRows.map((row) => {
      const record: Record<string, unknown> = {};
      for (let i = 0; i < headers.length; i++) {
        const raw = row[i] ?? '';
        record[headers[i]] = coerceValue(raw, columnTypes[i], config.emptyAsNull);
      }
      return record;
    });

    this.context.logger.info('CSV import complete', {
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
   * Config may contain:
   * - filePath: string — read from disk
   * - csvText: string — use inline text
   * - (other CsvImportConfig fields)
   *
   * If neither filePath nor csvText is provided, the first column of the first
   * row of the input QueryResult is used as the CSV text.
   */
  transform(data: QueryResult, config: unknown): QueryResult {
    const rawConfig = config as Record<string, unknown> & {
      filePath?: string;
      csvText?: string;
    };

    if (typeof rawConfig?.csvText === 'string') {
      return this.parseText(rawConfig.csvText, rawConfig);
    }

    // Fall back to first cell of input as CSV text
    if (data.rows.length > 0 && data.columns.length > 0) {
      const firstCol = data.columns[0].name;
      const csvText = String(data.rows[0][firstCol] ?? '');
      return this.parseText(csvText, rawConfig);
    }

    // Nothing to parse
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
      truncated: false,
    };
  }
}

// ── Plugin Module Export ─────────────────────────────────────────────

const pluginModule: PluginModule = {
  default: (context: PluginContext) => new CsvImportPlugin(context),
};

export default pluginModule.default;

// ── Built-in Manifest ────────────────────────────────────────────────

export const CSV_IMPORT_MANIFEST = {
  name: 'csv-import',
  version: '1.0.0',
  type: 'transformation' as const,
  description: 'Import and parse CSV files or text into QueryResult format',
  author: 'Meridian Core Team',
  entryPoint: './built-in/csv-import.plugin.js',
  tags: ['csv', 'import', 'transformation', 'built-in'],
  configKeys: [
    'delimiter',
    'hasHeaders',
    'quoteChar',
    'escapeChar',
    'skipLines',
    'maxRows',
    'trimValues',
    'emptyAsNull',
    'encoding',
    'newline',
  ],
};
