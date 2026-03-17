import { describe, it, expect } from 'vitest';
import { createDashboardSchema, updateDashboardSchema, dashboardCardSchema, cardPositionSchema, cardSizeSchema } from './dashboard.schema.js';

describe('cardPositionSchema', () => {
  it('accepts valid positions', () => {
    expect(cardPositionSchema.safeParse({ x: 0, y: 0 }).success).toBe(true);
    expect(cardPositionSchema.safeParse({ x: 5, y: 10 }).success).toBe(true);
  });

  it('rejects negative positions', () => {
    expect(cardPositionSchema.safeParse({ x: -1, y: 0 }).success).toBe(false);
    expect(cardPositionSchema.safeParse({ x: 0, y: -1 }).success).toBe(false);
  });
});

describe('cardSizeSchema', () => {
  it('accepts valid sizes', () => {
    expect(cardSizeSchema.safeParse({ width: 4, height: 3 }).success).toBe(true);
  });

  it('rejects too-small sizes', () => {
    expect(cardSizeSchema.safeParse({ width: 1, height: 3 }).success).toBe(false);
    expect(cardSizeSchema.safeParse({ width: 4, height: 1 }).success).toBe(false);
  });

  it('rejects too-large sizes', () => {
    expect(cardSizeSchema.safeParse({ width: 25, height: 3 }).success).toBe(false);
    expect(cardSizeSchema.safeParse({ width: 4, height: 21 }).success).toBe(false);
  });
});

describe('dashboardCardSchema', () => {
  it('validates a complete card', () => {
    const result = dashboardCardSchema.safeParse({
      id: 'card-1',
      dashboardId: 'dash-1',
      questionId: 'q-1',
      position: { x: 0, y: 0 },
      size: { width: 6, height: 4 },
    });
    expect(result.success).toBe(true);
  });
});

describe('createDashboardSchema', () => {
  it('validates a minimal dashboard', () => {
    const result = createDashboardSchema.safeParse({
      name: 'Sales Dashboard',
      organizationId: 'org-1',
    });
    expect(result.success).toBe(true);
  });

  it('validates a full dashboard', () => {
    const result = createDashboardSchema.safeParse({
      name: 'Sales Dashboard',
      description: 'Monthly sales overview',
      organizationId: 'org-1',
      isPublic: true,
      layout: { columns: 12, rowHeight: 80 },
      filters: [{ id: 'f1', type: 'date', column: 'created_at' }],
    });
    expect(result.success).toBe(true);
  });

  it('requires name', () => {
    const result = createDashboardSchema.safeParse({ name: '', organizationId: 'org-1' });
    expect(result.success).toBe(false);
  });

  it('requires organizationId', () => {
    const result = createDashboardSchema.safeParse({ name: 'Test' });
    expect(result.success).toBe(false);
  });

  it('validates description length', () => {
    const result = createDashboardSchema.safeParse({
      name: 'Test',
      organizationId: 'org-1',
      description: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});

describe('updateDashboardSchema', () => {
  it('allows partial updates', () => {
    expect(updateDashboardSchema.safeParse({ name: 'New name' }).success).toBe(true);
    expect(updateDashboardSchema.safeParse({ isPublic: true }).success).toBe(true);
    expect(updateDashboardSchema.safeParse({}).success).toBe(true);
  });
});
