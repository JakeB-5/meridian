import { eq, and, sql, SQL, desc, ilike } from 'drizzle-orm';
import { roles } from '../schema/roles.js';
import type { Role, NewRole } from '../schema/roles.js';
import type { Database } from '../connection.js';
import type { PaginationParams, PaginatedResult } from './base.repository.js';

// ── Types ───────────────────────────────────────────────────────────

export interface RoleFilters {
  /** Filter by organization */
  organizationId?: string;
  /** Filter system vs custom roles */
  isSystem?: boolean;
  /** Partial name match (case-insensitive) */
  search?: string;
}

export interface UpdateRoleData {
  name?: string;
  permissions?: string[];
  isSystem?: boolean;
}

// ── Repository ──────────────────────────────────────────────────────

export class RoleRepository {
  constructor(private readonly db: Database) {}

  // ── Finders ─────────────────────────────────────────────────────

  /**
   * Find a role by primary key.
   */
  async findById(id: string): Promise<Role | null> {
    const rows = await this.db
      .select()
      .from(roles)
      .where(eq(roles.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Find a role by name within an organization.
   */
  async findByName(organizationId: string, name: string): Promise<Role | null> {
    const rows = await this.db
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.organizationId, organizationId),
          eq(roles.name, name),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * List roles for a specific organization.
   */
  async findByOrganization(
    organizationId: string,
    filters?: Omit<RoleFilters, 'organizationId'>,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<Role>> {
    return this.findAll({ ...filters, organizationId }, pagination);
  }

  /**
   * List all system roles for an organization.
   */
  async findSystemRoles(organizationId: string): Promise<Role[]> {
    return this.db
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.organizationId, organizationId),
          eq(roles.isSystem, true),
        ),
      )
      .orderBy(roles.name);
  }

  /**
   * List all custom (non-system) roles for an organization.
   */
  async findCustomRoles(organizationId: string): Promise<Role[]> {
    return this.db
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.organizationId, organizationId),
          eq(roles.isSystem, false),
        ),
      )
      .orderBy(roles.name);
  }

  /**
   * List all roles matching the given filters.
   */
  async findAll(
    filters?: RoleFilters,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<Role>> {
    const conditions: SQL[] = [];

    if (filters?.organizationId) {
      conditions.push(eq(roles.organizationId, filters.organizationId));
    }
    if (filters?.isSystem !== undefined) {
      conditions.push(eq(roles.isSystem, filters.isSystem));
    }
    if (filters?.search) {
      conditions.push(ilike(roles.name, `%${filters.search}%`));
    }

    const whereClause = conditions.length > 0
      ? conditions.reduce((acc, c) => sql`${acc} AND ${c}`)
      : undefined;

    // Count
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(roles)
      .where(whereClause);

    const total = Number(countResult[0]?.count ?? 0);

    // Pagination
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination?.limit ?? 25));
    const offset = (page - 1) * limit;

    const data = await this.db
      .select()
      .from(roles)
      .where(whereClause)
      .orderBy(desc(roles.createdAt))
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
   * Check if a role with the given name exists in an organization.
   */
  async nameExists(
    organizationId: string,
    name: string,
    excludeId?: string,
  ): Promise<boolean> {
    const conditions: SQL[] = [
      eq(roles.organizationId, organizationId),
      eq(roles.name, name),
    ];
    if (excludeId) {
      conditions.push(sql`${roles.id} != ${excludeId}`);
    }

    const rows = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(conditions.reduce((acc, c) => sql`${acc} AND ${c}`))
      .limit(1);

    return rows.length > 0;
  }

  // ── Mutations ───────────────────────────────────────────────────

  /**
   * Create a new role.
   */
  async create(data: NewRole): Promise<Role> {
    const rows = await this.db
      .insert(roles)
      .values(data)
      .returning();

    return rows[0]!;
  }

  /**
   * Update an existing role by ID.
   * System roles can only have their permissions updated.
   */
  async update(id: string, data: UpdateRoleData): Promise<Role | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    // For system roles, only allow permission changes
    const updateData: Record<string, unknown> = {};
    if (existing.isSystem) {
      if (data.permissions !== undefined) {
        updateData['permissions'] = data.permissions;
      }
    } else {
      if (data.name !== undefined) updateData['name'] = data.name;
      if (data.permissions !== undefined) updateData['permissions'] = data.permissions;
      if (data.isSystem !== undefined) updateData['isSystem'] = data.isSystem;
    }

    if (Object.keys(updateData).length === 0) return existing;

    const rows = await this.db
      .update(roles)
      .set(updateData)
      .where(eq(roles.id, id))
      .returning();

    return rows[0] ?? null;
  }

  /**
   * Save (upsert) a role.
   */
  async save(data: NewRole & { id?: string }): Promise<Role> {
    if (data.id) {
      const existing = await this.findById(data.id);
      if (existing) {
        const updated = await this.update(data.id, {
          name: data.name,
          permissions: data.permissions ?? [],
          isSystem: data.isSystem,
        });
        return updated!;
      }
    }

    return this.create(data);
  }

  /**
   * Delete a role by ID.
   * System roles cannot be deleted.
   */
  async delete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing || existing.isSystem) return false;

    const rows = await this.db
      .delete(roles)
      .where(eq(roles.id, id))
      .returning({ id: roles.id });

    return rows.length > 0;
  }

  /**
   * Update the permissions for a role.
   */
  async updatePermissions(id: string, permissions: string[]): Promise<Role | null> {
    return this.update(id, { permissions });
  }

  /**
   * Add permissions to a role (merges with existing).
   */
  async addPermissions(id: string, newPermissions: string[]): Promise<Role | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const currentPermissions = existing.permissions ?? [];
    const merged = [...new Set([...currentPermissions, ...newPermissions])];

    return this.updatePermissions(id, merged);
  }

  /**
   * Remove permissions from a role.
   */
  async removePermissions(
    id: string,
    permissionsToRemove: string[],
  ): Promise<Role | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const currentPermissions = existing.permissions ?? [];
    const filtered = currentPermissions.filter(
      (p) => !permissionsToRemove.includes(p),
    );

    return this.updatePermissions(id, filtered);
  }

  /**
   * Check if a role has a specific permission.
   */
  async hasPermission(id: string, permission: string): Promise<boolean> {
    const role = await this.findById(id);
    if (!role) return false;

    const permissions = role.permissions ?? [];
    return permissions.includes(permission) || permissions.includes('admin');
  }

  /**
   * Count roles for an organization.
   */
  async countByOrganization(organizationId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(roles)
      .where(eq(roles.organizationId, organizationId));

    return Number(result[0]?.count ?? 0);
  }

  /**
   * Count all roles.
   */
  async count(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(roles);

    return Number(result[0]?.count ?? 0);
  }
}
