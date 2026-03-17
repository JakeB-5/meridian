import { eq, and, like, or, sql, SQL, desc, ilike } from 'drizzle-orm';
import { datasources } from '../schema/datasources.js';
import { users } from '../schema/users.js';
import type { DataSource, NewDataSource } from '../schema/datasources.js';
import type { Database } from '../connection.js';
import type { PaginationParams, PaginatedResult, SortParams } from './base.repository.js';

// ── Types ───────────────────────────────────────────────────────────

export interface DataSourceFilters {
  /** Filter by organization */
  organizationId?: string;
  /** Filter by connector type */
  type?: string;
  /** Filter by connection status */
  status?: string;
  /** Filter by creator */
  createdBy?: string;
  /** Partial name match (case-insensitive) */
  search?: string;
}

export interface UpdateDataSourceData {
  name?: string;
  type?: 'postgresql' | 'mysql' | 'sqlite' | 'clickhouse' | 'bigquery' | 'snowflake' | 'duckdb';
  config?: Record<string, unknown>;
  status?: 'active' | 'inactive' | 'error' | 'testing';
  lastTestedAt?: Date | null;
}

export interface DataSourceWithCreator extends DataSource {
  creatorName?: string | null;
  creatorEmail?: string | null;
}

// ── Repository ──────────────────────────────────────────────────────

export class DataSourceRepository {
  constructor(private readonly db: Database) {}

  // ── Finders ─────────────────────────────────────────────────────

  /**
   * Find a data source by primary key.
   */
  async findById(id: string): Promise<DataSource | null> {
    const rows = await this.db
      .select()
      .from(datasources)
      .where(eq(datasources.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Find a data source by ID, including creator details.
   */
  async findByIdWithCreator(id: string): Promise<DataSourceWithCreator | null> {
    const rows = await this.db
      .select({
        id: datasources.id,
        name: datasources.name,
        type: datasources.type,
        config: datasources.config,
        organizationId: datasources.organizationId,
        createdBy: datasources.createdBy,
        status: datasources.status,
        lastTestedAt: datasources.lastTestedAt,
        createdAt: datasources.createdAt,
        updatedAt: datasources.updatedAt,
        creatorName: users.name,
        creatorEmail: users.email,
      })
      .from(datasources)
      .leftJoin(users, eq(datasources.createdBy, users.id))
      .where(eq(datasources.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * List data sources for a specific organization.
   */
  async findByOrganization(
    organizationId: string,
    filters?: Omit<DataSourceFilters, 'organizationId'>,
    pagination?: PaginationParams,
    sort?: SortParams,
  ): Promise<PaginatedResult<DataSource>> {
    return this.findAll({ ...filters, organizationId }, pagination, sort);
  }

  /**
   * List all data sources matching the given filters.
   */
  async findAll(
    filters?: DataSourceFilters,
    pagination?: PaginationParams,
    sort?: SortParams,
  ): Promise<PaginatedResult<DataSource>> {
    const conditions: SQL[] = [];

    if (filters?.organizationId) {
      conditions.push(eq(datasources.organizationId, filters.organizationId));
    }
    if (filters?.type) {
      conditions.push(sql`${datasources.type} = ${filters.type}`);
    }
    if (filters?.status) {
      conditions.push(sql`${datasources.status} = ${filters.status}`);
    }
    if (filters?.createdBy) {
      conditions.push(eq(datasources.createdBy, filters.createdBy));
    }
    if (filters?.search) {
      conditions.push(ilike(datasources.name, `%${filters.search}%`));
    }

    const whereClause = conditions.length > 0
      ? conditions.reduce((acc, c) => sql`${acc} AND ${c}`)
      : undefined;

    // Count
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(datasources)
      .where(whereClause);

    const total = Number(countResult[0]?.count ?? 0);

    // Pagination
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination?.limit ?? 25));
    const offset = (page - 1) * limit;

    // Sort
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sortColumnMap: Record<string, any> = {
      name: datasources.name,
      type: datasources.type,
      status: datasources.status,
      createdAt: datasources.createdAt,
      updatedAt: datasources.updatedAt,
      lastTestedAt: datasources.lastTestedAt,
    };
    const sortColumn = (sort?.field && sortColumnMap[sort.field]) ?? datasources.createdAt;
    const sortDirection = sort?.direction === 'asc' ? sql`ASC` : sql`DESC`;

    const data = await this.db
      .select()
      .from(datasources)
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
   * Find data sources by connector type within an organization.
   */
  async findByType(organizationId: string, type: string): Promise<DataSource[]> {
    return this.db
      .select()
      .from(datasources)
      .where(
        and(
          eq(datasources.organizationId, organizationId),
          sql`${datasources.type} = ${type}`,
        ),
      )
      .orderBy(desc(datasources.createdAt));
  }

  /**
   * Find data sources with error status for an organization.
   */
  async findWithErrors(organizationId: string): Promise<DataSource[]> {
    return this.db
      .select()
      .from(datasources)
      .where(
        and(
          eq(datasources.organizationId, organizationId),
          sql`${datasources.status} = 'error'`,
        ),
      )
      .orderBy(desc(datasources.updatedAt));
  }

  /**
   * Count data sources by status within an organization.
   */
  async countByStatus(organizationId: string): Promise<Record<string, number>> {
    const rows = await this.db
      .select({
        status: datasources.status,
        count: sql<number>`count(*)`,
      })
      .from(datasources)
      .where(eq(datasources.organizationId, organizationId))
      .groupBy(datasources.status);

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.status] = Number(row.count);
    }
    return result;
  }

  // ── Mutations ───────────────────────────────────────────────────

  /**
   * Create a new data source.
   */
  async create(data: NewDataSource): Promise<DataSource> {
    const rows = await this.db
      .insert(datasources)
      .values(data)
      .returning();

    return rows[0]!;
  }

  /**
   * Update an existing data source by ID.
   */
  async update(id: string, data: UpdateDataSourceData): Promise<DataSource | null> {
    const rows = await this.db
      .update(datasources)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(datasources.id, id))
      .returning();

    return rows[0] ?? null;
  }

  /**
   * Save (upsert) a data source.
   */
  async save(data: NewDataSource & { id?: string }): Promise<DataSource> {
    if (data.id) {
      const existing = await this.findById(data.id);
      if (existing) {
        const updated = await this.update(data.id, {
          name: data.name,
          type: data.type,
          config: data.config as Record<string, unknown>,
          status: data.status,
        });
        return updated!;
      }
    }

    return this.create(data);
  }

  /**
   * Delete a data source by ID.
   */
  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(datasources)
      .where(eq(datasources.id, id))
      .returning({ id: datasources.id });

    return rows.length > 0;
  }

  /**
   * Update the connection status of a data source.
   */
  async updateStatus(
    id: string,
    status: 'active' | 'inactive' | 'error' | 'testing',
    lastTestedAt?: Date,
  ): Promise<DataSource | null> {
    const updateData: UpdateDataSourceData = { status };
    if (lastTestedAt) {
      updateData.lastTestedAt = lastTestedAt;
    }
    return this.update(id, updateData);
  }

  /**
   * Mark a data source as successfully tested.
   */
  async markTested(id: string): Promise<DataSource | null> {
    return this.updateStatus(id, 'active', new Date());
  }

  /**
   * Mark a data source as having a connection error.
   */
  async markError(id: string): Promise<DataSource | null> {
    return this.updateStatus(id, 'error', new Date());
  }

  /**
   * Update data source configuration.
   */
  async updateConfig(id: string, config: Record<string, unknown>): Promise<DataSource | null> {
    return this.update(id, { config });
  }

  /**
   * Count all data sources for an organization.
   */
  async countByOrganization(organizationId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(datasources)
      .where(eq(datasources.organizationId, organizationId));

    return Number(result[0]?.count ?? 0);
  }

  /**
   * Count all data sources.
   */
  async count(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(datasources);

    return Number(result[0]?.count ?? 0);
  }
}
