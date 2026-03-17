import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  AuthorizationError,
  NotFoundError,
} from '@meridian/shared';
import type { ServiceContainer } from '../services/container.js';

// ── Request Schemas ─────────────────────────────────────────────────

const idParamSchema = z.object({
  id: z.string().min(1, 'ID is required'),
});

const exportQuestionBodySchema = z.object({
  format: z.enum(['csv', 'json', 'xlsx']).default('csv'),
  limit: z.coerce.number().int().positive().max(100_000).default(10_000),
  parameters: z.record(z.unknown()).optional(),
  includeHeaders: z.boolean().optional().default(true),
  delimiter: z.string().max(3).optional().default(','),
  encoding: z.enum(['utf-8', 'utf-16', 'latin1']).optional().default('utf-8'),
  filename: z.string().max(255).optional(),
});

const exportDashboardBodySchema = z.object({
  format: z.enum(['pdf', 'png', 'json']).default('pdf'),
  filename: z.string().max(255).optional(),
  pageSize: z.enum(['A4', 'A3', 'letter', 'legal']).optional().default('A4'),
  orientation: z.enum(['portrait', 'landscape']).optional().default('landscape'),
  includeFilters: z.boolean().optional().default(true),
  theme: z.enum(['light', 'dark', 'auto']).optional().default('light'),
  title: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
});

// ── Response Types ──────────────────────────────────────────────────

interface ExportJobResponse {
  jobId: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  format: string;
  resourceType: 'question' | 'dashboard';
  resourceId: string;
  filename: string;
  downloadUrl?: string;
  fileSizeBytes?: number;
  rowCount?: number;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

// ── In-Memory Export Job Store ───────────────────────────────────────

interface ExportJob {
  jobId: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  format: string;
  resourceType: 'question' | 'dashboard';
  resourceId: string;
  organizationId: string;
  requestedBy: string;
  filename: string;
  content?: string;
  fileSizeBytes?: number;
  rowCount?: number;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

const exportJobStore = new Map<string, ExportJob>();

function toExportJobResponse(job: ExportJob): ExportJobResponse {
  return {
    jobId: job.jobId,
    status: job.status,
    format: job.format,
    resourceType: job.resourceType,
    resourceId: job.resourceId,
    filename: job.filename,
    downloadUrl: job.status === 'complete'
      ? `/api/export/download/${job.jobId}`
      : undefined,
    fileSizeBytes: job.fileSizeBytes,
    rowCount: job.rowCount,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString(),
    error: job.error,
  };
}

/**
 * Generate stub CSV content from column metadata.
 * In production this would stream real query results.
 */
function generateCsvContent(
  columns: Array<{ name: string }>,
  rows: unknown[][],
  options: { includeHeaders: boolean; delimiter: string },
): string {
  const lines: string[] = [];
  if (options.includeHeaders) {
    lines.push(columns.map((c) => JSON.stringify(c.name)).join(options.delimiter));
  }
  for (const row of rows) {
    lines.push(
      row.map((cell) => {
        if (cell === null || cell === undefined) return '';
        const s = String(cell);
        if (s.includes(options.delimiter) || s.includes('"') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      }).join(options.delimiter),
    );
  }
  return lines.join('\n');
}

// ── Route Registration ──────────────────────────────────────────────

/**
 * Export routes — CSV, JSON, and PDF export for questions and dashboards.
 */
export async function exportRoutes(
  app: FastifyInstance,
  container: ServiceContainer,
): Promise<void> {
  const { questionService, dashboardService, logger } = container;

  // ── POST /api/export/question/:id — Export question results ─────

  app.post('/api/export/question/:id', {
    preHandler: [app.requireAuth, app.requirePermission('question:read')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);
    const body = exportQuestionBodySchema.parse(request.body ?? {});

    // Verify the question exists and belongs to this org
    const questionResult = await questionService.getById(id);
    if (!questionResult.ok) throw questionResult.error;
    if (questionResult.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this question');
    }

    const question = questionResult.value;
    const jobId = crypto.randomUUID();
    const filename = body.filename
      ?? `${question.name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()}_${Date.now()}.${body.format}`;

    const job: ExportJob = {
      jobId,
      status: 'processing',
      format: body.format,
      resourceType: 'question',
      resourceId: id,
      organizationId: user.orgId,
      requestedBy: user.sub,
      filename,
      createdAt: new Date(),
    };

    exportJobStore.set(jobId, job);

    // Stub: simulate synchronous CSV generation for small result sets.
    // In production this would be an async worker job.
    const stubColumns = [
      { name: 'id', type: 'integer' },
      { name: 'value', type: 'text' },
    ];
    const stubRows: unknown[][] = [];

    if (body.format === 'csv') {
      const csvContent = generateCsvContent(stubColumns, stubRows, {
        includeHeaders: body.includeHeaders,
        delimiter: body.delimiter,
      });
      job.content = csvContent;
      job.fileSizeBytes = Buffer.byteLength(csvContent, 'utf-8');
    } else if (body.format === 'json') {
      const jsonContent = JSON.stringify({
        question: { id: question.id, name: question.name },
        columns: stubColumns,
        rows: stubRows,
        rowCount: stubRows.length,
        exportedAt: new Date().toISOString(),
      }, null, 2);
      job.content = jsonContent;
      job.fileSizeBytes = Buffer.byteLength(jsonContent, 'utf-8');
    } else {
      // xlsx: stub — not truly generated without a library
      job.fileSizeBytes = 0;
    }

    job.rowCount = stubRows.length;
    job.status = 'complete';
    job.completedAt = new Date();
    exportJobStore.set(jobId, job);

    logger.info('Question export created', {
      jobId,
      questionId: id,
      format: body.format,
      userId: user.sub,
    });

    return reply.status(202).send({ data: toExportJobResponse(job) });
  });

  // ── POST /api/export/dashboard/:id — Export dashboard ───────────

  app.post('/api/export/dashboard/:id', {
    preHandler: [app.requireAuth, app.requirePermission('dashboard:read')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);
    const body = exportDashboardBodySchema.parse(request.body ?? {});

    // Verify the dashboard exists and belongs to this org
    const dashResult = await dashboardService.getById(id);
    if (!dashResult.ok) throw dashResult.error;
    if (dashResult.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this dashboard');
    }

    const dashboard = dashResult.value;
    const jobId = crypto.randomUUID();
    const filename = body.filename
      ?? `${dashboard.name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()}_${Date.now()}.${body.format}`;

    const job: ExportJob = {
      jobId,
      status: 'processing',
      format: body.format,
      resourceType: 'dashboard',
      resourceId: id,
      organizationId: user.orgId,
      requestedBy: user.sub,
      filename,
      createdAt: new Date(),
    };

    exportJobStore.set(jobId, job);

    if (body.format === 'json') {
      const jsonContent = JSON.stringify({
        dashboard: {
          id: dashboard.id,
          name: dashboard.name,
          description: dashboard.description,
          cardCount: dashboard.cardCount,
          layout: dashboard.layout,
        },
        exportOptions: {
          includeFilters: body.includeFilters,
          theme: body.theme,
          title: body.title,
          description: body.description,
        },
        exportedAt: new Date().toISOString(),
      }, null, 2);
      job.content = jsonContent;
      job.fileSizeBytes = Buffer.byteLength(jsonContent, 'utf-8');
    } else {
      // pdf / png: stub — would require headless browser in production
      job.fileSizeBytes = 0;
    }

    job.status = 'complete';
    job.completedAt = new Date();
    exportJobStore.set(jobId, job);

    logger.info('Dashboard export created', {
      jobId,
      dashboardId: id,
      format: body.format,
      userId: user.sub,
    });

    return reply.status(202).send({ data: toExportJobResponse(job) });
  });

  // ── GET /api/export/jobs — List export jobs for org ─────────────

  app.get('/api/export/jobs', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;

    const query = z.object({
      status: z.enum(['pending', 'processing', 'complete', 'failed']).optional(),
      resourceType: z.enum(['question', 'dashboard']).optional(),
      limit: z.coerce.number().int().positive().max(100).default(25),
      offset: z.coerce.number().int().nonnegative().default(0),
    }).parse(request.query);

    let jobs = Array.from(exportJobStore.values()).filter(
      (j) => j.organizationId === user.orgId,
    );

    if (query.status) jobs = jobs.filter((j) => j.status === query.status);
    if (query.resourceType) jobs = jobs.filter((j) => j.resourceType === query.resourceType);

    // Sort by createdAt descending
    jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = jobs.length;
    const page = jobs.slice(query.offset, query.offset + query.limit);

    return reply.status(200).send({
      data: page.map(toExportJobResponse),
      meta: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + query.limit < total,
      },
    });
  });

  // ── GET /api/export/jobs/:jobId — Get export job status ─────────

  app.get('/api/export/jobs/:jobId', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { jobId } = z.object({ jobId: z.string().min(1) }).parse(request.params);

    const job = exportJobStore.get(jobId);
    if (!job || job.organizationId !== user.orgId) {
      throw new NotFoundError('ExportJob', jobId);
    }

    return reply.status(200).send({ data: toExportJobResponse(job) });
  });

  // ── GET /api/export/download/:jobId — Download export file ──────

  app.get('/api/export/download/:jobId', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { jobId } = z.object({ jobId: z.string().min(1) }).parse(request.params);

    const job = exportJobStore.get(jobId);
    if (!job || job.organizationId !== user.orgId) {
      throw new NotFoundError('ExportJob', jobId);
    }

    if (job.status !== 'complete') {
      return reply.status(409).send({
        error: {
          code: 'ERR_EXPORT_NOT_READY',
          message: `Export job is not complete (current status: ${job.status})`,
          statusCode: 409,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      });
    }

    const contentTypeMap: Record<string, string> = {
      csv: 'text/csv; charset=utf-8',
      json: 'application/json',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pdf: 'application/pdf',
      png: 'image/png',
    };

    const contentType = contentTypeMap[job.format] ?? 'application/octet-stream';
    const content = job.content ?? '';

    void reply.header('Content-Type', contentType);
    void reply.header('Content-Disposition', `attachment; filename="${job.filename}"`);
    void reply.header('X-Export-Job-Id', jobId);
    void reply.header('X-Export-Row-Count', String(job.rowCount ?? 0));

    logger.info('Export downloaded', {
      jobId,
      filename: job.filename,
      format: job.format,
      userId: user.sub,
    });

    return reply.status(200).send(content);
  });

  // ── DELETE /api/export/jobs/:jobId — Delete export job ──────────

  app.delete('/api/export/jobs/:jobId', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { jobId } = z.object({ jobId: z.string().min(1) }).parse(request.params);

    const job = exportJobStore.get(jobId);
    if (!job || job.organizationId !== user.orgId) {
      throw new NotFoundError('ExportJob', jobId);
    }

    exportJobStore.delete(jobId);

    logger.info('Export job deleted', { jobId, userId: user.sub });

    return reply.status(204).send();
  });
}
