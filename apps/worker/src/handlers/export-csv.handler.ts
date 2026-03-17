// Handler: export_csv
// Executes a question's query and writes the result as a CSV file to disk.
// Returns the output file path for the caller to serve/download.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '@meridian/shared';
import type { QueryResult, ColumnInfo } from '@meridian/shared';
import type { WorkerConfig } from '../config.js';

const logger = createLogger('@meridian/worker:export-csv');

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

export interface ExportCsvPayload {
  /** Question ID whose results to export */
  questionId: string;
  /** Organization the question belongs to */
  organizationId: string;
  /** Optional filename override (without extension) */
  filename?: string;
  /** Whether to include a header row (default: true) */
  includeHeader?: boolean;
  /** CSV delimiter character (default: ',') */
  delimiter?: string;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface ExportCsvResult {
  questionId: string;
  filePath: string;
  filename: string;
  rowCount: number;
  columnCount: number;
  fileSizeBytes: number;
  exportedAt: string;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export class ExportCsvHandler {
  constructor(private readonly config: WorkerConfig) {}

  async handle(
    data: Record<string, unknown>,
    progress: (percent: number) => void,
  ): Promise<ExportCsvResult> {
    const payload = data as unknown as ExportCsvPayload;
    const {
      questionId,
      organizationId,
      filename: filenameOverride,
      includeHeader = true,
      delimiter = ',',
    } = payload;

    if (!questionId) {
      throw new Error('questionId is required in export_csv job data');
    }

    logger.info('Starting CSV export', { questionId, organizationId });
    await progress(5);

    // Load DB dependencies
    const { createDatabaseFromUrl } = await import('@meridian/db');
    const db = createDatabaseFromUrl(this.config.databaseUrl);
    await progress(10);

    const { QuestionRepository } = await import('@meridian/db');
    const questionRepo = new QuestionRepository(db);
    const question = await questionRepo.findById(questionId);
    if (!question) {
      throw new Error(`Question not found: ${questionId}`);
    }

    await progress(20);

    const { DataSourceRepository } = await import('@meridian/db');
    const datasourceRepo = new DataSourceRepository(db);
    const datasource = await datasourceRepo.findById(question.dataSourceId);
    if (!datasource) {
      throw new Error(`DataSource not found: ${question.dataSourceId}`);
    }

    await progress(30);

    // Extract SQL
    const sql = extractSql(question.query);
    if (!sql) {
      throw new Error(
        `Question ${questionId} has no executable SQL. Only SQL-type questions can be exported.`,
      );
    }

    // Connect and execute
    const { createConnector } = await import('@meridian/connectors');
    const dsConfig = {
      id: datasource.id,
      name: datasource.name,
      type: datasource.type,
      ...(datasource.config as Record<string, unknown>),
    };

    const connector = createConnector(dsConfig);

    let result: QueryResult;
    try {
      await connector.connect();
      await progress(40);

      logger.info('Executing query for CSV export', {
        questionId,
        sqlPreview: sql.substring(0, 120),
      });

      result = await connector.executeQuery(sql);
      await progress(70);
    } finally {
      await connector.disconnect().catch((err: Error) => {
        logger.warn('Connector disconnect failed after CSV export query', {
          questionId,
          error: err.message,
        });
      });
    }

    // Format CSV
    await progress(75);
    const csvContent = formatAsCsv(result, { includeHeader, delimiter });
    await progress(85);

    // Write to temp file
    const timestamp = Date.now();
    const safeFilename = filenameOverride
      ? sanitizeFilename(filenameOverride)
      : `export_${questionId}_${timestamp}`;
    const outputFilename = `${safeFilename}.csv`;
    const outputPath = path.join(this.config.tmpDir, outputFilename);

    await fs.promises.writeFile(outputPath, csvContent, 'utf-8');
    const stats = await fs.promises.stat(outputPath);

    await progress(95);

    logger.info('CSV export complete', {
      questionId,
      filePath: outputPath,
      rowCount: result.rowCount,
      fileSizeBytes: stats.size,
    });

    await progress(100);

    return {
      questionId,
      filePath: outputPath,
      filename: outputFilename,
      rowCount: result.rowCount,
      columnCount: result.columns.length,
      fileSizeBytes: stats.size,
      exportedAt: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// CSV Formatting
// ---------------------------------------------------------------------------

interface CsvFormatOptions {
  includeHeader: boolean;
  delimiter: string;
}

/**
 * Format a QueryResult as a CSV string.
 * Values are quoted with double-quotes; embedded quotes are doubled.
 */
export function formatAsCsv(
  result: QueryResult,
  options: CsvFormatOptions = { includeHeader: true, delimiter: ',' },
): string {
  const { includeHeader, delimiter } = options;
  const lines: string[] = [];

  if (includeHeader && result.columns.length > 0) {
    const headerRow = result.columns
      .map((col: ColumnInfo) => quoteCsvField(col.name, delimiter))
      .join(delimiter);
    lines.push(headerRow);
  }

  for (const row of result.rows) {
    const csvRow = result.columns
      .map((col: ColumnInfo) => {
        const value = (row as Record<string, unknown>)[col.name];
        return quoteCsvField(formatCsvValue(value), delimiter);
      })
      .join(delimiter);
    lines.push(csvRow);
  }

  return lines.join('\r\n');
}

/**
 * Convert a value to its CSV string representation.
 */
function formatCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Quote a CSV field if it contains special characters.
 */
function quoteCsvField(value: string, delimiter: string): string {
  const needsQuoting =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r');

  if (!needsQuoting) {
    return value;
  }

  // Escape embedded double-quotes by doubling them
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Sanitize a filename by removing path traversal and invalid characters.
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\.\./g, '_')
    .substring(0, 200);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractSql(query: Record<string, unknown>): string | null {
  if (typeof query['sql'] === 'string' && query['sql'].trim().length > 0) {
    return query['sql'];
  }
  return null;
}
