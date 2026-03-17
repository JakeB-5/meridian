import { eq, like, or, sql, SQL, desc } from 'drizzle-orm';
import { organizations } from '../schema/organizations.js';
import type { Organization, NewOrganization } from '../schema/organizations.js';
import type { Database } from '../connection.js';
import type { PaginationParams, PaginatedResult, SortParams } from './base.repository.js';

// ── Types ───────────────────────────────────────────────────────────

export interface OrganizationFilters {
  /** Partial name match (case-insensitive LIKE) */
  search?: string;
}

export interface UpdateOrganizationData {
  name?: string;
  slug?: string;
  settings?: Record<string, unknown>;
}

// ── Repository ──────────────────────────────────────────────────────

export class OrganizationRepository {
  constructor(private readonly db: Database) {}

  // ── Finders ─────────────────────────────────────────────────────

  /**
   * Find an organization by its primary key.
   */
  async findById(id: string): Promise<Organization | null> {
    const rows = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Find an organization by its unique slug.
   */
  async findBySlug(slug: string): Promise<Organization | null> {
    const rows = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * List all organizations with optional search, pagination, and sorting.
   */
  async findAll(
    filters?: OrganizationFilters,
    pagination?: PaginationParams,
    sort?: SortParams,
  ): Promise<PaginatedResult<Organization>> {
    const conditions: SQL[] = [];

    if (filters?.search) {
      const pattern = `%${filters.search}%`;
      conditions.push(
        or(
          like(organizations.name, pattern),
          like(organizations.slug, pattern),
        )!,
      );
    }

    const whereClause = conditions.length > 0
      ? conditions.reduce((acc, c) => sql`${acc} AND ${c}`)
      : undefined;

    // Count total matching rows
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(organizations)
      .where(whereClause);

    const total = Number(countResult[0]?.count ?? 0);

    // Determine pagination
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination?.limit ?? 25));
    const offset = (page - 1) * limit;

    // Determine sort order
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sortColumnMap: Record<string, any> = {
      name: organizations.name,
      slug: organizations.slug,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
    };
    const sortColumn = (sort?.field && sortColumnMap[sort.field]) ?? organizations.createdAt;
    const sortDirection = sort?.direction === 'asc' ? sql`ASC` : sql`DESC`;

    const data = await this.db
      .select()
      .from(organizations)
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
   * Check if a slug is already taken.
   */
  async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    const conditions: SQL[] = [eq(organizations.slug, slug)];
    if (excludeId) {
      conditions.push(sql`${organizations.id} != ${excludeId}`);
    }

    const rows = await this.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(conditions.reduce((acc, c) => sql`${acc} AND ${c}`))
      .limit(1);

    return rows.length > 0;
  }

  // ── Mutations ───────────────────────────────────────────────────

  /**
   * Create a new organization.
   */
  async create(data: NewOrganization): Promise<Organization> {
    const rows = await this.db
      .insert(organizations)
      .values(data)
      .returning();

    return rows[0]!;
  }

  /**
   * Update an existing organization by ID.
   * Only provided fields are updated; updatedAt is always refreshed.
   */
  async update(id: string, data: UpdateOrganizationData): Promise<Organization | null> {
    const rows = await this.db
      .update(organizations)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, id))
      .returning();

    return rows[0] ?? null;
  }

  /**
   * Save (upsert) an organization.
   * If an organization with the same ID exists, it is updated.
   * Otherwise a new organization is created.
   */
  async save(data: NewOrganization & { id?: string }): Promise<Organization> {
    if (data.id) {
      const existing = await this.findById(data.id);
      if (existing) {
        const updated = await this.update(data.id, {
          name: data.name,
          slug: data.slug,
          settings: data.settings as Record<string, unknown> | undefined,
        });
        return updated!;
      }
    }

    return this.create(data);
  }

  /**
   * Delete an organization by ID.
   * Returns true if a row was deleted, false if no matching row found.
   */
  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(organizations)
      .where(eq(organizations.id, id))
      .returning({ id: organizations.id });

    return rows.length > 0;
  }

  /**
   * Count all organizations.
   */
  async count(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(organizations);

    return Number(result[0]?.count ?? 0);
  }

  /**
   * Get the most recently created organizations.
   */
  async findRecent(limit: number = 10): Promise<Organization[]> {
    return this.db
      .select()
      .from(organizations)
      .orderBy(desc(organizations.createdAt))
      .limit(limit);
  }

  /**
   * Update organization settings (merges with existing settings).
   */
  async updateSettings(
    id: string,
    settings: Record<string, unknown>,
  ): Promise<Organization | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const mergedSettings = {
      ...(existing.settings as Record<string, unknown>),
      ...settings,
    };

    return this.update(id, { settings: mergedSettings });
  }
}
