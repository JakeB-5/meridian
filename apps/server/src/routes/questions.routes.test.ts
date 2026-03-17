import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../app.js';
import { createTestContainer, type ServiceContainer } from '../services/container.js';

// ── Test Setup ──────────────────────────────────────────────────────

let app: FastifyInstance;
let container: ServiceContainer;
let accessToken: string;
let orgId: string;

beforeAll(async () => {
  container = await createTestContainer();
  const result = await createApp({
    config: container.config,
    container,
    skipRateLimit: true,
    skipWebSocket: true,
  });
  app = result.app;

  // Register a test user
  const registerResponse = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      email: 'q-test@meridian.dev',
      name: 'Question Test User',
      password: 'SecurePassword123',
    },
  });
  const body = JSON.parse(registerResponse.payload);
  accessToken = body.accessToken;
  orgId = body.user.organizationId;
});

afterAll(async () => {
  await app.close();
});

// ── Helper ──────────────────────────────────────────────────────────

function authHeaders() {
  return { authorization: `Bearer ${accessToken}` };
}

async function createVisualQuestion(overrides = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/questions',
    headers: authHeaders(),
    payload: {
      name: 'Test Visual Question',
      description: 'A test visual question',
      type: 'visual',
      dataSourceId: 'ds-1',
      query: {
        dataSourceId: 'ds-1',
        table: 'users',
        columns: ['id', 'name', 'email'],
        filters: [],
        sorts: [{ column: 'id', direction: 'asc' }],
        aggregations: [],
        groupBy: [],
        limit: 100,
      },
      visualization: { type: 'table', tooltip: true },
      ...overrides,
    },
  });
}

async function createSQLQuestion(overrides = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/questions',
    headers: authHeaders(),
    payload: {
      name: 'Test SQL Question',
      description: 'A test SQL question',
      type: 'sql',
      dataSourceId: 'ds-1',
      query: 'SELECT id, name FROM users LIMIT 100',
      visualization: { type: 'table', tooltip: true },
      ...overrides,
    },
  });
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Question Routes', () => {
  describe('POST /api/questions', () => {
    it('should create a visual question', async () => {
      const response = await createVisualQuestion({ name: 'Visual Q1' });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.payload);
      expect(body.data.id).toBeDefined();
      expect(body.data.name).toBe('Visual Q1');
      expect(body.data.type).toBe('visual');
      expect(body.data.organizationId).toBe(orgId);
      expect(body.data.query).toBeDefined();
      expect(typeof body.data.query).toBe('object');
    });

    it('should create a SQL question', async () => {
      const response = await createSQLQuestion({ name: 'SQL Q1' });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.payload);
      expect(body.data.id).toBeDefined();
      expect(body.data.name).toBe('SQL Q1');
      expect(body.data.type).toBe('sql');
      expect(typeof body.data.query).toBe('string');
    });

    it('should reject visual question with string query', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/questions',
        headers: authHeaders(),
        payload: {
          name: 'Bad Visual',
          type: 'visual',
          dataSourceId: 'ds-1',
          query: 'SELECT * FROM users',
          visualization: { type: 'table' },
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject with missing name', async () => {
      const response = await createVisualQuestion({ name: '' });

      expect(response.statusCode).toBe(400);
    });

    it('should reject without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/questions',
        payload: {
          name: 'No Auth',
          type: 'sql',
          dataSourceId: 'ds-1',
          query: 'SELECT 1',
          visualization: { type: 'table' },
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/questions', () => {
    it('should list questions for the organization', async () => {
      await createVisualQuestion({ name: `List Q ${Date.now()}` });

      const response = await app.inject({
        method: 'GET',
        url: '/api/questions',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.meta).toBeDefined();
    });

    it('should filter by type', async () => {
      await createSQLQuestion({ name: 'Filter SQL Q' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/questions?type=sql',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      for (const q of body.data) {
        expect(q.type).toBe('sql');
      }
    });

    it('should support search', async () => {
      await createVisualQuestion({ name: 'Searchable Question Alpha' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/questions?search=Searchable Question Alpha',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should support pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/questions?limit=2&offset=0',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.length).toBeLessThanOrEqual(2);
      expect(body.meta.limit).toBe(2);
    });
  });

  describe('GET /api/questions/:id', () => {
    it('should get a question by ID', async () => {
      const createResponse = await createVisualQuestion({ name: 'GetById Q' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'GET',
        url: `/api/questions/${created.id}`,
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.id).toBe(created.id);
      expect(body.data.name).toBe('GetById Q');
    });

    it('should return 404 for non-existent ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/questions/non-existent-id',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /api/questions/:id', () => {
    it('should update a question name', async () => {
      const createResponse = await createVisualQuestion({ name: 'Before Update' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/questions/${created.id}`,
        headers: authHeaders(),
        payload: { name: 'After Update' },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.name).toBe('After Update');
    });

    it('should update question visualization', async () => {
      const createResponse = await createVisualQuestion({ name: 'Viz Update Q' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/questions/${created.id}`,
        headers: authHeaders(),
        payload: {
          visualization: { type: 'bar', tooltip: true, stacked: true },
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.visualization.type).toBe('bar');
    });

    it('should return 404 for non-existent ID', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/questions/non-existent-id',
        headers: authHeaders(),
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/questions/:id', () => {
    it('should delete a question', async () => {
      const createResponse = await createVisualQuestion({ name: 'Delete Q' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/questions/${created.id}`,
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(204);

      // Verify deleted
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/questions/${created.id}`,
        headers: authHeaders(),
      });
      expect(getResponse.statusCode).toBe(404);
    });
  });

  describe('POST /api/questions/:id/execute', () => {
    it('should execute a question', async () => {
      const createResponse = await createVisualQuestion({ name: 'Execute Q' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'POST',
        url: `/api/questions/${created.id}/execute`,
        headers: authHeaders(),
        payload: {},
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.columns).toBeInstanceOf(Array);
      expect(body.data.rows).toBeInstanceOf(Array);
      expect(body.data.rowCount).toBeDefined();
      expect(body.data.executionTimeMs).toBeDefined();
    });

    it('should return 404 for non-existent question', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/questions/non-existent-id/execute',
        headers: authHeaders(),
        payload: {},
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/questions/preview', () => {
    it('should execute an ad-hoc query', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/questions/preview',
        headers: authHeaders(),
        payload: {
          dataSourceId: 'ds-1',
          type: 'sql',
          query: 'SELECT 1 AS value',
          limit: 100,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.columns).toBeInstanceOf(Array);
      expect(body.data.rows).toBeInstanceOf(Array);
    });
  });

  describe('POST /api/questions/:id/duplicate', () => {
    it('should duplicate a question', async () => {
      const createResponse = await createVisualQuestion({ name: 'Original Q' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'POST',
        url: `/api/questions/${created.id}/duplicate`,
        headers: authHeaders(),
        payload: { name: 'Duplicated Q' },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.payload);
      expect(body.data.id).not.toBe(created.id);
      expect(body.data.name).toBe('Duplicated Q');
      expect(body.data.type).toBe(created.type);
    });
  });
});
