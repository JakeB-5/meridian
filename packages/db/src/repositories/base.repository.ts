import { eq, and, SQL, desc, asc, count } from 'drizzle-orm';
import type { PgTable, PgColumn } from 'drizzle-orm/pg-core';
import type { Database } from '../connection.js';

// ── Pagination ──────────────────────────────────────────────────────

export interface PaginationParams {
  /** Page number (1-based, default: 1) */
  page?: number;
  /** Items per page (default: 25, max: 100) */
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface SortParams {
  field: string;
  direction: 'asc' | 'desc';
}

// ── Constants ───────────────────────────────────────────────────────

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

// ── Base Repository ─────────────────────────────────────────────────

/**
 * Abstract base class providing common CRUD operations for Drizzle tables.
 *
 * Subclasses specify the table and can add domain-specific query methods.
 * All methods accept an optional `tx` parameter to participate in transactions.
 *
 * @typeParam TTable - Drizzle pgTable definition
 * @typeParam TSelect - Row type returned by select queries
 * @typeParam TInsert - Row type accepted by insert operations
 */
export abstract class BaseRepository<
  TTable extends PgTable,
  TSelect extends Record<string, unknown>,
  TInsert extends Record<string, unknown>,
> {
  constructor(
    protected readonly db: Database,
    protected readonly table: TTable,
  ) {}

  // ── Helpers ─────────────────────────────────────────────────────

  /**
   * Normalize pagination params to safe, bounded values.
   */
  protected normalizePagination(params?: PaginationParams): {
    page: number;
    limit: number;
    offset: number;
  } {
    const page = Math.max(DEFAULT_PAGE, params?.page ?? DEFAULT_PAGE);
    const limit = Math.min(MAX_LIMIT, Math.max(1, params?.limit ?? DEFAULT_LIMIT));
    const offset = (page - 1) * limit;
    return { page, limit, offset };
  }

  /**
   * Build a PaginatedResult from data, total count, and pagination params.
   */
  protected buildPaginatedResult<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
  ): PaginatedResult<T> {
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
   * Create a sort SQL expression from params and a column map.
   */
  protected buildSort(
    params: SortParams | undefined,
    columnMap: Record<string, PgColumn>,
    defaultColumn: PgColumn,
    defaultDirection: 'asc' | 'desc' = 'desc',
  ): SQL {
    if (!params) {
      return defaultDirection === 'desc' ? desc(defaultColumn) : asc(defaultColumn);
    }
    const column = columnMap[params.field] ?? defaultColumn;
    return params.direction === 'desc' ? desc(column) : asc(column);
  }

  // ── Generic CRUD ────────────────────────────────────────────────

  /**
   * Find a single row by its primary key (assumes column named 'id').
   */
  async findById(id: string): Promise<TSelect | null> {
    const idColumn = (this.table as unknown as Record<string, PgColumn>)['id'];
    if (!idColumn) {
      throw new Error('Table does not have an "id" column');
    }

    const rows = await (this.db as unknown as {
      select: () => {
        from: (t: PgTable) => {
          where: (w: SQL) => {
            limit: (n: number) => Promise<TSelect[]>;
          };
        };
      };
    })
      .select()
      .from(this.table)
      .where(eq(idColumn, id))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Count rows matching an optional where clause.
   */
  async count(where?: SQL): Promise<number> {
    const query = (this.db as unknown as {
      select: (sel: Record<string, unknown>) => {
        from: (t: PgTable) => {
          where: (w: SQL) => Promise<{ count: number }[]>;
        } & Promise<{ count: number }[]>;
      };
    })
      .select({ count: count() })
      .from(this.table);

    const rows = where
      ? await (query as { where: (w: SQL) => Promise<{ count: number }[]> }).where(where)
      : await (query as unknown as Promise<{ count: number }[]>);

    return Number(rows[0]?.count ?? 0);
  }

  /**
   * Check if a row with the given ID exists.
   */
  async exists(id: string): Promise<boolean> {
    const row = await this.findById(id);
    return row !== null;
  }

  /**
   * Delete a row by its primary key. Returns true if a row was deleted.
   */
  async deleteById(id: string): Promise<boolean> {
    const idColumn = (this.table as unknown as Record<string, PgColumn>)['id'];
    if (!idColumn) {
      throw new Error('Table does not have an "id" column');
    }

    const result = await (this.db as unknown as {
      delete: (t: PgTable) => {
        where: (w: SQL) => {
          returning: () => Promise<TSelect[]>;
        };
      };
    })
      .delete(this.table)
      .where(eq(idColumn, id))
      .returning();

    return result.length > 0;
  }

  /**
   * Build a compound AND clause from an array of conditions.
   * Filters out undefined entries.
   */
  protected andConditions(...conditions: (SQL | undefined)[]): SQL | undefined {
    const valid = conditions.filter((c): c is SQL => c !== undefined);
    if (valid.length === 0) return undefined;
    if (valid.length === 1) return valid[0];
    return and(...valid);
  }
}
