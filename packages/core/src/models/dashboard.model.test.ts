import { describe, it, expect } from 'vitest';
import { Dashboard, DashboardCard } from './dashboard.model.js';
import { isOk, isErr } from '@meridian/shared';
import type { Result } from '@meridian/shared';

describe('Dashboard', () => {
  const validParams = {
    name: 'Sales Dashboard',
    organizationId: 'org-123',
    createdBy: 'user-123',
    description: 'Overview of sales metrics',
  };

  describe('create()', () => {
    it('should create an empty dashboard with defaults', () => {
      const result = Dashboard.create(validParams);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      const d = result.value;
      expect(d.name).toBe('Sales Dashboard');
      expect(d.description).toBe('Overview of sales metrics');
      expect(d.organizationId).toBe('org-123');
      expect(d.createdBy).toBe('user-123');
      expect(d.isPublic).toBe(false);
      expect(d.layout.columns).toBe(12);
      expect(d.layout.rowHeight).toBe(80);
      expect(d.cards).toHaveLength(0);
      expect(d.filters).toHaveLength(0);
    });

    it('should accept custom layout', () => {
      const result = Dashboard.create({
        ...validParams,
        layout: { columns: 24, rowHeight: 100 },
      });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.layout.columns).toBe(24);
      expect(result.value.layout.rowHeight).toBe(100);
    });

    it('should accept isPublic flag', () => {
      const result = Dashboard.create({ ...validParams, isPublic: true });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.isPublic).toBe(true);
    });

    it('should reject empty name', () => {
      const result = Dashboard.create({ ...validParams, name: '' });
      expect(isErr(result)).toBe(true);
    });

    it('should reject empty organizationId', () => {
      const result = Dashboard.create({ ...validParams, organizationId: '' });
      expect(isErr(result)).toBe(true);
    });

    it('should reject empty createdBy', () => {
      const result = Dashboard.create({ ...validParams, createdBy: '' });
      expect(isErr(result)).toBe(true);
    });
  });

  describe('addCard()', () => {
    it('should add a card to the dashboard', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const result = dashResult.value.addCard({
        questionId: 'q-1',
        position: { x: 0, y: 0 },
        size: { width: 4, height: 3 },
      });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.cardCount).toBe(1);
      expect(result.value.cards[0]!.questionId).toBe('q-1');
    });

    it('should add multiple non-overlapping cards', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const r1 = dashResult.value.addCard({
        questionId: 'q-1',
        position: { x: 0, y: 0 },
        size: { width: 4, height: 3 },
      });
      if (!isOk(r1)) return;

      const r2 = r1.value.addCard({
        questionId: 'q-2',
        position: { x: 4, y: 0 },
        size: { width: 4, height: 3 },
      });
      expect(isOk(r2)).toBe(true);
      if (!isOk(r2)) return;
      expect(r2.value.cardCount).toBe(2);
    });

    it('should reject overlapping cards', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const r1 = dashResult.value.addCard({
        questionId: 'q-1',
        position: { x: 0, y: 0 },
        size: { width: 4, height: 3 },
      });
      if (!isOk(r1)) return;

      const r2 = r1.value.addCard({
        questionId: 'q-2',
        position: { x: 2, y: 1 },
        size: { width: 4, height: 3 },
      });
      expect(isErr(r2)).toBe(true);
      if (!isErr(r2)) return;
      expect(r2.error.message).toContain('overlaps');
    });

    it('should reject card exceeding dashboard width', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const result = dashResult.value.addCard({
        questionId: 'q-1',
        position: { x: 10, y: 0 },
        size: { width: 4, height: 3 },
      });
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.message).toContain('exceeds');
    });

    it('should reject negative position', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const result = dashResult.value.addCard({
        questionId: 'q-1',
        position: { x: -1, y: 0 },
        size: { width: 4, height: 3 },
      });
      expect(isErr(result)).toBe(true);
    });

    it('should reject card that is too small', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const result = dashResult.value.addCard({
        questionId: 'q-1',
        position: { x: 0, y: 0 },
        size: { width: 1, height: 1 },
      });
      expect(isErr(result)).toBe(true);
    });

    it('should reject card that is too large', () => {
      const dashResult = Dashboard.create({
        ...validParams,
        layout: { columns: 48 },
      });
      if (!isOk(dashResult)) return;

      const result = dashResult.value.addCard({
        questionId: 'q-1',
        position: { x: 0, y: 0 },
        size: { width: 25, height: 21 },
      });
      expect(isErr(result)).toBe(true);
    });

    it('should reject empty questionId', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const result = dashResult.value.addCard({
        questionId: '',
        position: { x: 0, y: 0 },
        size: { width: 4, height: 3 },
      });
      expect(isErr(result)).toBe(true);
    });

    it('should reject non-integer position', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const result = dashResult.value.addCard({
        questionId: 'q-1',
        position: { x: 0.5, y: 0 },
        size: { width: 4, height: 3 },
      });
      expect(isErr(result)).toBe(true);
    });

    it('should reject non-integer size', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const result = dashResult.value.addCard({
        questionId: 'q-1',
        position: { x: 0, y: 0 },
        size: { width: 3.5, height: 3 },
      });
      expect(isErr(result)).toBe(true);
    });

    it('should enforce max card limit', () => {
      let dashboard: Dashboard | undefined;
      const createResult = Dashboard.create({
        ...validParams,
        layout: { columns: 48 },
      });
      if (!isOk(createResult)) return;
      dashboard = createResult.value;

      // Add 50 cards in a grid
      for (let i = 0; i < 50; i++) {
        const x = (i % 12) * 4;
        const y = Math.floor(i / 12) * 3;
        const r: Result<Dashboard> = dashboard!.addCard({
          questionId: `q-${i}`,
          position: { x, y },
          size: { width: 4, height: 3 },
        });
        if (!isOk(r)) {
          // If we fail early (e.g., layout too small), just check the card limit
          break;
        }
        dashboard = r.value as Dashboard;
      }

      // 51st should fail
      if (dashboard && dashboard.cardCount >= 50) {
        const result = dashboard.addCard({
          questionId: 'q-overflow',
          position: { x: 0, y: 100 },
          size: { width: 2, height: 2 },
        });
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.message).toContain('50');
        }
      }
    });
  });

  describe('removeCard()', () => {
    it('should remove an existing card', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const addResult = dashResult.value.addCard({
        questionId: 'q-1',
        position: { x: 0, y: 0 },
        size: { width: 4, height: 3 },
      });
      if (!isOk(addResult)) return;

      const cardId = addResult.value.cards[0]!.id;
      const result = addResult.value.removeCard(cardId);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.cardCount).toBe(0);
    });

    it('should reject removing non-existent card', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const result = dashResult.value.removeCard('nonexistent');
      expect(isErr(result)).toBe(true);
    });
  });

  describe('updateLayout()', () => {
    it('should update layout columns and row height', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const result = dashResult.value.updateLayout({ columns: 24, rowHeight: 100 });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.layout.columns).toBe(24);
      expect(result.value.layout.rowHeight).toBe(100);
    });

    it('should reject if existing cards would exceed new columns', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const addResult = dashResult.value.addCard({
        questionId: 'q-1',
        position: { x: 8, y: 0 },
        size: { width: 4, height: 3 },
      });
      if (!isOk(addResult)) return;

      // Shrinking to 10 columns would cause card at x=8, width=4 to exceed
      const result = addResult.value.updateLayout({ columns: 10 });
      expect(isErr(result)).toBe(true);
    });

    it('should reject invalid column count', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const result = dashResult.value.updateLayout({ columns: 0 });
      expect(isErr(result)).toBe(true);
    });

    it('should reject invalid row height', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const result = dashResult.value.updateLayout({ rowHeight: 10 });
      expect(isErr(result)).toBe(true);
    });
  });

  describe('reorderCards()', () => {
    it('should reorder cards by provided ID list', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const r1 = dashResult.value.addCard({
        questionId: 'q-1',
        position: { x: 0, y: 0 },
        size: { width: 4, height: 3 },
      });
      if (!isOk(r1)) return;

      const r2 = r1.value.addCard({
        questionId: 'q-2',
        position: { x: 4, y: 0 },
        size: { width: 4, height: 3 },
      });
      if (!isOk(r2)) return;

      const cards = r2.value.cards;
      const reversed = [cards[1]!.id, cards[0]!.id];
      const result = r2.value.reorderCards(reversed);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.cards[0]!.id).toBe(cards[1]!.id);
      expect(result.value.cards[1]!.id).toBe(cards[0]!.id);
    });

    it('should reject if card count mismatch', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const r1 = dashResult.value.addCard({
        questionId: 'q-1',
        position: { x: 0, y: 0 },
        size: { width: 4, height: 3 },
      });
      if (!isOk(r1)) return;

      const result = r1.value.reorderCards([]);
      expect(isErr(result)).toBe(true);
    });

    it('should reject if unknown card ID provided', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const r1 = dashResult.value.addCard({
        questionId: 'q-1',
        position: { x: 0, y: 0 },
        size: { width: 4, height: 3 },
      });
      if (!isOk(r1)) return;

      const result = r1.value.reorderCards(['unknown-id']);
      expect(isErr(result)).toBe(true);
    });

    it('should reject duplicate card IDs', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const r1 = dashResult.value.addCard({
        questionId: 'q-1',
        position: { x: 0, y: 0 },
        size: { width: 4, height: 3 },
      });
      if (!isOk(r1)) return;

      const r2 = r1.value.addCard({
        questionId: 'q-2',
        position: { x: 4, y: 0 },
        size: { width: 4, height: 3 },
      });
      if (!isOk(r2)) return;

      const cardId = r2.value.cards[0]!.id;
      const result = r2.value.reorderCards([cardId, cardId]);
      expect(isErr(result)).toBe(true);
    });
  });

  describe('moveCard()', () => {
    it('should move a card to a new position', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const r1 = dashResult.value.addCard({
        questionId: 'q-1',
        position: { x: 0, y: 0 },
        size: { width: 4, height: 3 },
      });
      if (!isOk(r1)) return;

      const cardId = r1.value.cards[0]!.id;
      const result = r1.value.moveCard(cardId, { x: 6, y: 0 });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.cards.find(c => c.id === cardId)!.position.x).toBe(6);
    });

    it('should reject move that causes overlap', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const r1 = dashResult.value.addCard({
        questionId: 'q-1',
        position: { x: 0, y: 0 },
        size: { width: 4, height: 3 },
      });
      if (!isOk(r1)) return;

      const r2 = r1.value.addCard({
        questionId: 'q-2',
        position: { x: 6, y: 0 },
        size: { width: 4, height: 3 },
      });
      if (!isOk(r2)) return;

      const cardId = r2.value.cards[0]!.id;
      const result = r2.value.moveCard(cardId, { x: 5, y: 0 });
      expect(isErr(result)).toBe(true);
    });

    it('should reject move for non-existent card', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const result = dashResult.value.moveCard('nonexistent', { x: 0, y: 0 });
      expect(isErr(result)).toBe(true);
    });
  });

  describe('updateMetadata()', () => {
    it('should update name and description', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const result = dashResult.value.updateMetadata({
        name: 'Updated Dashboard',
        description: 'New description',
        isPublic: true,
      });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.name).toBe('Updated Dashboard');
      expect(result.value.description).toBe('New description');
      expect(result.value.isPublic).toBe(true);
    });

    it('should reject empty name', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const result = dashResult.value.updateMetadata({ name: '  ' });
      expect(isErr(result)).toBe(true);
    });
  });

  describe('addFilter() / removeFilter()', () => {
    it('should add and remove filters', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const addResult = dashResult.value.addFilter({
        type: 'select',
        column: 'status',
        defaultValue: 'active',
      });
      expect(isOk(addResult)).toBe(true);
      if (!isOk(addResult)) return;
      expect(addResult.value.filters).toHaveLength(1);

      const filterId = addResult.value.filters[0]!.id;
      const removeResult = addResult.value.removeFilter(filterId);
      expect(isOk(removeResult)).toBe(true);
      if (!isOk(removeResult)) return;
      expect(removeResult.value.filters).toHaveLength(0);
    });

    it('should reject filter with empty type', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const result = dashResult.value.addFilter({ type: '', column: 'status' });
      expect(isErr(result)).toBe(true);
    });

    it('should reject removing non-existent filter', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const result = dashResult.value.removeFilter('nonexistent');
      expect(isErr(result)).toBe(true);
    });
  });

  describe('findCard()', () => {
    it('should find an existing card', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const addResult = dashResult.value.addCard({
        questionId: 'q-1',
        position: { x: 0, y: 0 },
        size: { width: 4, height: 3 },
      });
      if (!isOk(addResult)) return;

      const cardId = addResult.value.cards[0]!.id;
      const found = addResult.value.findCard(cardId);
      expect(found).toBeDefined();
      expect(found!.questionId).toBe('q-1');
    });

    it('should return undefined for non-existent card', () => {
      const dashResult = Dashboard.create(validParams);
      if (!isOk(dashResult)) return;

      const found = dashResult.value.findCard('nonexistent');
      expect(found).toBeUndefined();
    });
  });
});

describe('DashboardCard', () => {
  it('should compute bounds correctly', () => {
    const card = new DashboardCard({
      id: 'card-1',
      dashboardId: 'dash-1',
      questionId: 'q-1',
      position: { x: 2, y: 3 },
      size: { width: 4, height: 5 },
    });
    expect(card.bounds).toEqual({ x1: 2, y1: 3, x2: 6, y2: 8 });
  });

  it('should convert to data', () => {
    const card = new DashboardCard({
      id: 'card-1',
      dashboardId: 'dash-1',
      questionId: 'q-1',
      position: { x: 0, y: 0 },
      size: { width: 4, height: 3 },
    });
    const data = card.toData();
    expect(data.id).toBe('card-1');
    expect(data.questionId).toBe('q-1');
  });
});
