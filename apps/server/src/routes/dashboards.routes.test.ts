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
      email: 'dash-test@meridian.dev',
      name: 'Dashboard Test User',
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

async function createDashboard(overrides = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/dashboards',
    headers: authHeaders(),
    payload: {
      name: 'Test Dashboard',
      description: 'A test dashboard',
      isPublic: false,
      ...overrides,
    },
  });
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Dashboard Routes', () => {
  describe('POST /api/dashboards', () => {
    it('should create a new dashboard', async () => {
      const response = await createDashboard({ name: 'Create Dash 1' });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.payload);
      expect(body.data.id).toBeDefined();
      expect(body.data.name).toBe('Create Dash 1');
      expect(body.data.organizationId).toBe(orgId);
      expect(body.data.isPublic).toBe(false);
      expect(body.data.layout).toBeDefined();
      expect(body.data.layout.columns).toBe(12);
      expect(body.data.cards).toBeInstanceOf(Array);
      expect(body.data.cardCount).toBe(0);
    });

    it('should create with custom layout', async () => {
      const response = await createDashboard({
        name: 'Custom Layout Dash',
        layout: { columns: 24, rowHeight: 100 },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.payload);
      expect(body.data.layout.columns).toBe(24);
      expect(body.data.layout.rowHeight).toBe(100);
    });

    it('should reject with empty name', async () => {
      const response = await createDashboard({ name: '' });

      expect(response.statusCode).toBe(400);
    });

    it('should reject without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/dashboards',
        payload: { name: 'No Auth Dash' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/dashboards', () => {
    it('should list dashboards for the organization', async () => {
      await createDashboard({ name: `List Dash ${Date.now()}` });

      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboards',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.meta).toBeDefined();
    });

    it('should filter by isPublic', async () => {
      await createDashboard({ name: 'Public Dash', isPublic: true });

      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboards?isPublic=true',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      for (const d of body.data) {
        expect(d.isPublic).toBe(true);
      }
    });

    it('should support search', async () => {
      await createDashboard({ name: 'Searchable Dashboard Omega' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboards?search=Searchable Dashboard Omega',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should support pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboards?limit=2&offset=0',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.length).toBeLessThanOrEqual(2);
      expect(body.meta.limit).toBe(2);
    });
  });

  describe('GET /api/dashboards/:id', () => {
    it('should get a dashboard by ID', async () => {
      const createResponse = await createDashboard({ name: 'GetById Dash' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'GET',
        url: `/api/dashboards/${created.id}`,
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.id).toBe(created.id);
      expect(body.data.name).toBe('GetById Dash');
      expect(body.data.cards).toBeInstanceOf(Array);
    });

    it('should return 404 for non-existent ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboards/non-existent-id',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /api/dashboards/:id', () => {
    it('should update dashboard metadata', async () => {
      const createResponse = await createDashboard({ name: 'Update Dash' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/dashboards/${created.id}`,
        headers: authHeaders(),
        payload: { name: 'Updated Dash', isPublic: true },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.name).toBe('Updated Dash');
      expect(body.data.isPublic).toBe(true);
    });
  });

  describe('DELETE /api/dashboards/:id', () => {
    it('should delete a dashboard', async () => {
      const createResponse = await createDashboard({ name: 'Delete Dash' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/dashboards/${created.id}`,
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(204);

      // Verify deleted
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/dashboards/${created.id}`,
        headers: authHeaders(),
      });
      expect(getResponse.statusCode).toBe(404);
    });
  });

  describe('Card management', () => {
    it('should add a card to a dashboard', async () => {
      const createResponse = await createDashboard({ name: 'Card Dash' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'POST',
        url: `/api/dashboards/${created.id}/cards`,
        headers: authHeaders(),
        payload: {
          questionId: 'q-1',
          position: { x: 0, y: 0 },
          size: { width: 4, height: 3 },
          title: 'Revenue Chart',
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.payload);
      expect(body.data.cards.length).toBe(1);
      expect(body.data.cards[0].questionId).toBe('q-1');
      expect(body.data.cards[0].position.x).toBe(0);
      expect(body.data.cards[0].size.width).toBe(4);
      expect(body.data.cardCount).toBe(1);
    });

    it('should reject card with invalid size', async () => {
      const createResponse = await createDashboard({ name: 'Bad Card Dash' });
      const created = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'POST',
        url: `/api/dashboards/${created.id}/cards`,
        headers: authHeaders(),
        payload: {
          questionId: 'q-1',
          position: { x: 0, y: 0 },
          size: { width: 1, height: 1 }, // Too small (min is 2x2)
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should update a card position', async () => {
      const createResponse = await createDashboard({ name: 'Move Card Dash' });
      const dashboard = JSON.parse(createResponse.payload).data;

      // Add a card
      const addResponse = await app.inject({
        method: 'POST',
        url: `/api/dashboards/${dashboard.id}/cards`,
        headers: authHeaders(),
        payload: {
          questionId: 'q-1',
          position: { x: 0, y: 0 },
          size: { width: 4, height: 3 },
        },
      });

      const cardId = JSON.parse(addResponse.payload).data.cards[0].id;

      // Update the card
      const response = await app.inject({
        method: 'PUT',
        url: `/api/dashboards/${dashboard.id}/cards/${cardId}`,
        headers: authHeaders(),
        payload: {
          position: { x: 4, y: 0 },
          size: { width: 6, height: 4 },
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      const card = body.data.cards.find((c: any) => c.id === cardId);
      expect(card.position.x).toBe(4);
      expect(card.size.width).toBe(6);
    });

    it('should remove a card from a dashboard', async () => {
      const createResponse = await createDashboard({ name: 'Remove Card Dash' });
      const dashboard = JSON.parse(createResponse.payload).data;

      // Add a card
      const addResponse = await app.inject({
        method: 'POST',
        url: `/api/dashboards/${dashboard.id}/cards`,
        headers: authHeaders(),
        payload: {
          questionId: 'q-1',
          position: { x: 0, y: 0 },
          size: { width: 4, height: 3 },
        },
      });

      const cardId = JSON.parse(addResponse.payload).data.cards[0].id;

      // Remove the card
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/dashboards/${dashboard.id}/cards/${cardId}`,
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.cards.length).toBe(0);
      expect(body.data.cardCount).toBe(0);
    });
  });

  describe('POST /api/dashboards/:id/share', () => {
    it('should generate a share link', async () => {
      const createResponse = await createDashboard({ name: 'Share Dash' });
      const dashboard = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'POST',
        url: `/api/dashboards/${dashboard.id}/share`,
        headers: authHeaders(),
        payload: { expiresInHours: 48 },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.shareToken).toBeDefined();
      expect(body.data.shareUrl).toBeDefined();
      expect(body.data.expiresAt).toBeDefined();
      expect(body.data.dashboardId).toBe(dashboard.id);
    });
  });

  describe('POST /api/dashboards/:id/duplicate', () => {
    it('should duplicate a dashboard', async () => {
      const createResponse = await createDashboard({ name: 'Original Dash' });
      const dashboard = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'POST',
        url: `/api/dashboards/${dashboard.id}/duplicate`,
        headers: authHeaders(),
        payload: { name: 'Duplicated Dash' },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.payload);
      expect(body.data.id).not.toBe(dashboard.id);
      expect(body.data.name).toBe('Duplicated Dash');
    });
  });

  describe('Dashboard filters', () => {
    it('should add a filter to a dashboard', async () => {
      const createResponse = await createDashboard({ name: 'Filter Dash' });
      const dashboard = JSON.parse(createResponse.payload).data;

      const response = await app.inject({
        method: 'POST',
        url: `/api/dashboards/${dashboard.id}/filters`,
        headers: authHeaders(),
        payload: {
          type: 'select',
          column: 'status',
          defaultValue: 'active',
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.payload);
      expect(body.data.filters.length).toBe(1);
      expect(body.data.filters[0].type).toBe('select');
      expect(body.data.filters[0].column).toBe('status');
    });

    it('should remove a filter from a dashboard', async () => {
      const createResponse = await createDashboard({ name: 'Remove Filter Dash' });
      const dashboard = JSON.parse(createResponse.payload).data;

      // Add a filter
      const addResponse = await app.inject({
        method: 'POST',
        url: `/api/dashboards/${dashboard.id}/filters`,
        headers: authHeaders(),
        payload: {
          type: 'select',
          column: 'category',
        },
      });

      const filterId = JSON.parse(addResponse.payload).data.filters[0].id;

      // Remove the filter
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/dashboards/${dashboard.id}/filters/${filterId}`,
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.data.filters.length).toBe(0);
    });
  });
});
