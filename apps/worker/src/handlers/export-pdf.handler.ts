// Handler: export_pdf
// Stub for PDF export — generates a simple HTML page and signals the path.
// Full implementation would use a headless browser (e.g. Puppeteer / Playwright).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '@meridian/shared';
import type { WorkerConfig } from '../config.js';

const logger = createLogger('@meridian/worker:export-pdf');

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

export interface ExportPdfPayload {
  /** Dashboard or question ID to export */
  resourceId: string;
  /** 'dashboard' | 'question' */
  resourceType: 'dashboard' | 'question';
  /** Organization the resource belongs to */
  organizationId: string;
  /** Optional filename override (without extension) */
  filename?: string;
  /** Page orientation (default: 'portrait') */
  orientation?: 'portrait' | 'landscape';
  /** Paper format (default: 'A4') */
  format?: 'A4' | 'A3' | 'Letter' | 'Legal';
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface ExportPdfResult {
  resourceId: string;
  resourceType: string;
  filePath: string;
  filename: string;
  fileSizeBytes: number;
  exportedAt: string;
  /** True when the real PDF engine was used; false for the HTML stub */
  isStub: boolean;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export class ExportPdfHandler {
  constructor(private readonly config: WorkerConfig) {}

  async handle(
    data: Record<string, unknown>,
    progress: (percent: number) => void,
  ): Promise<ExportPdfResult> {
    const payload = data as unknown as ExportPdfPayload;
    const {
      resourceId,
      resourceType = 'dashboard',
      organizationId,
      filename: filenameOverride,
      orientation = 'portrait',
      format = 'A4',
    } = payload;

    if (!resourceId) {
      throw new Error('resourceId is required in export_pdf job data');
    }

    logger.info('Starting PDF export (stub)', {
      resourceId,
      resourceType,
      organizationId,
      orientation,
      format,
    });

    await progress(10);

    // Load resource metadata for the stub HTML
    let resourceName = resourceId;
    try {
      const { createDatabaseFromUrl } = await import('@meridian/db');
      const db = createDatabaseFromUrl(this.config.databaseUrl);
      await progress(20);

      if (resourceType === 'dashboard') {
        const { DashboardRepository } = await import('@meridian/db');
        const repo = new DashboardRepository(db);
        const dashboard = await repo.findById(resourceId);
        if (dashboard) {
          resourceName = dashboard.name;
        }
      } else {
        const { QuestionRepository } = await import('@meridian/db');
        const repo = new QuestionRepository(db);
        const question = await repo.findById(resourceId);
        if (question) {
          resourceName = question.name;
        }
      }
    } catch (err) {
      logger.warn('Could not load resource metadata for PDF export', {
        resourceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await progress(40);

    // Generate stub HTML content
    const htmlContent = generateStubHtml({
      resourceId,
      resourceType,
      resourceName,
      orientation,
      format,
      exportedAt: new Date().toISOString(),
    });

    await progress(60);

    // Write HTML stub to temp dir (rename .html to .pdf to signal intent)
    const timestamp = Date.now();
    const safeFilename = filenameOverride
      ? sanitizeFilename(filenameOverride)
      : `export_${resourceType}_${resourceId}_${timestamp}`;
    const outputFilename = `${safeFilename}.pdf`;
    const outputPath = path.join(this.config.tmpDir, outputFilename);

    // Write as HTML content (stub — real implementation would render via headless browser)
    await fs.promises.writeFile(outputPath, htmlContent, 'utf-8');
    const stats = await fs.promises.stat(outputPath);

    await progress(90);

    logger.info('PDF export stub complete', {
      resourceId,
      filePath: outputPath,
      fileSizeBytes: stats.size,
    });

    logger.warn(
      'PDF export is a stub implementation. ' +
        'Install and configure a headless browser (Puppeteer) to generate real PDFs.',
    );

    await progress(100);

    return {
      resourceId,
      resourceType,
      filePath: outputPath,
      filename: outputFilename,
      fileSizeBytes: stats.size,
      exportedAt: new Date().toISOString(),
      isStub: true,
    };
  }
}

// ---------------------------------------------------------------------------
// HTML stub generator
// ---------------------------------------------------------------------------

interface StubHtmlOptions {
  resourceId: string;
  resourceType: string;
  resourceName: string;
  orientation: string;
  format: string;
  exportedAt: string;
}

function generateStubHtml(opts: StubHtmlOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Meridian Export — ${escapeHtml(opts.resourceName)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 40px;
      color: #1a1a2e;
    }
    .header { border-bottom: 2px solid #4f46e5; padding-bottom: 16px; margin-bottom: 24px; }
    .title { font-size: 24px; font-weight: 700; color: #4f46e5; }
    .meta { color: #6b7280; font-size: 14px; margin-top: 4px; }
    .stub-notice {
      background: #fef3c7;
      border: 1px solid #f59e0b;
      border-radius: 6px;
      padding: 16px;
      margin-top: 24px;
    }
    .stub-notice h3 { margin: 0 0 8px; color: #92400e; }
    .stub-notice p { margin: 0; color: #78350f; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
    th { background: #f9fafb; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">Meridian — ${escapeHtml(opts.resourceName)}</div>
    <div class="meta">
      Type: ${escapeHtml(opts.resourceType)} &bull;
      ID: ${escapeHtml(opts.resourceId)} &bull;
      Exported: ${escapeHtml(opts.exportedAt)} &bull;
      Format: ${escapeHtml(opts.format)} ${escapeHtml(opts.orientation)}
    </div>
  </div>

  <div class="stub-notice">
    <h3>⚠ PDF Export Stub</h3>
    <p>
      This is a placeholder HTML file. Real PDF generation requires a headless browser
      (Puppeteer or Playwright) to be installed and configured in the worker environment.
      The actual dashboard/question data would be rendered here in production.
    </p>
  </div>

  <table>
    <thead>
      <tr><th>Property</th><th>Value</th></tr>
    </thead>
    <tbody>
      <tr><td>Resource ID</td><td>${escapeHtml(opts.resourceId)}</td></tr>
      <tr><td>Resource Type</td><td>${escapeHtml(opts.resourceType)}</td></tr>
      <tr><td>Resource Name</td><td>${escapeHtml(opts.resourceName)}</td></tr>
      <tr><td>Paper Format</td><td>${escapeHtml(opts.format)}</td></tr>
      <tr><td>Orientation</td><td>${escapeHtml(opts.orientation)}</td></tr>
      <tr><td>Exported At</td><td>${escapeHtml(opts.exportedAt)}</td></tr>
    </tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\.\./g, '_')
    .substring(0, 200);
}
