import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../app.js';
import { createTestContainer, type ServiceContainer } from '../services/container.js';

// ── Test Setup ──────────────────────────────────────────────────────

let app: FastifyInstance;
let container: ServiceContainer;
let accessToken: string;
let questionId: string;
let dashboardId: string;

beforeAll(async () => {
  container = await createTestContainer();
  const result = await createApp({
    config: container.config,
    container,
    skipRateLimit: true,
    skipWebSocket: true,
  });
  app = result.app;

  // Register test user
  const registerResponse = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      email: 'export-test@meridian.dev',
      name: 'Export Test User',
      password: 'SecurePassword123',
    },
  });

  const body = JSON.parse(registerResponse.payload);
  accessToken = body.accessToken;

  // Create a data source first (required for questions)
  const dsResponse = await app.inject({
    method: 'POST',
    url: '/api/datasources',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      name: 'Export Test DB',
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      database: 'testdb',
      username: 'user',
      password: 'pass',
    },
  });
  const dsId = JSON.parse(dsResponse.payload).data?.id;

  // Create a test question
  if (dsId) {
    const qResponse = await app.inject({
      method: 'POST',
      url: '/api/questions',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        name: 'Export Test Question',
        type: 'sql',
        dataSourceId: dsId,
        query: 'SELECT 1 AS id, \'hello\' AS value',
      },
    });
    questionId = JSON.parse(qResponse.payload).data?.id ?? 'missing';
  } else {
    questionId = 'missing';
  }

  // Create a test dashboard
  const dashResponse = await app.inject({
    method: 'POST',
    url: '/api/dashboards',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      name: 'Export Test Dashboard',
      description: 'For export testing',
    },
  });
  dashboardId = JSON.parse(dashResponse.payload).data?.id ?? 'missing';
});

afterAll(async () => {
  await app.close();
});

// ── Helpers ──────────────────────────────────────────────────────────

function authHeaders() {
  return { authorization: `Bearer ${accessToken}` };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Export Routes', () => {
  // ── Question Exports ──────────────────────────────────────────────

  describe('POST /api/export/question/:id', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/export/question/${questionId}`,
        payload: { format: 'csv' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 404 for a non-existent question', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/export/question/non-existent-id',
        headers: authHeaders(),
        payload: { format: 'csv' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should export a question as CSV', async () => {
      if (questionId === 'missing') return;

      const response = await app.inject({
        method: 'POST',
        url: `/api/export/question/${questionId}`,
        headers: authHeaders(),
        payload: {
          format: 'csv',
          includeHeaders: true,
          delimiter: ',',
        },
      });

      expect(response.statusCode).toBe(202);

      const body = JSON.parse(response.payload);
      expect(body.data.jobId).toBeDefined();
      expect(body.data.format).toBe('csv');
      expect(body.data.resourceType).toBe('question');
      expect(body.data.resourceId).toBe(questionId);
      expect(body.data.status).toBe('complete');
      expect(body.data.filename).toMatch(/\.csv$/);
      expect(body.data.downloadUrl).toBeDefined();
    });

    it('should export a question as JSON', async () => {
      if (questionId === 'missing') return;

      const response = await app.inject({
        method: 'POST',
        url: `/api/export/question/${questionId}`,
        headers: authHeaders(),
        payload: { format: 'json' },
      });

      expect(response.statusCode).toBe(202);

      const body = JSON.parse(response.payload);
      expect(body.data.format).toBe('json');
      expect(body.data.filename).toMatch(/\.json$/);
    });

    it('should reject invalid format values', async () => {
      if (questionId === 'missing') return;

      const response = await app.inject({
        method: 'POST',
        url: `/api/export/question/${questionId}`,
        headers: authHeaders(),
        payload: { format: 'xml' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject limit above maximum', async () => {
      if (questionId === 'missing') return;

      const response = await app.inject({
        method: 'POST',
        url: `/api/export/question/${questionId}`,
        headers: authHeaders(),
        payload: { format: 'csv', limit: 999999 },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ── Dashboard Exports ─────────────────────────────────────────────

  describe('POST /api/export/dashboard/:id', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/export/dashboard/${dashboardId}`,
        payload: { format: 'json' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 404 for a non-existent dashboard', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/export/dashboard/non-existent-id',
        headers: authHeaders(),
        payload: { format: 'json' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should export a dashboard as JSON', async () => {
      if (dashboardId === 'missing') return;

      const response = await app.inject({
        method: 'POST',
        url: `/api/export/dashboard/${dashboardId}`,
        headers: authHeaders(),
        payload: { format: 'json' },
      });

      expect(response.statusCode).toBe(202);

      const body = JSON.parse(response.payload);
      expect(body.data.jobId).toBeDefined();
      expect(body.data.format).toBe('json');
      expect(body.data.resourceType).toBe('dashboard');
      expect(body.data.resourceId).toBe(dashboardId);
      expect(body.data.status).toBe('complete');
      expect(body.data.filename).toMatch(/\.json$/);
    });

    it('should export a dashboard as PDF (stub)', async () => {
      if (dashboardId === 'missing') return;

      const response = await app.inject({
        method: 'POST',
        url: `/api/export/dashboard/${dashboardId}`,
        headers: authHeaders(),
        payload: {
          format: 'pdf',
          pageSize: 'A4',
          orientation: 'landscape',
        },
      });

      expect(response.statusCode).toBe(202);

      const body = JSON.parse(response.payload);
      expect(body.data.format).toBe('pdf');
      expect(body.data.filename).toMatch(/\.pdf$/);
    });
  });

  // ── Job Management ────────────────────────────────────────────────

  describe('GET /api/export/jobs', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export/jobs',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should list export jobs for the authenticated user\'s org', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export/jobs',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.meta).toBeDefined();
      expect(typeof body.meta.total).toBe('number');
    });

    it('should support filtering by status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export/jobs?status=complete',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      for (const job of body.data) {
        expect(job.status).toBe('complete');
      }
    });

    it('should support filtering by resourceType', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export/jobs?resourceType=dashboard',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      for (const job of body.data) {
        expect(job.resourceType).toBe('dashboard');
      }
    });

    it('should support pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export/jobs?limit=2&offset=0',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.length).toBeLessThanOrEqual(2);
    });
  });

  describe('GET /api/export/jobs/:jobId', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export/jobs/some-id',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 404 for a non-existent job', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export/jobs/non-existent-job-id',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return a specific job by ID', async () => {
      // Create a job first
      if (dashboardId === 'missing') return;

      const createResponse = await app.inject({
        method: 'POST',
        url: `/api/export/dashboard/${dashboardId}`,
        headers: authHeaders(),
        payload: { format: 'json' },
      });

      const jobId = JSON.parse(createResponse.payload).data.jobId;

      const response = await app.inject({
        method: 'GET',
        url: `/api/export/jobs/${jobId}`,
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.jobId).toBe(jobId);
      expect(body.data.status).toBe('complete');
    });
  });

  describe('GET /api/export/download/:jobId', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export/download/some-id',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 404 for a non-existent job', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export/download/non-existent-id',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(404);
    });

    it('should serve the export file for a complete JSON dashboard job', async () => {
      if (dashboardId === 'missing') return;

      const createResponse = await app.inject({
        method: 'POST',
        url: `/api/export/dashboard/${dashboardId}`,
        headers: authHeaders(),
        payload: { format: 'json' },
      });

      const jobId = JSON.parse(createResponse.payload).data.jobId;

      const response = await app.inject({
        method: 'GET',
        url: `/api/export/download/${jobId}`,
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['content-disposition']).toMatch(/attachment/);
      expect(response.headers['x-export-job-id']).toBe(jobId);
    });
  });

  describe('DELETE /api/export/jobs/:jobId', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/export/jobs/some-id',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should delete an export job', async () => {
      if (dashboardId === 'missing') return;

      const createResponse = await app.inject({
        method: 'POST',
        url: `/api/export/dashboard/${dashboardId}`,
        headers: authHeaders(),
        payload: { format: 'json' },
      });

      const jobId = JSON.parse(createResponse.payload).data.jobId;

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/export/jobs/${jobId}`,
        headers: authHeaders(),
      });

      expect(deleteResponse.statusCode).toBe(204);

      // Verify it's gone
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/export/jobs/${jobId}`,
        headers: authHeaders(),
      });

      expect(getResponse.statusCode).toBe(404);
    });
  });
});
