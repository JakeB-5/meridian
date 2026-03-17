import { eq, and, sql, SQL, desc, ilike } from 'drizzle-orm';
import { questions } from '../schema/questions.js';
import { datasources } from '../schema/datasources.js';
import { users } from '../schema/users.js';
import type { Question, NewQuestion } from '../schema/questions.js';
import type { Database } from '../connection.js';
import type { PaginationParams, PaginatedResult, SortParams } from './base.repository.js';

// ── Types ───────────────────────────────────────────────────────────

export interface QuestionFilters {
  /** Filter by organization */
  organizationId?: string;
  /** Filter by data source */
  dataSourceId?: string;
  /** Filter by question type */
  type?: 'visual' | 'sql';
  /** Filter by creator */
  createdBy?: string;
  /** Whether to include archived questions (default: false) */
  includeArchived?: boolean;
  /** Partial name/description match (case-insensitive) */
  search?: string;
}

export interface UpdateQuestionData {
  name?: string;
  description?: string | null;
  type?: 'visual' | 'sql';
  dataSourceId?: string;
  query?: Record<string, unknown>;
  visualization?: Record<string, unknown>;
  isArchived?: boolean;
}

export interface QuestionWithDetails extends Question {
  creatorName?: string | null;
  creatorEmail?: string | null;
  dataSourceName?: string | null;
  dataSourceType?: string | null;
}

// ── Repository ──────────────────────────────────────────────────────

export class QuestionRepository {
  constructor(private readonly db: Database) {}

  // ── Finders ─────────────────────────────────────────────────────

  /**
   * Find a question by primary key.
   */
  async findById(id: string): Promise<Question | null> {
    const rows = await this.db
      .select()
      .from(questions)
      .where(eq(questions.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Find a question by ID with creator and data source details.
   */
  async findByIdWithDetails(id: string): Promise<QuestionWithDetails | null> {
    const rows = await this.db
      .select({
        id: questions.id,
        name: questions.name,
        description: questions.description,
        type: questions.type,
        dataSourceId: questions.dataSourceId,
        query: questions.query,
        visualization: questions.visualization,
        organizationId: questions.organizationId,
        createdBy: questions.createdBy,
        isArchived: questions.isArchived,
        createdAt: questions.createdAt,
        updatedAt: questions.updatedAt,
        creatorName: users.name,
        creatorEmail: users.email,
        dataSourceName: datasources.name,
        dataSourceType: datasources.type,
      })
      .from(questions)
      .leftJoin(users, eq(questions.createdBy, users.id))
      .leftJoin(datasources, eq(questions.dataSourceId, datasources.id))
      .where(eq(questions.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * List questions for a specific organization.
   */
  async findByOrganization(
    organizationId: string,
    filters?: Omit<QuestionFilters, 'organizationId'>,
    pagination?: PaginationParams,
    sort?: SortParams,
  ): Promise<PaginatedResult<Question>> {
    return this.findAll({ ...filters, organizationId }, pagination, sort);
  }

  /**
   * List questions that target a specific data source.
   */
  async findByDataSource(
    dataSourceId: string,
    filters?: Omit<QuestionFilters, 'dataSourceId'>,
    pagination?: PaginationParams,
    sort?: SortParams,
  ): Promise<PaginatedResult<Question>> {
    return this.findAll({ ...filters, dataSourceId }, pagination, sort);
  }

  /**
   * List all questions matching the given filters.
   */
  async findAll(
    filters?: QuestionFilters,
    pagination?: PaginationParams,
    sort?: SortParams,
  ): Promise<PaginatedResult<Question>> {
    const conditions: SQL[] = [];

    if (filters?.organizationId) {
      conditions.push(eq(questions.organizationId, filters.organizationId));
    }
    if (filters?.dataSourceId) {
      conditions.push(eq(questions.dataSourceId, filters.dataSourceId));
    }
    if (filters?.type) {
      conditions.push(sql`${questions.type} = ${filters.type}`);
    }
    if (filters?.createdBy) {
      conditions.push(eq(questions.createdBy, filters.createdBy));
    }
    if (!filters?.includeArchived) {
      conditions.push(eq(questions.isArchived, false));
    }
    if (filters?.search) {
      const pattern = `%${filters.search}%`;
      conditions.push(
        sql`(${ilike(questions.name, pattern)} OR ${ilike(sql`COALESCE(${questions.description}, '')`, pattern)})`,
      );
    }

    const whereClause = conditions.length > 0
      ? conditions.reduce((acc, c) => sql`${acc} AND ${c}`)
      : undefined;

    // Count
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(questions)
      .where(whereClause);

    const total = Number(countResult[0]?.count ?? 0);

    // Pagination
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination?.limit ?? 25));
    const offset = (page - 1) * limit;

    // Sort
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sortColumnMap: Record<string, any> = {
      name: questions.name,
      type: questions.type,
      createdAt: questions.createdAt,
      updatedAt: questions.updatedAt,
    };
    const sortColumn = (sort?.field && sortColumnMap[sort.field]) ?? questions.updatedAt;
    const sortDirection = sort?.direction === 'asc' ? sql`ASC` : sql`DESC`;

    const data = await this.db
      .select()
      .from(questions)
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
   * Find recently updated questions for an organization.
   */
  async findRecent(organizationId: string, limit: number = 10): Promise<Question[]> {
    return this.db
      .select()
      .from(questions)
      .where(
        and(
          eq(questions.organizationId, organizationId),
          eq(questions.isArchived, false),
        ),
      )
      .orderBy(desc(questions.updatedAt))
      .limit(limit);
  }

  /**
   * Count questions by type within an organization.
   */
  async countByType(organizationId: string): Promise<Record<string, number>> {
    const rows = await this.db
      .select({
        type: questions.type,
        count: sql<number>`count(*)`,
      })
      .from(questions)
      .where(
        and(
          eq(questions.organizationId, organizationId),
          eq(questions.isArchived, false),
        ),
      )
      .groupBy(questions.type);

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.type] = Number(row.count);
    }
    return result;
  }

  // ── Mutations ───────────────────────────────────────────────────

  /**
   * Create a new question.
   */
  async create(data: NewQuestion): Promise<Question> {
    const rows = await this.db
      .insert(questions)
      .values(data)
      .returning();

    return rows[0]!;
  }

  /**
   * Update an existing question by ID.
   */
  async update(id: string, data: UpdateQuestionData): Promise<Question | null> {
    const rows = await this.db
      .update(questions)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(questions.id, id))
      .returning();

    return rows[0] ?? null;
  }

  /**
   * Save (upsert) a question.
   */
  async save(data: NewQuestion & { id?: string }): Promise<Question> {
    if (data.id) {
      const existing = await this.findById(data.id);
      if (existing) {
        const updated = await this.update(data.id, {
          name: data.name,
          description: data.description,
          type: data.type,
          dataSourceId: data.dataSourceId,
          query: data.query as Record<string, unknown>,
          visualization: data.visualization as Record<string, unknown> | undefined,
          isArchived: data.isArchived,
        });
        return updated!;
      }
    }

    return this.create(data);
  }

  /**
   * Delete a question by ID (hard delete).
   */
  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(questions)
      .where(eq(questions.id, id))
      .returning({ id: questions.id });

    return rows.length > 0;
  }

  /**
   * Archive a question (soft delete).
   */
  async archive(id: string): Promise<Question | null> {
    return this.update(id, { isArchived: true });
  }

  /**
   * Unarchive a question.
   */
  async unarchive(id: string): Promise<Question | null> {
    return this.update(id, { isArchived: false });
  }

  /**
   * Update the query payload of a question.
   */
  async updateQuery(id: string, query: Record<string, unknown>): Promise<Question | null> {
    return this.update(id, { query });
  }

  /**
   * Update the visualization config of a question.
   */
  async updateVisualization(
    id: string,
    visualization: Record<string, unknown>,
  ): Promise<Question | null> {
    return this.update(id, { visualization });
  }

  /**
   * Move a question to a different data source.
   */
  async changeDataSource(id: string, dataSourceId: string): Promise<Question | null> {
    return this.update(id, { dataSourceId });
  }

  /**
   * Count questions for an organization (excluding archived).
   */
  async countByOrganization(organizationId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(questions)
      .where(
        and(
          eq(questions.organizationId, organizationId),
          eq(questions.isArchived, false),
        ),
      );

    return Number(result[0]?.count ?? 0);
  }

  /**
   * Count questions targeting a specific data source.
   */
  async countByDataSource(dataSourceId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(questions)
      .where(eq(questions.dataSourceId, dataSourceId));

    return Number(result[0]?.count ?? 0);
  }

  /**
   * Count all questions.
   */
  async count(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(questions);

    return Number(result[0]?.count ?? 0);
  }
}
