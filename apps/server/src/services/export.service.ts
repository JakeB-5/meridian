import { ok, err, NotFoundError, type Result } from '@meridian/shared';

// ── Domain Types ────────────────────────────────────────────────────

export type ExportFormat = 'csv' | 'json' | 'xlsx' | 'pdf' | 'png';
export type ExportStatus = 'pending' | 'processing' | 'complete' | 'failed';
export type ExportResourceType = 'question' | 'dashboard';

export interface ColumnMeta {
  name: string;
  type: string;
  nullable?: boolean;
}

export interface ExportOptions {
  /** Output format */
  format: ExportFormat;
  /** Resource type being exported */
  resourceType: ExportResourceType;
  /** Resource entity ID */
  resourceId: string;
  /** Owning organization ID */
  organizationId: string;
  /** User requesting the export */
  requestedBy: string;
  /** Override the default filename (without extension) */
  filenameStem?: string;
  /** Maximum number of rows to include (default: 10 000) */
  limit?: number;
  /** Query parameters forwarded to the underlying query engine */
  parameters?: Record<string, unknown>;
  /** CSV: include header row (default: true) */
  includeHeaders?: boolean;
  /** CSV: field delimiter character (default: ',') */
  delimiter?: string;
  /** CSV: text encoding (default: 'utf-8') */
  encoding?: 'utf-8' | 'utf-16' | 'latin1';
  /** PDF: page size (default: 'A4') */
  pageSize?: 'A4' | 'A3' | 'letter' | 'legal';
  /** PDF: page orientation (default: 'landscape') */
  orientation?: 'portrait' | 'landscape';
  /** Whether to include dashboard filter state in the export */
  includeFilters?: boolean;
  /** Visual theme for rendered exports */
  theme?: 'light' | 'dark' | 'auto';
}

export interface ExportJob {
  jobId: string;
  status: ExportStatus;
  format: ExportFormat;
  resourceType: ExportResourceType;
  resourceId: string;
  organizationId: string;
  requestedBy: string;
  filename: string;
  /** Raw file content for text formats (csv, json) */
  content?: string;
  /** Raw bytes for binary formats */
  contentBuffer?: Buffer;
  fileSizeBytes: number;
  rowCount?: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface ExportResult {
  jobId: string;
  status: ExportStatus;
  filename: string;
  format: ExportFormat;
  fileSizeBytes: number;
  rowCount?: number;
  downloadPath: string;
  createdAt: string;
  completedAt?: string;
}

// ── CSV Utilities ────────────────────────────────────────────────────

/**
 * Escape a single CSV cell value, quoting when necessary.
 */
function escapeCsvCell(value: unknown, delimiter: string): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  const needsQuote =
    s.includes(delimiter) || s.includes('"') || s.includes('\n') || s.includes('\r');
  if (needsQuote) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Serialise a result set (columns + rows) to a CSV string.
 */
export function rowsToCsv(
  columns: ColumnMeta[],
  rows: unknown[][],
  options: { includeHeaders: boolean; delimiter: string },
): string {
  const lines: string[] = [];

  if (options.includeHeaders) {
    lines.push(
      columns
        .map((c) => escapeCsvCell(c.name, options.delimiter))
        .join(options.delimiter),
    );
  }

  for (const row of rows) {
    lines.push(
      row.map((cell) => escapeCsvCell(cell, options.delimiter)).join(options.delimiter),
    );
  }

  return lines.join('\n');
}

/**
 * Serialise a result set to a JSON document.
 */
export function rowsToJson(
  resourceMeta: { id: string; name: string; type?: string },
  columns: ColumnMeta[],
  rows: unknown[][],
): string {
  // Convert each row array to a keyed object for readability
  const objects = rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i].name] = row[i] ?? null;
    }
    return obj;
  });

  return JSON.stringify(
    {
      resource: resourceMeta,
      columns: columns.map((c) => ({ name: c.name, type: c.type })),
      data: objects,
      rowCount: objects.length,
      exportedAt: new Date().toISOString(),
    },
    null,
    2,
  );
}

// ── Export Service ───────────────────────────────────────────────────

/**
 * In-memory export service.
 *
 * Manages the lifecycle of export jobs and performs content generation
 * for text-based formats (CSV, JSON).  Binary formats (XLSX, PDF, PNG)
 * are stubbed — a production implementation would delegate to a headless
 * browser or spreadsheet library.
 */
export class ExportService {
  private readonly jobs = new Map<string, ExportJob>();

  // ── Job Management ─────────────────────────────────────────────

  /**
   * Look up an export job by ID.
   */
  async getJob(jobId: string): Promise<Result<ExportJob>> {
    const job = this.jobs.get(jobId);
    if (!job) return err(new NotFoundError('ExportJob', jobId));
    return ok(job);
  }

  /**
   * List export jobs for an organization, optionally filtered.
   */
  async listJobs(options: {
    organizationId: string;
    status?: ExportStatus;
    resourceType?: ExportResourceType;
    limit?: number;
    offset?: number;
  }): Promise<Result<{ jobs: ExportJob[]; total: number }>> {
    let jobs = Array.from(this.jobs.values()).filter(
      (j) => j.organizationId === options.organizationId,
    );

    if (options.status) {
      jobs = jobs.filter((j) => j.status === options.status);
    }
    if (options.resourceType) {
      jobs = jobs.filter((j) => j.resourceType === options.resourceType);
    }

    jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = jobs.length;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 25;
    return ok({ jobs: jobs.slice(offset, offset + limit), total });
  }

  /**
   * Delete an export job and its associated content.
   */
  async deleteJob(
    jobId: string,
    organizationId: string,
  ): Promise<Result<void>> {
    const job = this.jobs.get(jobId);
    if (!job || job.organizationId !== organizationId) {
      return err(new NotFoundError('ExportJob', jobId));
    }
    this.jobs.delete(jobId);
    return ok(undefined);
  }

  // ── Export Creation ────────────────────────────────────────────

  /**
   * Create and immediately execute an export job for a question result set.
   *
   * In production this would enqueue the job and process it asynchronously.
   * Here we process it synchronously for simplicity.
   */
  async exportQuestion(
    options: ExportOptions,
    columns: ColumnMeta[],
    rows: unknown[][],
  ): Promise<Result<ExportResult>> {
    const jobId = crypto.randomUUID();
    const now = new Date();
    const ext = options.format;
    const stem = options.filenameStem
      ?? `export_question_${options.resourceId}`;
    const filename = `${stem}_${now.getTime()}.${ext}`;

    const job: ExportJob = {
      jobId,
      status: 'processing',
      format: options.format,
      resourceType: 'question',
      resourceId: options.resourceId,
      organizationId: options.organizationId,
      requestedBy: options.requestedBy,
      filename,
      fileSizeBytes: 0,
      rowCount: rows.length,
      createdAt: now,
      startedAt: now,
    };

    this.jobs.set(jobId, job);

    try {
      switch (options.format) {
        case 'csv': {
          const csv = rowsToCsv(columns, rows, {
            includeHeaders: options.includeHeaders ?? true,
            delimiter: options.delimiter ?? ',',
          });
          job.content = csv;
          job.fileSizeBytes = Buffer.byteLength(csv, 'utf-8');
          break;
        }
        case 'json': {
          const json = rowsToJson(
            { id: options.resourceId, name: stem },
            columns,
            rows,
          );
          job.content = json;
          job.fileSizeBytes = Buffer.byteLength(json, 'utf-8');
          break;
        }
        case 'xlsx':
          // XLSX requires a library such as ExcelJS — stub for now
          job.content = '';
          job.fileSizeBytes = 0;
          break;
        default:
          job.content = '';
          job.fileSizeBytes = 0;
      }

      job.status = 'complete';
      job.completedAt = new Date();
    } catch (error) {
      job.status = 'failed';
      job.error = (error as Error).message;
      job.completedAt = new Date();
    }

    this.jobs.set(jobId, job);

    return ok(this.toResult(job));
  }

  /**
   * Create and immediately execute an export job for a dashboard.
   */
  async exportDashboard(
    options: ExportOptions,
    dashboardMeta: { id: string; name: string; cardCount: number },
  ): Promise<Result<ExportResult>> {
    const jobId = crypto.randomUUID();
    const now = new Date();
    const ext = options.format;
    const stem = options.filenameStem
      ?? `export_dashboard_${options.resourceId}`;
    const filename = `${stem}_${now.getTime()}.${ext}`;

    const job: ExportJob = {
      jobId,
      status: 'processing',
      format: options.format,
      resourceType: 'dashboard',
      resourceId: options.resourceId,
      organizationId: options.organizationId,
      requestedBy: options.requestedBy,
      filename,
      fileSizeBytes: 0,
      createdAt: now,
      startedAt: now,
    };

    this.jobs.set(jobId, job);

    try {
      switch (options.format) {
        case 'json': {
          const json = JSON.stringify(
            {
              resource: dashboardMeta,
              exportOptions: {
                includeFilters: options.includeFilters ?? true,
                theme: options.theme ?? 'light',
                pageSize: options.pageSize ?? 'A4',
                orientation: options.orientation ?? 'landscape',
              },
              exportedAt: now.toISOString(),
            },
            null,
            2,
          );
          job.content = json;
          job.fileSizeBytes = Buffer.byteLength(json, 'utf-8');
          break;
        }
        case 'pdf':
        case 'png':
          // Requires headless browser (Puppeteer/Playwright) — stub
          job.content = '';
          job.fileSizeBytes = 0;
          break;
        default:
          job.content = '';
          job.fileSizeBytes = 0;
      }

      job.status = 'complete';
      job.completedAt = new Date();
    } catch (error) {
      job.status = 'failed';
      job.error = (error as Error).message;
      job.completedAt = new Date();
    }

    this.jobs.set(jobId, job);

    return ok(this.toResult(job));
  }

  // ── Download ───────────────────────────────────────────────────

  /**
   * Retrieve the raw content of a completed export job for streaming
   * to the client.
   */
  async getDownloadContent(
    jobId: string,
    organizationId: string,
  ): Promise<Result<{ content: string | Buffer; filename: string; mimeType: string }>> {
    const job = this.jobs.get(jobId);
    if (!job || job.organizationId !== organizationId) {
      return err(new NotFoundError('ExportJob', jobId));
    }

    if (job.status !== 'complete') {
      const { MeridianError } = await import('@meridian/shared');
      return err(
        new MeridianError(
          `Export job is not complete (status: ${job.status})`,
          'ERR_EXPORT_NOT_READY',
          409,
        ),
      );
    }

    const mimeMap: Record<ExportFormat, string> = {
      csv: 'text/csv; charset=utf-8',
      json: 'application/json',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pdf: 'application/pdf',
      png: 'image/png',
    };

    return ok({
      content: job.contentBuffer ?? job.content ?? '',
      filename: job.filename,
      mimeType: mimeMap[job.format] ?? 'application/octet-stream',
    });
  }

  // ── Private Helpers ────────────────────────────────────────────

  private toResult(job: ExportJob): ExportResult {
    return {
      jobId: job.jobId,
      status: job.status,
      filename: job.filename,
      format: job.format,
      fileSizeBytes: job.fileSizeBytes,
      rowCount: job.rowCount,
      downloadPath: `/api/export/download/${job.jobId}`,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString(),
    };
  }
}
