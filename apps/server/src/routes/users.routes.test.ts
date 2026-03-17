import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../app.js';
import { createTestContainer, type ServiceContainer } from '../services/container.js';

// ── Test Setup ──────────────────────────────────────────────────────

let app: FastifyInstance;
let container: ServiceContainer;
let accessToken: string;
let orgId: string;
let adminUserId: string;

beforeAll(async () => {
  container = await createTestContainer();
  const result = await createApp({
    config: container.config,
    container,
    skipRateLimit: true,
    skipWebSocket: true,
  });
  app = result.app;

  // Register admin user
  const registerResponse = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      email: 'user-admin@meridian.dev',
      name: 'User Admin',
      password: 'SecurePassword123',
    },
  });
  const body = JSON.parse(registerResponse.payload);
  accessToken = body.accessToken;
  orgId = body.user.organizationId;
  adminUserId = body.user.id;
});

afterAll(async () => {
  await app.close();
});

// ── Helper ──────────────────────────────────────────────────────────

function authHeaders() {
  return { authorization: `Bearer ${accessToken}` };
}

async function createUser(overrides = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/users',
    headers: authHeaders(),
    payload: {
      email: `user-${Date.now()}@meridian.dev`,
      name: 'Test User',
      roleId: 'viewer-role-id',
      ...overrides,
    },
  });
}

// ── Tests ───────────────────────────────────────────────────────────

describe('User Routes', () => {
  describe('POST /api/users', () => {
    it('should create/invite a new user', async () => {
      const response = await createUser({
        email: 'invited@meridian.dev',
        name: 'Invited User',
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.payload);
      expect(body.data.id).toBeDefined();
      expect(body.data.email).toBe('invited@meridian.dev');
      expect(body.data.name).toBe('Invited User');
      expect(body.data.organizationId).toBe(orgId);
      expect(body.data.status).toBe('pending');
    });

    it('should reject with invalid email', async () => {
      const response = await createUser({ email: 'not-an-email' });

      expect(response.statusCode).toBe(400);
    });

    it('should reject with empty name', async () => {
      const response = await createUser({ name: '' });

      expect(response.statusCode).toBe(400);
    });

    it('should reject duplicate email', async () => {
      const email = `dup-${Date.now()}@meridian.dev`;
      await createUser({ email });

      const response = await createUser({ email });

      expect(response.statusCode).toBe(409);
    });

    it('should reject without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/users',
        payload: {
          email: 'noauth@meridian.dev',
          name: 'No Auth',
          roleId: 'viewer',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/users', () => {
    it('should list users in organization', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.meta).toBeDefined();
      // At least the admin user should exist
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should support pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users?limit=1&offset=0',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.length).toBeLessThanOrEqual(1);
      expect(body.meta.limit).toBe(1);
    });

    it('should filter by search', async () => {
      await createUser({ name: 'Searchable User Zeta', email: 'zeta@meridian.dev' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/users?search=Searchable User Zeta',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/users/:id', () => {
    it('should get a user by ID', async () => {
      const createResponse = await createUser({ name: 'GetById User', email: 'getbyid@meridian.dev' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'GET',
        url: `/api/users/${created.id}`,
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.id).toBe(created.id);
      expect(body.data.name).toBe('GetById User');
    });

    it('should return 404 for non-existent ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/non-existent-id',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /api/users/:id', () => {
    it('should update a user', async () => {
      const createResponse = await createUser({ name: 'Before Update', email: 'update-user@meridian.dev' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/users/${created.id}`,
        headers: authHeaders(),
        payload: { name: 'After Update' },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.name).toBe('After Update');
    });
  });

  describe('DELETE /api/users/:id (deactivate)', () => {
    it('should deactivate an active user', async () => {
      // Create and activate user first
      const createResponse = await createUser({ name: 'Deactivate User', email: 'deactivate@meridian.dev' });
      const created = JSON.parse(createResponse.payload).data;

      // Activate the user first
      await app.inject({
        method: 'PUT',
        url: `/api/users/${created.id}/activate`,
        headers: authHeaders(),
      });

      // Now deactivate
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/users/${created.id}`,
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.status).toBe('inactive');
    });

    it('should prevent self-deactivation', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/users/${adminUserId}`,
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('PUT /api/users/:id/role', () => {
    it('should assign a role to a user', async () => {
      const createResponse = await createUser({ name: 'Role User', email: 'role@meridian.dev' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/users/${created.id}/role`,
        headers: authHeaders(),
        payload: { roleId: 'editor-role-id' },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.role).toBeDefined();
    });

    it('should reject with empty roleId', async () => {
      const createResponse = await createUser({ name: 'Bad Role User', email: 'badrole@meridian.dev' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/users/${created.id}/role`,
        headers: authHeaders(),
        payload: { roleId: '' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('PUT /api/users/:id/activate', () => {
    it('should activate a pending user', async () => {
      const createResponse = await createUser({ name: 'Activate User', email: 'activate@meridian.dev' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/users/${created.id}/activate`,
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.status).toBe('active');
      expect(body.data.isActive).toBe(true);
    });
  });
});
