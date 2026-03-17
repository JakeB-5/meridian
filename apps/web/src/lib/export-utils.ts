// ── Data export utilities ────────────────────────────────────────────
// Functions for exporting query results and dashboard data.

import { downloadBlob } from './utils';
import type { QueryResult } from '@/api/types';

/**
 * Export query result as CSV file.
 */
export function exportResultAsCsv(
  result: QueryResult,
  filename = 'query-results.csv',
): void {
  const headers = result.columns.map((c) => c.name);
  const csvRows: string[] = [
    headers.map(escapeCsvField).join(','),
    ...result.rows.map((row) =>
      headers.map((h) => escapeCsvField(formatCellForExport(row[h]))).join(','),
    ),
  ];

  const content = csvRows.join('\n');
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
  downloadBlob(blob, filename);
}

/**
 * Export query result as JSON file.
 */
export function exportResultAsJson(
  result: QueryResult,
  filename = 'query-results.json',
): void {
  const data = {
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rowCount,
    executionTimeMs: result.executionTimeMs,
    exportedAt: new Date().toISOString(),
  };

  const content = JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  downloadBlob(blob, filename);
}

/**
 * Export query result as TSV (tab-separated values) file.
 */
export function exportResultAsTsv(
  result: QueryResult,
  filename = 'query-results.tsv',
): void {
  const headers = result.columns.map((c) => c.name);
  const tsvRows: string[] = [
    headers.join('\t'),
    ...result.rows.map((row) =>
      headers.map((h) => formatCellForExport(row[h]).replace(/\t/g, ' ')).join('\t'),
    ),
  ];

  const content = tsvRows.join('\n');
  const blob = new Blob([content], { type: 'text/tab-separated-values' });
  downloadBlob(blob, filename);
}

/**
 * Generate a Markdown table from query result.
 */
export function exportResultAsMarkdown(result: QueryResult): string {
  const headers = result.columns.map((c) => c.name);

  const headerRow = `| ${headers.join(' | ')} |`;
  const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;
  const dataRows = result.rows.map(
    (row) => `| ${headers.map((h) => formatCellForExport(row[h])).join(' | ')} |`,
  );

  return [headerRow, separatorRow, ...dataRows].join('\n');
}

/**
 * Copy query result as a tab-separated table to clipboard.
 * This pastes well into spreadsheets.
 */
export async function copyResultToClipboard(result: QueryResult): Promise<boolean> {
  const headers = result.columns.map((c) => c.name);
  const rows = result.rows.map((row) =>
    headers.map((h) => formatCellForExport(row[h])).join('\t'),
  );
  const text = [headers.join('\t'), ...rows].join('\n');

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate SQL INSERT statements from query result.
 */
export function exportResultAsSqlInserts(
  result: QueryResult,
  tableName: string,
): string {
  if (result.rows.length === 0) return `-- No data to export for table: ${tableName}`;

  const columns = result.columns.map((c) => c.name);
  const columnList = columns.map((c) => `"${c}"`).join(', ');

  const statements = result.rows.map((row) => {
    const values = columns.map((col) => {
      const value = row[col];
      if (value === null || value === undefined) return 'NULL';
      if (typeof value === 'number') return String(value);
      if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
      return `'${String(value).replace(/'/g, "''")}'`;
    });
    return `INSERT INTO "${tableName}" (${columnList}) VALUES (${values.join(', ')});`;
  });

  return [
    `-- Exported ${result.rows.length} rows for table: ${tableName}`,
    `-- Generated at: ${new Date().toISOString()}`,
    '',
    ...statements,
  ].join('\n');
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatCellForExport(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function escapeCsvField(value: string): string {
  // If the field contains comma, newline, or quote, wrap in quotes
  if (value.includes(',') || value.includes('\n') || value.includes('"') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Estimate the size of a CSV export in bytes.
 */
export function estimateCsvSize(result: QueryResult): number {
  const headers = result.columns.map((c) => c.name);
  let size = headers.join(',').length + 1; // header row + newline

  // Sample first 10 rows to estimate average row size
  const sampleSize = Math.min(10, result.rows.length);
  let totalRowSize = 0;

  for (let i = 0; i < sampleSize; i++) {
    const row = result.rows[i];
    const rowStr = headers.map((h) => formatCellForExport(row[h])).join(',');
    totalRowSize += rowStr.length + 1; // +1 for newline
  }

  const avgRowSize = sampleSize > 0 ? totalRowSize / sampleSize : 0;
  size += avgRowSize * result.rows.length;

  return Math.ceil(size);
}

/**
 * Format export types with their file extensions and MIME types.
 */
export const EXPORT_FORMATS = [
  { id: 'csv', label: 'CSV', extension: '.csv', mimeType: 'text/csv' },
  { id: 'tsv', label: 'TSV', extension: '.tsv', mimeType: 'text/tab-separated-values' },
  { id: 'json', label: 'JSON', extension: '.json', mimeType: 'application/json' },
  { id: 'markdown', label: 'Markdown', extension: '.md', mimeType: 'text/markdown' },
  { id: 'sql', label: 'SQL Inserts', extension: '.sql', mimeType: 'text/plain' },
] as const;

export type ExportFormat = typeof EXPORT_FORMATS[number]['id'];
