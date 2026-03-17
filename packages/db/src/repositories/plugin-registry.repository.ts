import { eq, sql, SQL, desc, ilike } from 'drizzle-orm';
import { pluginRegistry } from '../schema/plugin-registry.js';
import type { PluginRegistryEntry, NewPluginRegistryEntry } from '../schema/plugin-registry.js';
import type { Database } from '../connection.js';
import type { PaginationParams, PaginatedResult } from './base.repository.js';

// ── Types ───────────────────────────────────────────────────────────

export interface PluginRegistryFilters {
  /** Filter by plugin type */
  type?: string;
  /** Filter by enabled state */
  isEnabled?: boolean;
  /** Partial name match (case-insensitive) */
  search?: string;
}

export interface UpdatePluginData {
  version?: string;
  config?: Record<string, unknown>;
  isEnabled?: boolean;
}

// ── Repository ──────────────────────────────────────────────────────

export class PluginRegistryRepository {
  constructor(private readonly db: Database) {}

  // ── Finders ─────────────────────────────────────────────────────

  /**
   * Find a plugin by primary key.
   */
  async findById(id: string): Promise<PluginRegistryEntry | null> {
    const rows = await this.db
      .select()
      .from(pluginRegistry)
      .where(eq(pluginRegistry.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Find a plugin by its unique name.
   */
  async findByName(name: string): Promise<PluginRegistryEntry | null> {
    const rows = await this.db
      .select()
      .from(pluginRegistry)
      .where(eq(pluginRegistry.name, name))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * List all enabled plugins (used during startup to load plugins).
   */
  async findEnabled(): Promise<PluginRegistryEntry[]> {
    return this.db
      .select()
      .from(pluginRegistry)
      .where(eq(pluginRegistry.isEnabled, true))
      .orderBy(pluginRegistry.name);
  }

  /**
   * List all plugins of a specific type.
   */
  async findByType(type: string): Promise<PluginRegistryEntry[]> {
    return this.db
      .select()
      .from(pluginRegistry)
      .where(sql`${pluginRegistry.type} = ${type}`)
      .orderBy(pluginRegistry.name);
  }

  /**
   * List all plugins matching the given filters.
   */
  async findAll(
    filters?: PluginRegistryFilters,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<PluginRegistryEntry>> {
    const conditions: SQL[] = [];

    if (filters?.type) {
      conditions.push(sql`${pluginRegistry.type} = ${filters.type}`);
    }
    if (filters?.isEnabled !== undefined) {
      conditions.push(eq(pluginRegistry.isEnabled, filters.isEnabled));
    }
    if (filters?.search) {
      conditions.push(ilike(pluginRegistry.name, `%${filters.search}%`));
    }

    const whereClause = conditions.length > 0
      ? conditions.reduce((acc, c) => sql`${acc} AND ${c}`)
      : undefined;

    // Count
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(pluginRegistry)
      .where(whereClause);

    const total = Number(countResult[0]?.count ?? 0);

    // Pagination
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination?.limit ?? 25));
    const offset = (page - 1) * limit;

    const data = await this.db
      .select()
      .from(pluginRegistry)
      .where(whereClause)
      .orderBy(desc(pluginRegistry.installedAt))
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
   * Register (install) a new plugin.
   */
  async create(data: NewPluginRegistryEntry): Promise<PluginRegistryEntry> {
    const rows = await this.db
      .insert(pluginRegistry)
      .values(data)
      .returning();

    return rows[0]!;
  }

  /**
   * Update an existing plugin's configuration, version, or enabled state.
   */
  async update(id: string, data: UpdatePluginData): Promise<PluginRegistryEntry | null> {
    const rows = await this.db
      .update(pluginRegistry)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(pluginRegistry.id, id))
      .returning();

    return rows[0] ?? null;
  }

  /**
   * Install or update a plugin by name (upsert).
   */
  async installOrUpdate(data: NewPluginRegistryEntry): Promise<PluginRegistryEntry> {
    const rows = await this.db
      .insert(pluginRegistry)
      .values(data)
      .onConflictDoUpdate({
        target: pluginRegistry.name,
        set: {
          version: data.version,
          type: data.type,
          config: data.config ?? {},
          isEnabled: data.isEnabled ?? true,
          updatedAt: new Date(),
        },
      })
      .returning();

    return rows[0]!;
  }

  /**
   * Uninstall (delete) a plugin by ID.
   */
  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(pluginRegistry)
      .where(eq(pluginRegistry.id, id))
      .returning({ id: pluginRegistry.id });

    return rows.length > 0;
  }

  /**
   * Uninstall (delete) a plugin by name.
   */
  async deleteByName(name: string): Promise<boolean> {
    const rows = await this.db
      .delete(pluginRegistry)
      .where(eq(pluginRegistry.name, name))
      .returning({ id: pluginRegistry.id });

    return rows.length > 0;
  }

  /**
   * Enable a plugin.
   */
  async enable(id: string): Promise<PluginRegistryEntry | null> {
    return this.update(id, { isEnabled: true });
  }

  /**
   * Disable a plugin.
   */
  async disable(id: string): Promise<PluginRegistryEntry | null> {
    return this.update(id, { isEnabled: false });
  }

  /**
   * Update plugin configuration (merges with existing config).
   */
  async updateConfig(
    id: string,
    config: Record<string, unknown>,
  ): Promise<PluginRegistryEntry | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const mergedConfig = {
      ...(existing.config as Record<string, unknown>),
      ...config,
    };

    return this.update(id, { config: mergedConfig });
  }

  /**
   * Update plugin version.
   */
  async updateVersion(id: string, version: string): Promise<PluginRegistryEntry | null> {
    return this.update(id, { version });
  }

  // ── Counts ──────────────────────────────────────────────────────

  /**
   * Count all plugins.
   */
  async count(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(pluginRegistry);

    return Number(result[0]?.count ?? 0);
  }

  /**
   * Count plugins by type.
   */
  async countByType(): Promise<Record<string, number>> {
    const rows = await this.db
      .select({
        type: pluginRegistry.type,
        count: sql<number>`count(*)`,
      })
      .from(pluginRegistry)
      .groupBy(pluginRegistry.type);

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.type] = Number(row.count);
    }
    return result;
  }

  /**
   * Count enabled plugins.
   */
  async countEnabled(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(pluginRegistry)
      .where(eq(pluginRegistry.isEnabled, true));

    return Number(result[0]?.count ?? 0);
  }
}
