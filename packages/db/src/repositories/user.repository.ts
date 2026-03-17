import { eq, and, like, or, sql, SQL, desc, ilike } from 'drizzle-orm';
import { users } from '../schema/users.js';
import { roles } from '../schema/roles.js';
import { organizations } from '../schema/organizations.js';
import type { User, NewUser } from '../schema/users.js';
import type { Database } from '../connection.js';
import type { PaginationParams, PaginatedResult, SortParams } from './base.repository.js';

// ── Types ───────────────────────────────────────────────────────────

export interface UserFilters {
  /** Filter by organization */
  organizationId?: string;
  /** Filter by role */
  roleId?: string;
  /** Filter by active status */
  isActive?: boolean;
  /** Partial match on name or email (case-insensitive) */
  search?: string;
}

export interface UpdateUserData {
  name?: string;
  email?: string;
  passwordHash?: string;
  avatarUrl?: string | null;
  organizationId?: string;
  roleId?: string;
  isActive?: boolean;
}

export interface UserWithRole extends User {
  roleName?: string;
  rolePermissions?: string[];
}

// ── Repository ──────────────────────────────────────────────────────

export class UserRepository {
  constructor(private readonly db: Database) {}

  // ── Finders ─────────────────────────────────────────────────────

  /**
   * Find a user by primary key.
   */
  async findById(id: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Find a user by primary key, including role details.
   */
  async findByIdWithRole(id: string): Promise<UserWithRole | null> {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        passwordHash: users.passwordHash,
        avatarUrl: users.avatarUrl,
        organizationId: users.organizationId,
        roleId: users.roleId,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        roleName: roles.name,
        rolePermissions: roles.permissions,
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.id, id))
      .limit(1);

    return (rows[0] ?? null) as UserWithRole | null;
  }

  /**
   * Find a user by their email address (case-insensitive).
   * Used for authentication flows.
   */
  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Find a user by email, including role details.
   * Useful for authentication + authorization in a single query.
   */
  async findByEmailWithRole(email: string): Promise<UserWithRole | null> {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        passwordHash: users.passwordHash,
        avatarUrl: users.avatarUrl,
        organizationId: users.organizationId,
        roleId: users.roleId,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        roleName: roles.name,
        rolePermissions: roles.permissions,
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    return (rows[0] ?? null) as UserWithRole | null;
  }

  /**
   * List all users within an organization, with optional filters and pagination.
   */
  async findByOrganization(
    organizationId: string,
    filters?: Omit<UserFilters, 'organizationId'>,
    pagination?: PaginationParams,
    sort?: SortParams,
  ): Promise<PaginatedResult<User>> {
    return this.findAll({ ...filters, organizationId }, pagination, sort);
  }

  /**
   * List all users matching the given filters.
   */
  async findAll(
    filters?: UserFilters,
    pagination?: PaginationParams,
    sort?: SortParams,
  ): Promise<PaginatedResult<User>> {
    const conditions: SQL[] = [];

    if (filters?.organizationId) {
      conditions.push(eq(users.organizationId, filters.organizationId));
    }
    if (filters?.roleId) {
      conditions.push(eq(users.roleId, filters.roleId));
    }
    if (filters?.isActive !== undefined) {
      conditions.push(eq(users.isActive, filters.isActive));
    }
    if (filters?.search) {
      const pattern = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(users.name, pattern),
          ilike(users.email, pattern),
        )!,
      );
    }

    const whereClause = conditions.length > 0
      ? conditions.reduce((acc, c) => sql`${acc} AND ${c}`)
      : undefined;

    // Count
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(whereClause);

    const total = Number(countResult[0]?.count ?? 0);

    // Pagination
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination?.limit ?? 25));
    const offset = (page - 1) * limit;

    // Sort
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sortColumnMap: Record<string, any> = {
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      lastLoginAt: users.lastLoginAt,
    };
    const sortColumn = (sort?.field && sortColumnMap[sort.field]) ?? users.createdAt;
    const sortDirection = sort?.direction === 'asc' ? sql`ASC` : sql`DESC`;

    const data = await this.db
      .select()
      .from(users)
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
   * Check if an email is already registered.
   */
  async emailExists(email: string, excludeUserId?: string): Promise<boolean> {
    const conditions: SQL[] = [eq(users.email, email.toLowerCase())];
    if (excludeUserId) {
      conditions.push(sql`${users.id} != ${excludeUserId}`);
    }

    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(conditions.reduce((acc, c) => sql`${acc} AND ${c}`))
      .limit(1);

    return rows.length > 0;
  }

  /**
   * Count users in an organization, optionally filtered by active status.
   */
  async countByOrganization(organizationId: string, isActive?: boolean): Promise<number> {
    const conditions: SQL[] = [eq(users.organizationId, organizationId)];
    if (isActive !== undefined) {
      conditions.push(eq(users.isActive, isActive));
    }

    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(conditions.reduce((acc, c) => sql`${acc} AND ${c}`));

    return Number(result[0]?.count ?? 0);
  }

  // ── Mutations ───────────────────────────────────────────────────

  /**
   * Create a new user.
   */
  async create(data: NewUser): Promise<User> {
    const rows = await this.db
      .insert(users)
      .values({
        ...data,
        email: data.email.toLowerCase(),
      })
      .returning();

    return rows[0]!;
  }

  /**
   * Update an existing user by ID.
   */
  async update(id: string, data: UpdateUserData): Promise<User | null> {
    const updatePayload: Record<string, unknown> = {
      ...data,
      updatedAt: new Date(),
    };

    // Normalize email to lowercase if provided
    if (data.email) {
      updatePayload['email'] = data.email.toLowerCase();
    }

    const rows = await this.db
      .update(users)
      .set(updatePayload)
      .where(eq(users.id, id))
      .returning();

    return rows[0] ?? null;
  }

  /**
   * Save (upsert) a user.
   */
  async save(data: NewUser & { id?: string }): Promise<User> {
    if (data.id) {
      const existing = await this.findById(data.id);
      if (existing) {
        const updated = await this.update(data.id, {
          name: data.name,
          email: data.email,
          passwordHash: data.passwordHash,
          avatarUrl: data.avatarUrl,
          organizationId: data.organizationId,
          roleId: data.roleId,
          isActive: data.isActive,
        });
        return updated!;
      }
    }

    return this.create(data);
  }

  /**
   * Delete a user by ID. Returns true if deleted.
   */
  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(users)
      .where(eq(users.id, id))
      .returning({ id: users.id });

    return rows.length > 0;
  }

  /**
   * Record a successful login by updating lastLoginAt.
   */
  async updateLastLogin(id: string): Promise<User | null> {
    const rows = await this.db
      .update(users)
      .set({
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    return rows[0] ?? null;
  }

  /**
   * Deactivate a user (soft delete).
   */
  async deactivate(id: string): Promise<User | null> {
    return this.update(id, { isActive: false });
  }

  /**
   * Reactivate a previously deactivated user.
   */
  async activate(id: string): Promise<User | null> {
    return this.update(id, { isActive: true });
  }

  /**
   * Change a user's role.
   */
  async changeRole(id: string, roleId: string): Promise<User | null> {
    return this.update(id, { roleId });
  }

  /**
   * Update a user's password hash.
   */
  async updatePassword(id: string, passwordHash: string): Promise<User | null> {
    return this.update(id, { passwordHash });
  }

  /**
   * Find users who have never logged in within an organization.
   */
  async findNeverLoggedIn(organizationId: string): Promise<User[]> {
    return this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.organizationId, organizationId),
          sql`${users.lastLoginAt} IS NULL`,
        ),
      )
      .orderBy(desc(users.createdAt));
  }

  /**
   * Count all users.
   */
  async count(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(users);

    return Number(result[0]?.count ?? 0);
  }
}
