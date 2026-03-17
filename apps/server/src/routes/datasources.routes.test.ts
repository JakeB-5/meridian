import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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

  // Register a test user and get a token
  const registerResponse = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      email: 'ds-test@meridian.dev',
      name: 'DS Test User',
      password: 'SecurePassword123',
    },
  });
  const registerBody = JSON.parse(registerResponse.payload);
  accessToken = registerBody.accessToken;
  orgId = registerBody.user.organizationId;
});

afterAll(async () => {
  await app.close();
});

// ── Helper ──────────────────────────────────────────────────────────

function authHeaders() {
  return { authorization: `Bearer ${accessToken}` };
}

async function createDataSource(overrides = {}) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/datasources',
    headers: authHeaders(),
    payload: {
      name: 'Test PostgreSQL',
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      database: 'testdb',
      username: 'user',
      password: 'pass',
      ssl: false,
      ...overrides,
    },
  });
  return response;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('DataSource Routes', () => {
  describe('POST /api/datasources', () => {
    it('should create a new data source', async () => {
      const response = await createDataSource({ name: 'Create Test DB' });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.payload);
      expect(body.data.id).toBeDefined();
      expect(body.data.name).toBe('Create Test DB');
      expect(body.data.type).toBe('postgresql');
      expect(body.data.host).toBe('localhost');
      expect(body.data.port).toBe(5432);
      expect(body.data.database).toBe('testdb');
      expect(body.data.organizationId).toBe(orgId);
      expect(body.data.status).toBe('disconnected');
      expect(body.data.createdAt).toBeDefined();
    });

    it('should reject without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/datasources',
        payload: {
          name: 'No Auth',
          type: 'postgresql',
          host: 'localhost',
          database: 'testdb',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject with missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/datasources',
        headers: authHeaders(),
        payload: {
          name: '',
          type: 'postgresql',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject with invalid database type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/datasources',
        headers: authHeaders(),
        payload: {
          name: 'Bad Type',
          type: 'oracle',
          host: 'localhost',
          database: 'testdb',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject with invalid port', async () => {
      const response = await createDataSource({ name: 'Bad Port', port: 99999 });

      expect(response.statusCode).toBe(400);
    });

    it('should reject duplicate name', async () => {
      await createDataSource({ name: 'Unique Name DB' });
      const response = await createDataSource({ name: 'Unique Name DB' });

      expect(response.statusCode).toBe(409);
    });
  });

  describe('GET /api/datasources', () => {
    beforeEach(async () => {
      await createDataSource({ name: `List Test ${Date.now()}` });
    });

    it('should list datasources for the organization', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/datasources',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.meta).toBeDefined();
      expect(body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it('should filter by type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/datasources?type=postgresql',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      for (const ds of body.data) {
        expect(ds.type).toBe('postgresql');
      }
    });

    it('should support pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/datasources?limit=1&offset=0',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.length).toBeLessThanOrEqual(1);
      expect(body.meta.limit).toBe(1);
      expect(body.meta.offset).toBe(0);
    });

    it('should support search', async () => {
      await createDataSource({ name: 'Searchable Alpha DB' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/datasources?search=Searchable Alpha',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.data[0].name).toContain('Searchable Alpha');
    });
  });

  describe('GET /api/datasources/:id', () => {
    it('should get a data source by ID', async () => {
      const createResponse = await createDataSource({ name: 'GetById Test' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'GET',
        url: `/api/datasources/${created.id}`,
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.id).toBe(created.id);
      expect(body.data.name).toBe('GetById Test');
    });

    it('should return 404 for non-existent ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/datasources/non-existent-id',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /api/datasources/:id', () => {
    it('should update a data source', async () => {
      const createResponse = await createDataSource({ name: 'Update Test' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/datasources/${created.id}`,
        headers: authHeaders(),
        payload: { name: 'Updated Name', host: 'new-host.com' },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.name).toBe('Updated Name');
      expect(body.data.host).toBe('new-host.com');
    });

    it('should return 404 for non-existent ID', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/datasources/non-existent-id',
        headers: authHeaders(),
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/datasources/:id', () => {
    it('should delete a data source', async () => {
      const createResponse = await createDataSource({ name: 'Delete Test' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/datasources/${created.id}`,
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(204);

      // Verify it's deleted
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/datasources/${created.id}`,
        headers: authHeaders(),
      });

      expect(getResponse.statusCode).toBe(404);
    });
  });

  describe('POST /api/datasources/:id/test', () => {
    it('should test connection for a data source', async () => {
      const createResponse = await createDataSource({ name: 'Connection Test' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'POST',
        url: `/api/datasources/${created.id}/test`,
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.success).toBe(true);
      expect(body.data.latencyMs).toBeDefined();
    });
  });

  describe('GET /api/datasources/:id/schema', () => {
    it('should get schema for a data source', async () => {
      const createResponse = await createDataSource({ name: 'Schema Test' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'GET',
        url: `/api/datasources/${created.id}/schema`,
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data).toBeInstanceOf(Array);
    });
  });

  describe('GET /api/datasources/:id/tables', () => {
    it('should get tables for a data source', async () => {
      const createResponse = await createDataSource({ name: 'Tables Test' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'GET',
        url: `/api/datasources/${created.id}/tables`,
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data).toBeInstanceOf(Array);
    });
  });

  describe('GET /api/datasources/:id/tables/:table/columns', () => {
    it('should get columns for a table', async () => {
      const createResponse = await createDataSource({ name: 'Columns Test' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'GET',
        url: `/api/datasources/${created.id}/tables/users/columns`,
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data).toBeInstanceOf(Array);
    });
  });
});
