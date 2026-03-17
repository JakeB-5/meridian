import { describe, it, expect } from 'vitest';
import { createContainerAsync, createTestContainer, type ServiceContainer } from './container.js';
import type { ServerConfig } from '../config.js';

// ── Tests ───────────────────────────────────────────────────────────

describe('Service Container', () => {
  describe('createTestContainer', () => {
    it('should create a container with default test config', async () => {
      const container = await createTestContainer();

      expect(container).toBeDefined();
      expect(container.logger).toBeDefined();
      expect(container.config).toBeDefined();
      expect(container.config.NODE_ENV).toBe('test');
      expect(container.config.LOG_LEVEL).toBe('silent');
    });

    it('should allow config overrides', async () => {
      const container = await createTestContainer({ PORT: 4000 });

      expect(container.config.PORT).toBe(4000);
    });

    it('should provide all required services', async () => {
      const container = await createTestContainer();

      // Auth services
      expect(container.tokenService).toBeDefined();
      expect(container.passwordService).toBeDefined();

      // Domain services
      expect(container.dataSourceService).toBeDefined();
      expect(container.questionService).toBeDefined();
      expect(container.dashboardService).toBeDefined();
      expect(container.userService).toBeDefined();

      // Repositories
      expect(container.userRepository).toBeDefined();

      // Plugins
      expect(container.pluginRegistry).toBeDefined();
    });
  });

  describe('createContainerAsync', () => {
    it('should create a container with provided config', async () => {
      const config: ServerConfig = {
        DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
        REDIS_URL: 'redis://localhost:6379',
        JWT_SECRET: 'a-very-long-secret-that-is-at-least-32-characters',
        PORT: 3001,
        LOG_LEVEL: 'silent',
        CORS_ORIGIN: '*',
        SWAGGER_ENABLED: false,
        NODE_ENV: 'test',
        ACCESS_TOKEN_EXPIRY: '15m',
        REFRESH_TOKEN_EXPIRY: '7d',
        JWT_ISSUER: 'meridian-test',
        RATE_LIMIT_MAX: 100,
        RATE_LIMIT_WINDOW_MS: 60000,
        TRUST_PROXY: false,
        EMBED_TOKEN_EXPIRY: '24h',
      };

      const container = await createContainerAsync({ config });

      expect(container).toBeDefined();
      expect(container.config).toBe(config);
    });
  });

  describe('DataSource Service (in-memory)', () => {
    it('should create and retrieve a data source', async () => {
      const container = await createTestContainer();

      const createResult = await container.dataSourceService.create({
        name: 'Test DB',
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        organizationId: 'org-1',
      });

      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const ds = createResult.value;
      expect(ds.name).toBe('Test DB');

      const getResult = await container.dataSourceService.getById(ds.id);
      expect(getResult.ok).toBe(true);
      if (getResult.ok) {
        expect(getResult.value.id).toBe(ds.id);
      }
    });

    it('should list data sources by organization', async () => {
      const container = await createTestContainer();

      await container.dataSourceService.create({
        name: 'Org1 DB',
        type: 'postgresql',
        host: 'localhost',
        database: 'db1',
        organizationId: 'org-list',
      });

      await container.dataSourceService.create({
        name: 'Org1 DB2',
        type: 'mysql',
        host: 'localhost',
        database: 'db2',
        organizationId: 'org-list',
      });

      const listResult = await container.dataSourceService.listByOrganization('org-list');
      expect(listResult.ok).toBe(true);
      if (listResult.ok) {
        expect(listResult.value.length).toBe(2);
      }
    });

    it('should delete a data source', async () => {
      const container = await createTestContainer();

      const createResult = await container.dataSourceService.create({
        name: 'Delete Me',
        type: 'sqlite',
        database: 'test.db',
        organizationId: 'org-del',
      });

      if (!createResult.ok) return;
      const id = createResult.value.id;

      const deleteResult = await container.dataSourceService.delete(id);
      expect(deleteResult.ok).toBe(true);

      const getResult = await container.dataSourceService.getById(id);
      expect(getResult.ok).toBe(false);
    });
  });

  describe('Question Service (in-memory)', () => {
    it('should create and retrieve a visual question', async () => {
      const container = await createTestContainer();

      const result = await container.questionService.createVisual({
        name: 'Revenue Query',
        dataSourceId: 'ds-1',
        query: {
          dataSourceId: 'ds-1',
          table: 'orders',
          columns: ['date', 'amount'],
          filters: [],
          sorts: [],
          aggregations: [{ column: 'amount', aggregation: 'sum', alias: 'total' }],
          groupBy: ['date'],
        },
        organizationId: 'org-1',
        createdBy: 'user-1',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.name).toBe('Revenue Query');
      expect(result.value.type).toBe('visual');
    });

    it('should create and retrieve a SQL question', async () => {
      const container = await createTestContainer();

      const result = await container.questionService.createSQL({
        name: 'Custom SQL',
        dataSourceId: 'ds-1',
        sql: 'SELECT COUNT(*) FROM users',
        organizationId: 'org-1',
        createdBy: 'user-1',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.name).toBe('Custom SQL');
      expect(result.value.type).toBe('sql');
    });
  });

  describe('Dashboard Service (in-memory)', () => {
    it('should create and retrieve a dashboard', async () => {
      const container = await createTestContainer();

      const result = await container.dashboardService.create({
        name: 'Sales Dashboard',
        organizationId: 'org-1',
        createdBy: 'user-1',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.name).toBe('Sales Dashboard');
      expect(result.value.cardCount).toBe(0);

      const getResult = await container.dashboardService.getById(result.value.id);
      expect(getResult.ok).toBe(true);
    });

    it('should add and remove cards', async () => {
      const container = await createTestContainer();

      const dashResult = await container.dashboardService.create({
        name: 'Card Test',
        organizationId: 'org-1',
        createdBy: 'user-1',
      });

      if (!dashResult.ok) return;
      const dashId = dashResult.value.id;

      const addResult = await container.dashboardService.addCard(dashId, {
        questionId: 'q-1',
        position: { x: 0, y: 0 },
        size: { width: 4, height: 3 },
      });

      expect(addResult.ok).toBe(true);
      if (!addResult.ok) return;
      expect(addResult.value.cardCount).toBe(1);

      const cardId = addResult.value.cards[0]!.id;
      const removeResult = await container.dashboardService.removeCard(dashId, cardId);
      expect(removeResult.ok).toBe(true);
      if (removeResult.ok) {
        expect(removeResult.value.cardCount).toBe(0);
      }
    });
  });

  describe('User Service (in-memory)', () => {
    it('should create and retrieve a user', async () => {
      const container = await createTestContainer();

      const result = await container.userService.create({
        email: 'test@example.com',
        name: 'Test User',
        organizationId: 'org-1',
        roleId: 'viewer-role',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.email).toBe('test@example.com');
      expect(result.value.status).toBe('pending');

      const getResult = await container.userService.getById(result.value.id);
      expect(getResult.ok).toBe(true);
    });

    it('should activate and deactivate a user', async () => {
      const container = await createTestContainer();

      const createResult = await container.userService.create({
        email: 'activate@example.com',
        name: 'Activate User',
        organizationId: 'org-1',
        roleId: 'viewer-role',
      });

      if (!createResult.ok) return;
      const userId = createResult.value.id;

      const activateResult = await container.userService.activate(userId);
      expect(activateResult.ok).toBe(true);
      if (activateResult.ok) {
        expect(activateResult.value.status).toBe('active');
      }

      const deactivateResult = await container.userService.deactivate(userId);
      expect(deactivateResult.ok).toBe(true);
      if (deactivateResult.ok) {
        expect(deactivateResult.value.status).toBe('inactive');
      }
    });

    it('should reject duplicate email', async () => {
      const container = await createTestContainer();

      await container.userService.create({
        email: 'dup@example.com',
        name: 'First',
        organizationId: 'org-1',
        roleId: 'viewer-role',
      });

      const result = await container.userService.create({
        email: 'dup@example.com',
        name: 'Second',
        organizationId: 'org-1',
        roleId: 'viewer-role',
      });

      expect(result.ok).toBe(false);
    });
  });

  describe('Plugin Registry', () => {
    it('should be available in the container', async () => {
      const container = await createTestContainer();

      expect(container.pluginRegistry).toBeDefined();
      expect(container.pluginRegistry.count()).toBe(0);
    });
  });
});
