import { eq, and, sql, SQL, desc, gte, lte, between } from 'drizzle-orm';
import { auditLogs } from '../schema/audit-logs.js';
import { users } from '../schema/users.js';
import type { AuditLog, NewAuditLog } from '../schema/audit-logs.js';
import type { Database } from '../connection.js';
import type { PaginationParams, PaginatedResult, SortParams } from './base.repository.js';

// ── Types ───────────────────────────────────────────────────────────

export interface AuditLogFilters {
  /** Filter by user who performed the action */
  userId?: string;
  /** Filter by action verb (e.g. "datasource.created") */
  action?: string;
  /** Filter by entity type (e.g. "user", "dashboard") */
  entityType?: string;
  /** Filter by specific entity ID */
  entityId?: string;
  /** Filter by IP address */
  ipAddress?: string;
  /** Start of date range (inclusive) */
  fromDate?: Date;
  /** End of date range (inclusive) */
  toDate?: Date;
}

export interface AuditLogWithUser extends AuditLog {
  userName?: string | null;
  userEmail?: string | null;
}

export interface AuditLogCreateData {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

// ── Repository ──────────────────────────────────────────────────────

/**
 * Repository for the audit_logs table.
 * Audit logs are append-only — no update or delete operations are exposed.
 */
export class AuditLogRepository {
  constructor(private readonly db: Database) {}

  // ── Finders ─────────────────────────────────────────────────────

  /**
   * Find an audit log entry by primary key.
   */
  async findById(id: string): Promise<AuditLog | null> {
    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Find an audit log entry by ID, including user details.
   */
  async findByIdWithUser(id: string): Promise<AuditLogWithUser | null> {
    const rows = await this.db
      .select({
        id: auditLogs.id,
        userId: auditLogs.userId,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(eq(auditLogs.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Find all audit log entries for a specific entity.
   * Ordered by most recent first.
   */
  async findByEntity(
    entityType: string,
    entityId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<AuditLog>> {
    return this.findAll({ entityType, entityId }, pagination);
  }

  /**
   * Find all audit log entries for a specific user.
   * Ordered by most recent first.
   */
  async findByUser(
    userId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<AuditLog>> {
    return this.findAll({ userId }, pagination);
  }

  /**
   * Find all audit log entries within a date range.
   */
  async findByDateRange(
    fromDate: Date,
    toDate: Date,
    filters?: Omit<AuditLogFilters, 'fromDate' | 'toDate'>,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<AuditLog>> {
    return this.findAll({ ...filters, fromDate, toDate }, pagination);
  }

  /**
   * Find audit log entries by action type.
   */
  async findByAction(
    action: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<AuditLog>> {
    return this.findAll({ action }, pagination);
  }

  /**
   * List all audit log entries matching the given filters.
   */
  async findAll(
    filters?: AuditLogFilters,
    pagination?: PaginationParams,
    sort?: SortParams,
  ): Promise<PaginatedResult<AuditLog>> {
    const conditions: SQL[] = [];

    if (filters?.userId) {
      conditions.push(eq(auditLogs.userId, filters.userId));
    }
    if (filters?.action) {
      conditions.push(eq(auditLogs.action, filters.action));
    }
    if (filters?.entityType) {
      conditions.push(eq(auditLogs.entityType, filters.entityType));
    }
    if (filters?.entityId) {
      conditions.push(eq(auditLogs.entityId, filters.entityId));
    }
    if (filters?.ipAddress) {
      conditions.push(eq(auditLogs.ipAddress, filters.ipAddress));
    }
    if (filters?.fromDate && filters?.toDate) {
      conditions.push(
        between(auditLogs.createdAt, filters.fromDate, filters.toDate),
      );
    } else if (filters?.fromDate) {
      conditions.push(gte(auditLogs.createdAt, filters.fromDate));
    } else if (filters?.toDate) {
      conditions.push(lte(auditLogs.createdAt, filters.toDate));
    }

    const whereClause = conditions.length > 0
      ? conditions.reduce((acc, c) => sql`${acc} AND ${c}`)
      : undefined;

    // Count
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(whereClause);

    const total = Number(countResult[0]?.count ?? 0);

    // Pagination
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination?.limit ?? 25));
    const offset = (page - 1) * limit;

    // Sort (audit logs are almost always sorted by createdAt desc)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sortColumnMap: Record<string, any> = {
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      createdAt: auditLogs.createdAt,
    };
    const sortColumn = (sort?.field && sortColumnMap[sort.field]) ?? auditLogs.createdAt;
    const sortDirection = sort?.direction === 'asc' ? sql`ASC` : sql`DESC`;

    const data = await this.db
      .select()
      .from(auditLogs)
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
   * List audit log entries with user details.
   */
  async findAllWithUser(
    filters?: AuditLogFilters,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<AuditLogWithUser>> {
    const conditions: SQL[] = [];

    if (filters?.userId) {
      conditions.push(eq(auditLogs.userId, filters.userId));
    }
    if (filters?.action) {
      conditions.push(eq(auditLogs.action, filters.action));
    }
    if (filters?.entityType) {
      conditions.push(eq(auditLogs.entityType, filters.entityType));
    }
    if (filters?.entityId) {
      conditions.push(eq(auditLogs.entityId, filters.entityId));
    }
    if (filters?.ipAddress) {
      conditions.push(eq(auditLogs.ipAddress, filters.ipAddress));
    }
    if (filters?.fromDate && filters?.toDate) {
      conditions.push(
        between(auditLogs.createdAt, filters.fromDate, filters.toDate),
      );
    } else if (filters?.fromDate) {
      conditions.push(gte(auditLogs.createdAt, filters.fromDate));
    } else if (filters?.toDate) {
      conditions.push(lte(auditLogs.createdAt, filters.toDate));
    }

    const whereClause = conditions.length > 0
      ? conditions.reduce((acc, c) => sql`${acc} AND ${c}`)
      : undefined;

    // Count
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(whereClause);

    const total = Number(countResult[0]?.count ?? 0);

    // Pagination
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination?.limit ?? 25));
    const offset = (page - 1) * limit;

    const data = await this.db
      .select({
        id: auditLogs.id,
        userId: auditLogs.userId,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt))
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

  // ── Mutations ───────────────────────────────────────────────────

  /**
   * Create a new audit log entry.
   */
  async create(data: AuditLogCreateData): Promise<AuditLog> {
    const rows = await this.db
      .insert(auditLogs)
      .values({
        userId: data.userId ?? undefined,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        metadata: data.metadata ?? {},
        ipAddress: data.ipAddress ?? undefined,
      })
      .returning();

    return rows[0]!;
  }

  /**
   * Create multiple audit log entries in a single batch.
   */
  async createMany(entries: AuditLogCreateData[]): Promise<AuditLog[]> {
    if (entries.length === 0) return [];

    return this.db
      .insert(auditLogs)
      .values(
        entries.map((entry) => ({
          userId: entry.userId ?? undefined,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          metadata: entry.metadata ?? {},
          ipAddress: entry.ipAddress ?? undefined,
        })),
      )
      .returning();
  }

  // ── Convenience Creators ────────────────────────────────────────

  /**
   * Log an entity creation event.
   */
  async logCreate(
    userId: string,
    entityType: string,
    entityId: string,
    metadata?: Record<string, unknown>,
    ipAddress?: string,
  ): Promise<AuditLog> {
    return this.create({
      userId,
      action: `${entityType}.created`,
      entityType,
      entityId,
      metadata,
      ipAddress,
    });
  }

  /**
   * Log an entity update event.
   */
  async logUpdate(
    userId: string,
    entityType: string,
    entityId: string,
    changes: Record<string, unknown>,
    ipAddress?: string,
  ): Promise<AuditLog> {
    return this.create({
      userId,
      action: `${entityType}.updated`,
      entityType,
      entityId,
      metadata: { changes },
      ipAddress,
    });
  }

  /**
   * Log an entity deletion event.
   */
  async logDelete(
    userId: string,
    entityType: string,
    entityId: string,
    metadata?: Record<string, unknown>,
    ipAddress?: string,
  ): Promise<AuditLog> {
    return this.create({
      userId,
      action: `${entityType}.deleted`,
      entityType,
      entityId,
      metadata,
      ipAddress,
    });
  }

  /**
   * Log a user login event.
   */
  async logLogin(userId: string, ipAddress?: string): Promise<AuditLog> {
    return this.create({
      userId,
      action: 'user.login',
      entityType: 'user',
      entityId: userId,
      ipAddress,
    });
  }

  /**
   * Log a failed login attempt.
   */
  async logFailedLogin(
    email: string,
    ipAddress?: string,
    reason?: string,
  ): Promise<AuditLog> {
    return this.create({
      action: 'user.login_failed',
      entityType: 'user',
      entityId: email,
      metadata: { reason: reason ?? 'Invalid credentials' },
      ipAddress,
    });
  }

  // ── Cleanup ─────────────────────────────────────────────────────

  /**
   * Delete audit log entries older than the specified date.
   * Used for data retention compliance.
   */
  async deleteOlderThan(date: Date): Promise<number> {
    const rows = await this.db
      .delete(auditLogs)
      .where(lte(auditLogs.createdAt, date))
      .returning({ id: auditLogs.id });

    return rows.length;
  }

  // ── Counts ──────────────────────────────────────────────────────

  /**
   * Count audit log entries matching optional filters.
   */
  async count(filters?: AuditLogFilters): Promise<number> {
    const conditions: SQL[] = [];

    if (filters?.userId) {
      conditions.push(eq(auditLogs.userId, filters.userId));
    }
    if (filters?.action) {
      conditions.push(eq(auditLogs.action, filters.action));
    }
    if (filters?.entityType) {
      conditions.push(eq(auditLogs.entityType, filters.entityType));
    }
    if (filters?.fromDate) {
      conditions.push(gte(auditLogs.createdAt, filters.fromDate));
    }
    if (filters?.toDate) {
      conditions.push(lte(auditLogs.createdAt, filters.toDate));
    }

    const whereClause = conditions.length > 0
      ? conditions.reduce((acc, c) => sql`${acc} AND ${c}`)
      : undefined;

    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(whereClause);

    return Number(result[0]?.count ?? 0);
  }

  /**
   * Get a summary of actions grouped by action type.
   */
  async getActionSummary(
    fromDate?: Date,
    toDate?: Date,
  ): Promise<Array<{ action: string; count: number }>> {
    const conditions: SQL[] = [];
    if (fromDate) {
      conditions.push(gte(auditLogs.createdAt, fromDate));
    }
    if (toDate) {
      conditions.push(lte(auditLogs.createdAt, toDate));
    }

    const whereClause = conditions.length > 0
      ? conditions.reduce((acc, c) => sql`${acc} AND ${c}`)
      : undefined;

    const rows = await this.db
      .select({
        action: auditLogs.action,
        count: sql<number>`count(*)`,
      })
      .from(auditLogs)
      .where(whereClause)
      .groupBy(auditLogs.action)
      .orderBy(sql`count(*) DESC`);

    return rows.map((row) => ({
      action: row.action,
      count: Number(row.count),
    }));
  }
}
