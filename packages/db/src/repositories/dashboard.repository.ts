import { eq, and, sql, SQL, desc, ilike } from 'drizzle-orm';
import { dashboards } from '../schema/dashboards.js';
import { dashboardCards } from '../schema/dashboard-cards.js';
import { questions } from '../schema/questions.js';
import { users } from '../schema/users.js';
import type { Dashboard, NewDashboard } from '../schema/dashboards.js';
import type { DashboardCard, NewDashboardCard } from '../schema/dashboard-cards.js';
import type { Database } from '../connection.js';
import type { PaginationParams, PaginatedResult, SortParams } from './base.repository.js';

// ── Types ───────────────────────────────────────────────────────────

export interface DashboardFilters {
  /** Filter by organization */
  organizationId?: string;
  /** Filter by creator */
  createdBy?: string;
  /** Filter public/private */
  isPublic?: boolean;
  /** Partial name/description match (case-insensitive) */
  search?: string;
}

export interface UpdateDashboardData {
  name?: string;
  description?: string | null;
  isPublic?: boolean;
  layout?: Record<string, unknown>;
  filters?: Record<string, unknown>[];
}

export interface UpdateDashboardCardData {
  positionX?: number;
  positionY?: number;
  width?: number;
  height?: number;
  settings?: Record<string, unknown>;
}

export interface DashboardWithCards extends Dashboard {
  cards: DashboardCard[];
}

export interface DashboardWithCreator extends Dashboard {
  creatorName?: string | null;
  creatorEmail?: string | null;
}

// ── Repository ──────────────────────────────────────────────────────

export class DashboardRepository {
  constructor(private readonly db: Database) {}

  // ── Dashboard Finders ───────────────────────────────────────────

  /**
   * Find a dashboard by primary key.
   */
  async findById(id: string): Promise<Dashboard | null> {
    const rows = await this.db
      .select()
      .from(dashboards)
      .where(eq(dashboards.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Find a dashboard by ID, including creator details.
   */
  async findByIdWithCreator(id: string): Promise<DashboardWithCreator | null> {
    const rows = await this.db
      .select({
        id: dashboards.id,
        name: dashboards.name,
        description: dashboards.description,
        organizationId: dashboards.organizationId,
        createdBy: dashboards.createdBy,
        isPublic: dashboards.isPublic,
        layout: dashboards.layout,
        filters: dashboards.filters,
        createdAt: dashboards.createdAt,
        updatedAt: dashboards.updatedAt,
        creatorName: users.name,
        creatorEmail: users.email,
      })
      .from(dashboards)
      .leftJoin(users, eq(dashboards.createdBy, users.id))
      .where(eq(dashboards.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Find a dashboard by ID, including all its cards.
   */
  async findByIdWithCards(id: string): Promise<DashboardWithCards | null> {
    const dashboard = await this.findById(id);
    if (!dashboard) return null;

    const cards = await this.db
      .select()
      .from(dashboardCards)
      .where(eq(dashboardCards.dashboardId, id))
      .orderBy(dashboardCards.positionY, dashboardCards.positionX);

    return { ...dashboard, cards };
  }

  /**
   * List dashboards for a specific organization.
   */
  async findByOrganization(
    organizationId: string,
    filters?: Omit<DashboardFilters, 'organizationId'>,
    pagination?: PaginationParams,
    sort?: SortParams,
  ): Promise<PaginatedResult<Dashboard>> {
    return this.findAll({ ...filters, organizationId }, pagination, sort);
  }

  /**
   * List all public dashboards for an organization.
   * Useful for the public gallery / embedding.
   */
  async findPublic(
    organizationId: string,
    pagination?: PaginationParams,
    sort?: SortParams,
  ): Promise<PaginatedResult<Dashboard>> {
    return this.findAll({ organizationId, isPublic: true }, pagination, sort);
  }

  /**
   * List all dashboards matching the given filters.
   */
  async findAll(
    filters?: DashboardFilters,
    pagination?: PaginationParams,
    sort?: SortParams,
  ): Promise<PaginatedResult<Dashboard>> {
    const conditions: SQL[] = [];

    if (filters?.organizationId) {
      conditions.push(eq(dashboards.organizationId, filters.organizationId));
    }
    if (filters?.createdBy) {
      conditions.push(eq(dashboards.createdBy, filters.createdBy));
    }
    if (filters?.isPublic !== undefined) {
      conditions.push(eq(dashboards.isPublic, filters.isPublic));
    }
    if (filters?.search) {
      const pattern = `%${filters.search}%`;
      conditions.push(
        sql`(${ilike(dashboards.name, pattern)} OR ${ilike(sql`COALESCE(${dashboards.description}, '')`, pattern)})`,
      );
    }

    const whereClause = conditions.length > 0
      ? conditions.reduce((acc, c) => sql`${acc} AND ${c}`)
      : undefined;

    // Count
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(dashboards)
      .where(whereClause);

    const total = Number(countResult[0]?.count ?? 0);

    // Pagination
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination?.limit ?? 25));
    const offset = (page - 1) * limit;

    // Sort
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sortColumnMap: Record<string, any> = {
      name: dashboards.name,
      createdAt: dashboards.createdAt,
      updatedAt: dashboards.updatedAt,
    };
    const sortColumn = (sort?.field && sortColumnMap[sort.field]) ?? dashboards.updatedAt;
    const sortDirection = sort?.direction === 'asc' ? sql`ASC` : sql`DESC`;

    const data = await this.db
      .select()
      .from(dashboards)
      .where(whereClause)
      .orderBy(sql`${sortColumn} ${sortDirection}`)
      .limit(limit)
      .offset(offset);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    };
  }

  /**
   * Find recently updated dashboards for an organization.
   */
  async findRecent(organizationId: string, limit: number = 10): Promise<Dashboard[]> {
    return this.db
      .select()
      .from(dashboards)
      .where(eq(dashboards.organizationId, organizationId))
      .orderBy(desc(dashboards.updatedAt))
      .limit(limit);
  }

  // ── Dashboard Mutations ─────────────────────────────────────────

  /**
   * Create a new dashboard.
   */
  async create(data: NewDashboard): Promise<Dashboard> {
    const rows = await this.db
      .insert(dashboards)
      .values(data)
      .returning();

    return rows[0]!;
  }

  /**
   * Update an existing dashboard by ID.
   */
  async update(id: string, data: UpdateDashboardData): Promise<Dashboard | null> {
    const rows = await this.db
      .update(dashboards)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(dashboards.id, id))
      .returning();

    return rows[0] ?? null;
  }

  /**
   * Save (upsert) a dashboard.
   */
  async save(data: NewDashboard & { id?: string }): Promise<Dashboard> {
    if (data.id) {
      const existing = await this.findById(data.id);
      if (existing) {
        const updated = await this.update(data.id, {
          name: data.name,
          description: data.description,
          isPublic: data.isPublic,
          layout: data.layout as Record<string, unknown> | undefined,
          filters: data.filters as Record<string, unknown>[] | undefined,
        });
        return updated!;
      }
    }

    return this.create(data);
  }

  /**
   * Delete a dashboard by ID (cascades to cards).
   */
  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(dashboards)
      .where(eq(dashboards.id, id))
      .returning({ id: dashboards.id });

    return rows.length > 0;
  }

  /**
   * Toggle public visibility of a dashboard.
   */
  async togglePublic(id: string): Promise<Dashboard | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    return this.update(id, { isPublic: !existing.isPublic });
  }

  /**
   * Update the layout configuration of a dashboard.
   */
  async updateLayout(id: string, layout: Record<string, unknown>): Promise<Dashboard | null> {
    return this.update(id, { layout });
  }

  /**
   * Update dashboard-level filters.
   */
  async updateFilters(
    id: string,
    filters: Record<string, unknown>[],
  ): Promise<Dashboard | null> {
    return this.update(id, { filters });
  }

  // ── Card Operations ─────────────────────────────────────────────

  /**
   * List all cards for a dashboard, ordered by position.
   */
  async findCards(dashboardId: string): Promise<DashboardCard[]> {
    return this.db
      .select()
      .from(dashboardCards)
      .where(eq(dashboardCards.dashboardId, dashboardId))
      .orderBy(dashboardCards.positionY, dashboardCards.positionX);
  }

  /**
   * Find a specific card by ID.
   */
  async findCardById(cardId: string): Promise<DashboardCard | null> {
    const rows = await this.db
      .select()
      .from(dashboardCards)
      .where(eq(dashboardCards.id, cardId))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Add a card to a dashboard.
   */
  async addCard(data: NewDashboardCard): Promise<DashboardCard> {
    // Touch the parent dashboard's updatedAt
    await this.db
      .update(dashboards)
      .set({ updatedAt: new Date() })
      .where(eq(dashboards.id, data.dashboardId));

    const rows = await this.db
      .insert(dashboardCards)
      .values(data)
      .returning();

    return rows[0]!;
  }

  /**
   * Add multiple cards to a dashboard in a single batch.
   */
  async addCards(cards: NewDashboardCard[]): Promise<DashboardCard[]> {
    if (cards.length === 0) return [];

    // Touch the parent dashboard's updatedAt
    const dashboardId = cards[0]!.dashboardId;
    await this.db
      .update(dashboards)
      .set({ updatedAt: new Date() })
      .where(eq(dashboards.id, dashboardId));

    return this.db
      .insert(dashboardCards)
      .values(cards)
      .returning();
  }

  /**
   * Update a card's position, size, or settings.
   */
  async updateCard(
    cardId: string,
    data: UpdateDashboardCardData,
  ): Promise<DashboardCard | null> {
    const rows = await this.db
      .update(dashboardCards)
      .set(data)
      .where(eq(dashboardCards.id, cardId))
      .returning();

    if (rows[0]) {
      // Touch the parent dashboard's updatedAt
      await this.db
        .update(dashboards)
        .set({ updatedAt: new Date() })
        .where(eq(dashboards.id, rows[0].dashboardId));
    }

    return rows[0] ?? null;
  }

  /**
   * Batch update card positions (used after drag-and-drop rearrangement).
   */
  async updateCardPositions(
    updates: Array<{
      id: string;
      positionX: number;
      positionY: number;
      width: number;
      height: number;
    }>,
  ): Promise<void> {
    if (updates.length === 0) return;

    // Use a transaction-like approach: update each card
    for (const update of updates) {
      await this.db
        .update(dashboardCards)
        .set({
          positionX: update.positionX,
          positionY: update.positionY,
          width: update.width,
          height: update.height,
        })
        .where(eq(dashboardCards.id, update.id));
    }
  }

  /**
   * Remove a card from a dashboard.
   */
  async removeCard(cardId: string): Promise<boolean> {
    const card = await this.findCardById(cardId);
    if (!card) return false;

    const rows = await this.db
      .delete(dashboardCards)
      .where(eq(dashboardCards.id, cardId))
      .returning({ id: dashboardCards.id });

    if (rows.length > 0) {
      // Touch the parent dashboard's updatedAt
      await this.db
        .update(dashboards)
        .set({ updatedAt: new Date() })
        .where(eq(dashboards.id, card.dashboardId));
    }

    return rows.length > 0;
  }

  /**
   * Remove all cards from a dashboard.
   */
  async removeAllCards(dashboardId: string): Promise<number> {
    const rows = await this.db
      .delete(dashboardCards)
      .where(eq(dashboardCards.dashboardId, dashboardId))
      .returning({ id: dashboardCards.id });

    if (rows.length > 0) {
      await this.db
        .update(dashboards)
        .set({ updatedAt: new Date() })
        .where(eq(dashboards.id, dashboardId));
    }

    return rows.length;
  }

  /**
   * Count cards on a dashboard.
   */
  async countCards(dashboardId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(dashboardCards)
      .where(eq(dashboardCards.dashboardId, dashboardId));

    return Number(result[0]?.count ?? 0);
  }

  // ── Dashboard Counts ────────────────────────────────────────────

  /**
   * Count dashboards for an organization.
   */
  async countByOrganization(organizationId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(dashboards)
      .where(eq(dashboards.organizationId, organizationId));

    return Number(result[0]?.count ?? 0);
  }

  /**
   * Count all dashboards.
   */
  async count(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(dashboards);

    return Number(result[0]?.count ?? 0);
  }
}
