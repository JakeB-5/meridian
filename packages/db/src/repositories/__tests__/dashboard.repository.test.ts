import { describe, it, expect, beforeEach } from 'vitest';
import { DashboardRepository } from '../dashboard.repository.js';
import {
  createMockDb,
  createSampleDashboard,
  createSampleDashboardCard,
  resetIdCounter,
  type MockDb,
} from './test-helpers.js';

describe('DashboardRepository', () => {
  let mockDb: MockDb;
  let repo: DashboardRepository;

  beforeEach(() => {
    resetIdCounter();
    mockDb = createMockDb();
    repo = new DashboardRepository(mockDb.db);
  });

  // ── findById ────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return dashboard when found', async () => {
      const dashboard = createSampleDashboard();
      mockDb.setSelectResult([dashboard]);

      const result = await repo.findById(dashboard.id);

      expect(result).toEqual(dashboard);
    });

    it('should return null when not found', async () => {
      mockDb.setSelectResult([]);

      const result = await repo.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  // ── findByIdWithCreator ─────────────────────────────────────────

  describe('findByIdWithCreator', () => {
    it('should return dashboard with creator details', async () => {
      const dashWithCreator = {
        ...createSampleDashboard(),
        creatorName: 'Admin',
        creatorEmail: 'admin@test.com',
      };
      mockDb.setSelectResult([dashWithCreator]);

      const result = await repo.findByIdWithCreator(dashWithCreator.id);

      expect(result?.creatorName).toBe('Admin');
      expect(result?.creatorEmail).toBe('admin@test.com');
    });
  });

  // ── findByIdWithCards ───────────────────────────────────────────

  describe('findByIdWithCards', () => {
    it('should return dashboard with its cards', async () => {
      const dashboard = createSampleDashboard();
      const cards = [
        createSampleDashboardCard({ dashboardId: dashboard.id }),
        createSampleDashboardCard({ dashboardId: dashboard.id, positionX: 6 }),
      ];

      // First select: dashboard, second select: cards
      let callCount = 0;
      mockDb.mocks.select.mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [dashboard] : cards;
        return createChainableResult(result);
      });

      const result = await repo.findByIdWithCards(dashboard.id);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(dashboard.id);
      expect(result?.cards).toEqual(cards);
      expect(result?.cards).toHaveLength(2);
    });

    it('should return null when dashboard not found', async () => {
      mockDb.setSelectResult([]);

      const result = await repo.findByIdWithCards('non-existent');

      expect(result).toBeNull();
    });
  });

  // ── create ──────────────────────────────────────────────────────

  describe('create', () => {
    it('should create and return a new dashboard', async () => {
      const newDash = createSampleDashboard();
      mockDb.setInsertResult([newDash]);

      const result = await repo.create({
        name: 'New Dashboard',
        organizationId: 'org-id',
        createdBy: 'user-id',
      });

      expect(result).toEqual(newDash);
      expect(mockDb.mocks.insert).toHaveBeenCalled();
    });
  });

  // ── update ──────────────────────────────────────────────────────

  describe('update', () => {
    it('should update and return the dashboard', async () => {
      const updated = createSampleDashboard({ name: 'Updated Dashboard' });
      mockDb.setUpdateResult([updated]);

      const result = await repo.update(updated.id, { name: 'Updated Dashboard' });

      expect(result?.name).toBe('Updated Dashboard');
    });

    it('should return null when not found', async () => {
      mockDb.setUpdateResult([]);

      const result = await repo.update('non-existent', { name: 'Test' });

      expect(result).toBeNull();
    });
  });

  // ── delete ──────────────────────────────────────────────────────

  describe('delete', () => {
    it('should return true when deleted', async () => {
      mockDb.setDeleteResult([{ id: 'dash-id' }]);

      const result = await repo.delete('dash-id');

      expect(result).toBe(true);
    });

    it('should return false when not found', async () => {
      mockDb.setDeleteResult([]);

      const result = await repo.delete('non-existent');

      expect(result).toBe(false);
    });
  });

  // ── togglePublic ────────────────────────────────────────────────

  describe('togglePublic', () => {
    it('should toggle isPublic from false to true', async () => {
      const dashboard = createSampleDashboard({ isPublic: false });
      const toggled = { ...dashboard, isPublic: true };

      mockDb.setSelectResult([dashboard]);
      mockDb.setUpdateResult([toggled]);

      const result = await repo.togglePublic(dashboard.id);

      expect(result?.isPublic).toBe(true);
    });

    it('should return null when dashboard not found', async () => {
      mockDb.setSelectResult([]);

      const result = await repo.togglePublic('non-existent');

      expect(result).toBeNull();
    });
  });

  // ── updateLayout ────────────────────────────────────────────────

  describe('updateLayout', () => {
    it('should update the layout configuration', async () => {
      const newLayout = { columns: 24, rowHeight: 60 };
      const updated = createSampleDashboard({ layout: newLayout });
      mockDb.setUpdateResult([updated]);

      const result = await repo.updateLayout(updated.id, newLayout);

      expect(result?.layout).toEqual(newLayout);
    });
  });

  // ── updateFilters ───────────────────────────────────────────────

  describe('updateFilters', () => {
    it('should update dashboard-level filters', async () => {
      const newFilters = [
        { id: 'f1', type: 'date', column: 'created_at' },
      ];
      const updated = createSampleDashboard({ filters: newFilters });
      mockDb.setUpdateResult([updated]);

      const result = await repo.updateFilters(updated.id, newFilters);

      expect(result?.filters).toEqual(newFilters);
    });
  });

  // ── Card Operations ─────────────────────────────────────────────

  describe('findCards', () => {
    it('should return cards for a dashboard ordered by position', async () => {
      const cards = [
        createSampleDashboardCard({ positionX: 0, positionY: 0 }),
        createSampleDashboardCard({ positionX: 6, positionY: 0 }),
        createSampleDashboardCard({ positionX: 0, positionY: 4 }),
      ];
      mockDb.setSelectResult(cards);

      const result = await repo.findCards('dash-id');

      expect(result).toEqual(cards);
      expect(result).toHaveLength(3);
    });
  });

  describe('findCardById', () => {
    it('should return a specific card', async () => {
      const card = createSampleDashboardCard();
      mockDb.setSelectResult([card]);

      const result = await repo.findCardById(card.id);

      expect(result).toEqual(card);
    });

    it('should return null when card not found', async () => {
      mockDb.setSelectResult([]);

      const result = await repo.findCardById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('addCard', () => {
    it('should add a card to a dashboard', async () => {
      const card = createSampleDashboardCard();
      mockDb.setUpdateResult([{}]); // Touch dashboard updatedAt
      mockDb.setInsertResult([card]);

      const result = await repo.addCard({
        dashboardId: 'dash-id',
        questionId: 'q-id',
        positionX: 0,
        positionY: 0,
        width: 6,
        height: 4,
      });

      expect(result).toEqual(card);
    });
  });

  describe('addCards', () => {
    it('should add multiple cards in a batch', async () => {
      const cards = [
        createSampleDashboardCard(),
        createSampleDashboardCard({ positionX: 6 }),
      ];
      mockDb.setUpdateResult([{}]);
      mockDb.setInsertResult(cards);

      const result = await repo.addCards([
        { dashboardId: 'dash-id', questionId: 'q1', positionX: 0, positionY: 0, width: 6, height: 4 },
        { dashboardId: 'dash-id', questionId: 'q2', positionX: 6, positionY: 0, width: 6, height: 4 },
      ]);

      expect(result).toEqual(cards);
    });

    it('should return empty array for empty input', async () => {
      const result = await repo.addCards([]);

      expect(result).toEqual([]);
    });
  });

  describe('updateCard', () => {
    it('should update card position and size', async () => {
      const updated = createSampleDashboardCard({ positionX: 3, width: 8 });
      mockDb.setUpdateResult([updated]);

      const result = await repo.updateCard(updated.id, {
        positionX: 3,
        width: 8,
      });

      expect(result?.positionX).toBe(3);
      expect(result?.width).toBe(8);
    });
  });

  describe('removeCard', () => {
    it('should remove a card from a dashboard', async () => {
      const card = createSampleDashboardCard();
      mockDb.setSelectResult([card]);
      mockDb.setDeleteResult([{ id: card.id }]);

      const result = await repo.removeCard(card.id);

      expect(result).toBe(true);
    });

    it('should return false when card not found', async () => {
      mockDb.setSelectResult([]);

      const result = await repo.removeCard('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('removeAllCards', () => {
    it('should remove all cards from a dashboard', async () => {
      mockDb.setDeleteResult([{ id: '1' }, { id: '2' }, { id: '3' }]);

      const result = await repo.removeAllCards('dash-id');

      expect(result).toBe(3);
    });
  });

  describe('countCards', () => {
    it('should return card count for a dashboard', async () => {
      mockDb.setSelectResult([{ count: 5 }]);

      const result = await repo.countCards('dash-id');

      expect(result).toBe(5);
    });
  });

  // ── findRecent ──────────────────────────────────────────────────

  describe('findRecent', () => {
    it('should return recently updated dashboards', async () => {
      const dashboards = [
        createSampleDashboard({ name: 'Recent 1' }),
        createSampleDashboard({ name: 'Recent 2' }),
      ];
      mockDb.setSelectResult(dashboards);

      const result = await repo.findRecent('org-id', 5);

      expect(result).toEqual(dashboards);
    });
  });

  // ── countByOrganization ─────────────────────────────────────────

  describe('countByOrganization', () => {
    it('should return count for organization', async () => {
      mockDb.setSelectResult([{ count: 12 }]);

      const result = await repo.countByOrganization('org-id');

      expect(result).toBe(12);
    });
  });

  // ── save (upsert) ──────────────────────────────────────────────

  describe('save', () => {
    it('should create when no id provided', async () => {
      const newDash = createSampleDashboard();
      mockDb.setInsertResult([newDash]);

      const result = await repo.save({
        name: 'New Dashboard',
        organizationId: 'org-id',
        createdBy: 'user-id',
      });

      expect(result).toEqual(newDash);
    });
  });

  // ── findAll (paginated) ─────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const dashboards = [createSampleDashboard()];

      let callCount = 0;
      mockDb.mocks.select.mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [{ count: 1 }] : dashboards;
        return createChainableResult(result);
      });

      const result = await repo.findAll(
        { organizationId: 'org-id' },
        { page: 1, limit: 10 },
      );

      expect(result.data).toEqual(dashboards);
      expect(result.total).toBe(1);
    });

    it('should filter by isPublic', async () => {
      let callCount = 0;
      mockDb.mocks.select.mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [{ count: 2 }] : [
          createSampleDashboard({ isPublic: true }),
        ];
        return createChainableResult(result);
      });

      const result = await repo.findAll({ isPublic: true });

      expect(result.total).toBe(2);
    });
  });

  // ── findPublic ──────────────────────────────────────────────────

  describe('findPublic', () => {
    it('should return only public dashboards', async () => {
      let callCount = 0;
      mockDb.mocks.select.mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [{ count: 1 }] : [
          createSampleDashboard({ isPublic: true }),
        ];
        return createChainableResult(result);
      });

      const result = await repo.findPublic('org-id');

      expect(result.total).toBe(1);
    });
  });

  // ── count ───────────────────────────────────────────────────────

  describe('count', () => {
    it('should return total dashboard count', async () => {
      mockDb.setSelectResult([{ count: 30 }]);

      const result = await repo.count();

      expect(result).toBe(30);
    });
  });
});

// ── Helper ──────────────────────────────────────────────────────────

function createChainableResult(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = [
    'from', 'where', 'limit', 'offset', 'orderBy',
    'leftJoin', 'innerJoin', 'groupBy', 'returning',
  ];
  for (const method of methods) {
    chain[method] = () => chain;
  }
  chain['then'] = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}
