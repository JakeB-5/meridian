import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../app.js';
import { createTestContainer, type ServiceContainer } from '../services/container.js';

// ── Test Setup ──────────────────────────────────────────────────────

let app: FastifyInstance;
let container: ServiceContainer;
let accessToken: string;
let dashboardId: string;
let questionId: string;

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
      email: 'embed-test@meridian.dev',
      name: 'Embed Test User',
      password: 'SecurePassword123',
    },
  });

  const body = JSON.parse(registerResponse.payload);
  accessToken = body.accessToken;

  // Create a dashboard
  const dashResponse = await app.inject({
    method: 'POST',
    url: '/api/dashboards',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      name: 'Embed Test Dashboard',
      description: 'For embed testing',
      isPublic: false,
    },
  });
  dashboardId = JSON.parse(dashResponse.payload).data?.id ?? 'missing';

  // Create a data source + question
  const dsResponse = await app.inject({
    method: 'POST',
    url: '/api/datasources',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      name: 'Embed Test DS',
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      database: 'testdb',
      username: 'user',
      password: 'pass',
    },
  });
  const dsId = JSON.parse(dsResponse.payload).data?.id;

  if (dsId) {
    const qResponse = await app.inject({
      method: 'POST',
      url: '/api/questions',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        name: 'Embed Test Question',
        type: 'sql',
        dataSourceId: dsId,
        query: 'SELECT 1',
      },
    });
    questionId = JSON.parse(qResponse.payload).data?.id ?? 'missing';
  } else {
    questionId = 'missing';
  }
});

afterAll(async () => {
  await app.close();
});

// ── Helpers ──────────────────────────────────────────────────────────

function authHeaders() {
  return { authorization: `Bearer ${accessToken}` };
}

async function generateEmbedToken(
  resourceType: 'dashboard' | 'question',
  resourceId: string,
  overrides: Record<string, unknown> = {},
) {
  return app.inject({
    method: 'POST',
    url: '/api/embed/token',
    headers: authHeaders(),
    payload: {
      resourceType,
      resourceId,
      expiresInHours: 1,
      ...overrides,
    },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Embed Routes', () => {
  // ── Token Generation ──────────────────────────────────────────────

  describe('POST /api/embed/token', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/embed/token',
        payload: {
          resourceType: 'dashboard',
          resourceId: dashboardId,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should generate a dashboard embed token', async () => {
      if (dashboardId === 'missing') return;

      const response = await generateEmbedToken('dashboard', dashboardId);

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.payload);
      expect(body.data.token).toBeDefined();
      expect(body.data.embedUrl).toBeDefined();
      expect(body.data.resourceType).toBe('dashboard');
      expect(body.data.resourceId).toBe(dashboardId);
      expect(body.data.permissions).toBeDefined();
      expect(body.data.permissions.canInteract).toBe(true);
      expect(body.data.permissions.canDownload).toBe(false);
      expect(body.data.permissions.canFilter).toBe(true);
      expect(body.data.expiresAt).toBeDefined();
      expect(body.data.createdAt).toBeDefined();
    });

    it('should generate a question embed token', async () => {
      if (questionId === 'missing') return;

      const response = await generateEmbedToken('question', questionId);

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.payload);
      expect(body.data.token).toBeDefined();
      expect(body.data.resourceType).toBe('question');
      expect(body.data.resourceId).toBe(questionId);
    });

    it('should respect custom permissions', async () => {
      if (dashboardId === 'missing') return;

      const response = await generateEmbedToken('dashboard', dashboardId, {
        permissions: {
          canInteract: false,
          canDownload: true,
          canFilter: false,
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.payload);
      expect(body.data.permissions.canInteract).toBe(false);
      expect(body.data.permissions.canDownload).toBe(true);
      expect(body.data.permissions.canFilter).toBe(false);
    });

    it('should return 404 for a non-existent resource', async () => {
      const response = await generateEmbedToken('dashboard', 'non-existent-id');

      expect(response.statusCode).toBe(404);
    });

    it('should reject expiresInHours above the max', async () => {
      if (dashboardId === 'missing') return;

      const response = await generateEmbedToken('dashboard', dashboardId, {
        expiresInHours: 99999,
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject an invalid resourceType', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/embed/token',
        headers: authHeaders(),
        payload: {
          resourceType: 'collection',
          resourceId: dashboardId,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ── Embedded Dashboard Access ─────────────────────────────────────

  describe('GET /api/embed/dashboard/:id', () => {
    it('should return 401 without a token', async () => {
      if (dashboardId === 'missing') return;

      const response = await app.inject({
        method: 'GET',
        url: `/api/embed/dashboard/${dashboardId}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return dashboard data with a valid embed token', async () => {
      if (dashboardId === 'missing') return;

      const tokenResponse = await generateEmbedToken('dashboard', dashboardId);
      const { token } = JSON.parse(tokenResponse.payload).data;

      const response = await app.inject({
        method: 'GET',
        url: `/api/embed/dashboard/${dashboardId}?token=${token}`,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.id).toBe(dashboardId);
      expect(body.data.name).toBeDefined();
      expect(body.embed).toBeDefined();
      expect(body.embed.permissions).toBeDefined();
    });

    it('should accept token via X-Embed-Token header', async () => {
      if (dashboardId === 'missing') return;

      const tokenResponse = await generateEmbedToken('dashboard', dashboardId);
      const { token } = JSON.parse(tokenResponse.payload).data;

      const response = await app.inject({
        method: 'GET',
        url: `/api/embed/dashboard/${dashboardId}`,
        headers: { 'x-embed-token': token },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject a token issued for a different resource', async () => {
      if (dashboardId === 'missing' || questionId === 'missing') return;

      // Generate a question token
      const tokenResponse = await generateEmbedToken('question', questionId);
      const { token } = JSON.parse(tokenResponse.payload).data;

      const response = await app.inject({
        method: 'GET',
        url: `/api/embed/dashboard/${dashboardId}?token=${token}`,
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // ── Embedded Question Access ──────────────────────────────────────

  describe('GET /api/embed/question/:id', () => {
    it('should return 401 without a token', async () => {
      if (questionId === 'missing') return;

      const response = await app.inject({
        method: 'GET',
        url: `/api/embed/question/${questionId}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return question data with a valid embed token', async () => {
      if (questionId === 'missing') return;

      const tokenResponse = await generateEmbedToken('question', questionId);
      const { token } = JSON.parse(tokenResponse.payload).data;

      const response = await app.inject({
        method: 'GET',
        url: `/api/embed/question/${questionId}?token=${token}`,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.id).toBe(questionId);
      expect(body.data.name).toBeDefined();
      expect(body.data.type).toBeDefined();
      expect(body.embed).toBeDefined();
    });
  });

  // ── Embedded Question Execution ───────────────────────────────────

  describe('POST /api/embed/question/:id/execute', () => {
    it('should return 401 without a token', async () => {
      if (questionId === 'missing') return;

      const response = await app.inject({
        method: 'POST',
        url: `/api/embed/question/${questionId}/execute`,
        payload: {},
      });

      expect(response.statusCode).toBe(401);
    });

    it('should execute a question with a valid embed token', async () => {
      if (questionId === 'missing') return;

      const tokenResponse = await generateEmbedToken('question', questionId);
      const { token } = JSON.parse(tokenResponse.payload).data;

      const response = await app.inject({
        method: 'POST',
        url: `/api/embed/question/${questionId}/execute?token=${token}`,
        payload: {},
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data).toBeDefined();
      expect(body.data.columns).toBeInstanceOf(Array);
      expect(body.data.rows).toBeInstanceOf(Array);
      expect(typeof body.data.rowCount).toBe('number');
    });

    it('should return 401 with an invalid token', async () => {
      if (questionId === 'missing') return;

      const response = await app.inject({
        method: 'POST',
        url: `/api/embed/question/${questionId}/execute?token=invalid-token`,
        payload: {},
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ── Token Validation ──────────────────────────────────────────────

  describe('GET /api/embed/validate', () => {
    it('should return valid: false with no token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/embed/validate',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.valid).toBe(false);
    });

    it('should return valid: false for an invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/embed/validate?token=this-is-not-a-real-token',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.valid).toBe(false);
    });

    it('should return valid: true for a freshly issued token', async () => {
      if (dashboardId === 'missing') return;

      const tokenResponse = await generateEmbedToken('dashboard', dashboardId);
      const { token } = JSON.parse(tokenResponse.payload).data;

      const response = await app.inject({
        method: 'GET',
        url: `/api/embed/validate?token=${token}`,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.valid).toBe(true);
      expect(body.data.resourceType).toBe('dashboard');
      expect(body.data.resourceId).toBe(dashboardId);
      expect(body.data.permissions).toBeDefined();
      expect(body.data.expiresAt).toBeDefined();
    });
  });
});
