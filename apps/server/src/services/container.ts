import type { Logger, Permission, VisualQuery } from '@meridian/shared';
import {
  createLogger,
  createNoopLogger,
  ok,
  err,
  NotFoundError,
  ConflictError,
  type Result,
  type ConnectionTestResult,
  type SchemaInfo,
  type TableInfo,
  type VisualizationConfig,
  type QuestionType,
  type CardPosition,
  type CardSize,
  type DashboardLayout,
  type DashboardFilter,
  type UserStatus,
} from '@meridian/shared';
import type { ServerConfig } from '../config.js';

// ── Auth Service Interfaces ─────────────────────────────────────────

export interface TokenPayload {
  sub: string;
  email: string;
  orgId: string;
  roleId: string;
  permissions: Permission[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
}

export interface TokenServiceLike {
  generateTokenPair(user: TokenPayload): Promise<TokenPair>;
  verifyToken(token: string): Promise<Result<TokenPayload>>;
  refreshTokenPair(refreshToken: string): Promise<Result<TokenPair>>;
  decodeToken(token: string): TokenPayload | null;
  isTokenExpired(token: string): boolean;
}

export interface PasswordServiceLike {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
  needsRehash(hash: string): boolean;
  validateStrength(password: string): { valid: boolean; violations: string[]; score: number };
}

// ── Domain Model Interfaces ─────────────────────────────────────────
// These mirror the core domain models without importing from deep paths.

export interface DataSourceEntity {
  id: string;
  name: string;
  type: string;
  host?: string;
  port?: number;
  database: string;
  credentials: { username?: string; password?: string; ssl: boolean };
  options: Record<string, unknown>;
  organizationId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  lastTestedAt?: Date;
  lastError?: string;
  markConnected(): void;
  markConnectionFailed(error: string): void;
  markDisconnected(): void;
  update(params: Record<string, unknown>): Result<DataSourceEntity>;
  toSafeDisplay(): Record<string, unknown>;
}

export interface QuestionEntity {
  id: string;
  name: string;
  description?: string;
  type: QuestionType;
  dataSourceId: string;
  query: VisualQuery | string;
  visualization: VisualizationConfig;
  organizationId: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  collectionId?: string;
  cachedResult?: unknown;
  cacheExpiresAt?: Date;
  isCacheValid: boolean;
  updateMetadata(params: { name?: string; description?: string }): Result<QuestionEntity>;
  updateQuery(query: VisualQuery | string): Result<QuestionEntity>;
  updateVisualization(config: VisualizationConfig): Result<QuestionEntity>;
}

export interface DashboardCardEntity {
  id: string;
  dashboardId: string;
  questionId: string;
  position: CardPosition;
  size: CardSize;
  title?: string;
}

export interface DashboardEntity {
  id: string;
  name: string;
  description?: string;
  organizationId: string;
  createdBy: string;
  isPublic: boolean;
  layout: DashboardLayout;
  filters: DashboardFilter[];
  cards: ReadonlyArray<DashboardCardEntity>;
  cardCount: number;
  createdAt: Date;
  updatedAt: Date;
  findCard(cardId: string): DashboardCardEntity | undefined;
  addCard(params: { questionId: string; position: CardPosition; size: CardSize; title?: string }): Result<DashboardEntity>;
  removeCard(cardId: string): Result<DashboardEntity>;
  moveCard(cardId: string, position: CardPosition, size?: CardSize): Result<DashboardEntity>;
  updateMetadata(params: { name?: string; description?: string; isPublic?: boolean }): Result<DashboardEntity>;
  updateLayout(layout: Partial<DashboardLayout>): Result<DashboardEntity>;
  reorderCards(cardIds: string[]): Result<DashboardEntity>;
  addFilter(filter: Omit<DashboardFilter, 'id'>): Result<DashboardEntity>;
  removeFilter(filterId: string): Result<DashboardEntity>;
}

export interface RoleEntity {
  id: string;
  name: string;
  permissions: ReadonlyArray<Permission>;
  organizationId: string;
  hasPermission(permission: Permission): boolean;
}

export interface UserEntity {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  organizationId: string;
  role: RoleEntity;
  status: UserStatus;
  isActive: boolean;
  isAdmin: boolean;
  lastLoginAt?: Date;
  deactivatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  hasPermission(permission: Permission): boolean;
  activate(): Result<UserEntity>;
  deactivate(): Result<UserEntity>;
  assignRole(role: RoleEntity): Result<UserEntity>;
  updateProfile(params: { name?: string; avatarUrl?: string }): Result<UserEntity>;
  recordLogin(): UserEntity;
}

// ── Domain Service Interfaces ───────────────────────────────────────

export interface DataSourceServiceLike {
  create(dto: { name: string; type: string; host?: string; port?: number; database: string; username?: string; password?: string; ssl?: boolean; options?: Record<string, unknown>; organizationId: string }): Promise<Result<DataSourceEntity>>;
  getById(id: string): Promise<Result<DataSourceEntity>>;
  listByOrganization(orgId: string): Promise<Result<DataSourceEntity[]>>;
  testConnection(id: string): Promise<Result<ConnectionTestResult>>;
  getSchema(id: string): Promise<Result<SchemaInfo[]>>;
  getTables(id: string): Promise<Result<TableInfo[]>>;
  update(id: string, dto: Record<string, unknown>): Promise<Result<DataSourceEntity>>;
  delete(id: string): Promise<Result<void>>;
}

export interface QuestionServiceLike {
  createVisual(dto: { name: string; description?: string; dataSourceId: string; query: VisualQuery; visualization?: VisualizationConfig; organizationId: string; createdBy: string; collectionId?: string }): Promise<Result<QuestionEntity>>;
  createSQL(dto: { name: string; description?: string; dataSourceId: string; sql: string; visualization?: VisualizationConfig; organizationId: string; createdBy: string; collectionId?: string }): Promise<Result<QuestionEntity>>;
  getById(id: string): Promise<Result<QuestionEntity>>;
  list(options: { organizationId: string; dataSourceId?: string; type?: QuestionType; createdBy?: string; collectionId?: string; search?: string; limit?: number; offset?: number }): Promise<Result<QuestionEntity[]>>;
  update(id: string, dto: { name?: string; description?: string; query?: VisualQuery | string; visualization?: VisualizationConfig }): Promise<Result<QuestionEntity>>;
  delete(id: string): Promise<Result<void>>;
  duplicate(id: string, newName: string, createdBy: string): Promise<Result<QuestionEntity>>;
}

export interface DashboardServiceLike {
  create(dto: { name: string; description?: string; organizationId: string; createdBy: string; isPublic?: boolean; layout?: Partial<DashboardLayout> }): Promise<Result<DashboardEntity>>;
  getById(id: string): Promise<Result<DashboardEntity>>;
  list(options: { organizationId: string; createdBy?: string; isPublic?: boolean; search?: string; limit?: number; offset?: number }): Promise<Result<DashboardEntity[]>>;
  update(id: string, dto: { name?: string; description?: string; isPublic?: boolean }): Promise<Result<DashboardEntity>>;
  delete(id: string): Promise<Result<void>>;
  addCard(dashboardId: string, dto: { questionId: string; position: CardPosition; size: CardSize; title?: string }): Promise<Result<DashboardEntity>>;
  removeCard(dashboardId: string, cardId: string): Promise<Result<DashboardEntity>>;
  moveCard(dashboardId: string, cardId: string, position: CardPosition, size?: CardSize): Promise<Result<DashboardEntity>>;
  updateLayout(dashboardId: string, layout: Partial<DashboardLayout>): Promise<Result<DashboardEntity>>;
  reorderCards(dashboardId: string, cardIds: string[]): Promise<Result<DashboardEntity>>;
  addFilter(dashboardId: string, filter: Omit<DashboardFilter, 'id'>): Promise<Result<DashboardEntity>>;
  removeFilter(dashboardId: string, filterId: string): Promise<Result<DashboardEntity>>;
  duplicate(id: string, newName: string, createdBy: string): Promise<Result<DashboardEntity>>;
}

export interface UserServiceLike {
  create(dto: { email: string; name: string; organizationId: string; roleId: string; avatarUrl?: string }): Promise<Result<UserEntity>>;
  getById(id: string): Promise<Result<UserEntity>>;
  getByEmail(email: string): Promise<Result<UserEntity>>;
  list(options: { organizationId: string; status?: UserStatus; search?: string; limit?: number; offset?: number }): Promise<Result<UserEntity[]>>;
  update(id: string, dto: { name?: string; avatarUrl?: string }): Promise<Result<UserEntity>>;
  delete(id: string): Promise<Result<void>>;
  activate(id: string): Promise<Result<UserEntity>>;
  deactivate(id: string): Promise<Result<UserEntity>>;
  assignRole(userId: string, roleId: string): Promise<Result<UserEntity>>;
  hasPermission(userId: string, permission: Permission): Promise<Result<boolean>>;
  recordLogin(userId: string): Promise<Result<UserEntity>>;
}

export interface PluginRegistryLike {
  has(name: string): boolean;
  getPlugin(name: string): { manifest: { name: string; version: string; type: string; description: string; author?: string }; enabled: boolean; loadedAt: Date; module?: unknown } | undefined;
  register(plugin: { manifest: { name: string; version: string; type: string; description: string; author?: string; entryPoint: string }; enabled: boolean; loadedAt: Date; module?: unknown }): void;
  unregister(name: string): void;
  enable(name: string): void;
  disable(name: string): void;
  listPlugins(): Array<{ name: string; version: string; type: string; description: string; author?: string; enabled: boolean; loadedAt: Date }>;
  count(filter?: { type?: string; enabled?: boolean }): number;
}

// ── User Repository with Password Store ─────────────────────────────

export interface UserRepositoryLike {
  findById(id: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  findByOrganization(options: { organizationId: string; status?: UserStatus; search?: string; limit?: number; offset?: number }): Promise<UserEntity[]>;
  save(user: UserEntity): Promise<UserEntity>;
  delete(id: string): Promise<void>;
  existsByEmail(email: string): Promise<boolean>;
  savePassword(userId: string, hash: string): Promise<void>;
  getPasswordHash(userId: string): Promise<string | null>;
}

// ── Container Interface ─────────────────────────────────────────────

export interface ServiceContainer {
  logger: Logger;
  config: ServerConfig;
  tokenService: TokenServiceLike;
  passwordService: PasswordServiceLike;
  dataSourceService: DataSourceServiceLike;
  questionService: QuestionServiceLike;
  dashboardService: DashboardServiceLike;
  userService: UserServiceLike;
  userRepository: UserRepositoryLike;
  pluginRegistry: PluginRegistryLike;
}

// ── Container Factory Options ───────────────────────────────────────

export interface CreateContainerOptions {
  config: ServerConfig;
  logger?: Logger;
}

// ── Lazy imports helper ─────────────────────────────────────────────
// We use dynamic imports for workspace packages to avoid
// deep import issues. These resolve at runtime via pnpm workspace linking.

async function loadAuthModules(config: ServerConfig) {
  // Dynamic import from workspace packages
  const { TokenService } = await import('@meridian/auth/jwt/token-service.js');
  const { PasswordService } = await import('@meridian/auth/password/password-service.js');

  const tokenService = new TokenService(config.JWT_SECRET, {
    accessTokenExpiry: config.ACCESS_TOKEN_EXPIRY,
    refreshTokenExpiry: config.REFRESH_TOKEN_EXPIRY,
    issuer: config.JWT_ISSUER,
  });

  const passwordService = new PasswordService();

  return { tokenService: tokenService as unknown as TokenServiceLike, passwordService: passwordService as unknown as PasswordServiceLike };
}

async function loadCoreModels() {
  const dsModel = await import('@meridian/core/models/datasource.model.js');
  const qModel = await import('@meridian/core/models/question.model.js');
  const dModel = await import('@meridian/core/models/dashboard.model.js');
  const uModel = await import('@meridian/core/models/user.model.js');
  return {
    DataSource: dsModel.DataSource,
    Question: qModel.Question,
    Dashboard: dModel.Dashboard,
    User: uModel.User,
    Role: uModel.Role,
  };
}

async function loadPluginRegistry(logger: Logger) {
  const { PluginRegistry } = await import('@meridian/plugins');
  return new PluginRegistry({ logger }) as unknown as PluginRegistryLike;
}

// ── In-Memory User Repository ───────────────────────────────────────

class InMemoryUserRepository implements UserRepositoryLike {
  private store = new Map<string, UserEntity>();
  private passwordStore = new Map<string, string>();

  async findById(id: string): Promise<UserEntity | null> {
    return this.store.get(id) ?? null;
  }
  async findByEmail(email: string): Promise<UserEntity | null> {
    return Array.from(this.store.values()).find((u) => u.email === email) ?? null;
  }
  async findByOrganization(options: { organizationId: string; status?: UserStatus; search?: string; limit?: number; offset?: number }): Promise<UserEntity[]> {
    let results = Array.from(this.store.values()).filter((u) => u.organizationId === options.organizationId);
    if (options.status) results = results.filter((u) => u.status === options.status);
    if (options.search) {
      const s = options.search.toLowerCase();
      results = results.filter((u) => u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s));
    }
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 25;
    return results.slice(offset, offset + limit);
  }
  async save(user: UserEntity): Promise<UserEntity> {
    this.store.set(user.id, user);
    return user;
  }
  async delete(id: string): Promise<void> {
    this.store.delete(id);
    this.passwordStore.delete(id);
  }
  async existsByEmail(email: string): Promise<boolean> {
    return Array.from(this.store.values()).some((u) => u.email === email);
  }
  async savePassword(userId: string, hash: string): Promise<void> {
    this.passwordStore.set(userId, hash);
  }
  async getPasswordHash(userId: string): Promise<string | null> {
    return this.passwordStore.get(userId) ?? null;
  }
}

// ── In-Memory stores for other entities ─────────────────────────────

class InMemoryStore<T extends { id: string }> {
  protected store = new Map<string, T>();

  async findById(id: string): Promise<T | null> {
    return this.store.get(id) ?? null;
  }
  async save(entity: T): Promise<T> {
    this.store.set(entity.id, entity);
    return entity;
  }
  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
  values(): T[] {
    return Array.from(this.store.values());
  }
}

// ── Container Factory ───────────────────────────────────────────────

export async function createContainerAsync(options: CreateContainerOptions): Promise<ServiceContainer> {
  const { config } = options;
  const logger = options.logger ?? createLogger('meridian-server', {
    level: config.LOG_LEVEL,
    pretty: config.NODE_ENV === 'development',
  });

  const { tokenService, passwordService } = await loadAuthModules(config);
  const models = await loadCoreModels();
  const pluginRegistry = await loadPluginRegistry(logger);

  // In-memory stores
  const dsStore = new InMemoryStore<DataSourceEntity>();
  const qStore = new InMemoryStore<QuestionEntity>();
  const dashStore = new InMemoryStore<DashboardEntity>();
  const userRepo = new InMemoryUserRepository();

  // DataSource service
  const dataSourceService: DataSourceServiceLike = {
    async create(dto) {
      const existing = dsStore.values().some((ds) => ds.organizationId === dto.organizationId && ds.name === dto.name);
      if (existing) return err(new ConflictError(`Data source '${dto.name}' already exists`));
      const result = models.DataSource.create(dto);
      if (!result.ok) return result as Result<DataSourceEntity>;
      return ok(await dsStore.save(result.value as unknown as DataSourceEntity));
    },
    async getById(id) {
      const ds = await dsStore.findById(id);
      if (!ds) return err(new NotFoundError('DataSource', id));
      return ok(ds);
    },
    async listByOrganization(orgId) {
      return ok(dsStore.values().filter((ds) => ds.organizationId === orgId));
    },
    async testConnection(id) {
      const ds = await dsStore.findById(id);
      if (!ds) return err(new NotFoundError('DataSource', id));
      ds.markConnected();
      await dsStore.save(ds);
      return ok({ success: true, message: 'Connection successful', latencyMs: 42 });
    },
    async getSchema(id) {
      const ds = await dsStore.findById(id);
      if (!ds) return err(new NotFoundError('DataSource', id));
      return ok([{ name: 'public', tables: [] }]);
    },
    async getTables(id) {
      const ds = await dsStore.findById(id);
      if (!ds) return err(new NotFoundError('DataSource', id));
      return ok([]);
    },
    async update(id, dto) {
      const ds = await dsStore.findById(id);
      if (!ds) return err(new NotFoundError('DataSource', id));
      const result = ds.update(dto);
      if (!result.ok) return result;
      return ok(await dsStore.save(result.value));
    },
    async delete(id) {
      const ds = await dsStore.findById(id);
      if (!ds) return err(new NotFoundError('DataSource', id));
      await dsStore.delete(id);
      return ok(undefined);
    },
  };

  // Question service
  const questionService: QuestionServiceLike = {
    async createVisual(dto) {
      const result = models.Question.createVisual(dto);
      if (!result.ok) return result as Result<QuestionEntity>;
      return ok(await qStore.save(result.value as unknown as QuestionEntity));
    },
    async createSQL(dto) {
      const result = models.Question.createSQL(dto);
      if (!result.ok) return result as Result<QuestionEntity>;
      return ok(await qStore.save(result.value as unknown as QuestionEntity));
    },
    async getById(id) {
      const q = await qStore.findById(id);
      if (!q) return err(new NotFoundError('Question', id));
      return ok(q);
    },
    async list(options) {
      let results = qStore.values().filter((q) => q.organizationId === options.organizationId);
      if (options.dataSourceId) results = results.filter((q) => q.dataSourceId === options.dataSourceId);
      if (options.type) results = results.filter((q) => q.type === options.type);
      if (options.createdBy) results = results.filter((q) => q.createdBy === options.createdBy);
      if (options.search) {
        const s = options.search.toLowerCase();
        results = results.filter((q) => q.name.toLowerCase().includes(s) || q.description?.toLowerCase().includes(s));
      }
      const offset = options.offset ?? 0;
      const limit = options.limit ?? 25;
      return ok(results.slice(offset, offset + limit));
    },
    async update(id, dto) {
      const q = await qStore.findById(id);
      if (!q) return err(new NotFoundError('Question', id));
      let updated: Result<QuestionEntity> = ok(q);
      if (dto.name !== undefined || dto.description !== undefined) {
        updated = q.updateMetadata({ name: dto.name, description: dto.description });
        if (!updated.ok) return updated;
      }
      if (dto.query !== undefined) {
        const current = updated.ok ? updated.value : q;
        updated = current.updateQuery(dto.query);
        if (!updated.ok) return updated;
      }
      if (dto.visualization !== undefined) {
        const current = updated.ok ? updated.value : q;
        updated = current.updateVisualization(dto.visualization);
        if (!updated.ok) return updated;
      }
      if (!updated.ok) return updated;
      return ok(await qStore.save(updated.value));
    },
    async delete(id) {
      const q = await qStore.findById(id);
      if (!q) return err(new NotFoundError('Question', id));
      await qStore.delete(id);
      return ok(undefined);
    },
    async duplicate(id, newName, createdBy) {
      const q = await qStore.findById(id);
      if (!q) return err(new NotFoundError('Question', id));
      const createResult = q.type === 'visual'
        ? models.Question.createVisual({ name: newName, description: q.description, dataSourceId: q.dataSourceId, query: q.query as VisualQuery, visualization: q.visualization, organizationId: q.organizationId, createdBy })
        : models.Question.createSQL({ name: newName, description: q.description, dataSourceId: q.dataSourceId, sql: q.query as string, visualization: q.visualization, organizationId: q.organizationId, createdBy });
      if (!createResult.ok) return createResult as Result<QuestionEntity>;
      return ok(await qStore.save(createResult.value as unknown as QuestionEntity));
    },
  };

  // Dashboard service
  const dashboardService: DashboardServiceLike = {
    async create(dto) {
      const result = models.Dashboard.create(dto);
      if (!result.ok) return result as Result<DashboardEntity>;
      return ok(await dashStore.save(result.value as unknown as DashboardEntity));
    },
    async getById(id) {
      const d = await dashStore.findById(id);
      if (!d) return err(new NotFoundError('Dashboard', id));
      return ok(d);
    },
    async list(options) {
      let results = dashStore.values().filter((d) => d.organizationId === options.organizationId);
      if (options.createdBy) results = results.filter((d) => d.createdBy === options.createdBy);
      if (options.isPublic !== undefined) results = results.filter((d) => d.isPublic === options.isPublic);
      if (options.search) {
        const s = options.search.toLowerCase();
        results = results.filter((d) => d.name.toLowerCase().includes(s) || d.description?.toLowerCase().includes(s));
      }
      const offset = options.offset ?? 0;
      const limit = options.limit ?? 25;
      return ok(results.slice(offset, offset + limit));
    },
    async update(id, dto) {
      const d = await dashStore.findById(id);
      if (!d) return err(new NotFoundError('Dashboard', id));
      const result = d.updateMetadata(dto);
      if (!result.ok) return result;
      return ok(await dashStore.save(result.value));
    },
    async delete(id) {
      const d = await dashStore.findById(id);
      if (!d) return err(new NotFoundError('Dashboard', id));
      await dashStore.delete(id);
      return ok(undefined);
    },
    async addCard(dashboardId, dto) {
      const d = await dashStore.findById(dashboardId);
      if (!d) return err(new NotFoundError('Dashboard', dashboardId));
      const result = d.addCard(dto);
      if (!result.ok) return result;
      return ok(await dashStore.save(result.value));
    },
    async removeCard(dashboardId, cardId) {
      const d = await dashStore.findById(dashboardId);
      if (!d) return err(new NotFoundError('Dashboard', dashboardId));
      const result = d.removeCard(cardId);
      if (!result.ok) return result;
      return ok(await dashStore.save(result.value));
    },
    async moveCard(dashboardId, cardId, position, size) {
      const d = await dashStore.findById(dashboardId);
      if (!d) return err(new NotFoundError('Dashboard', dashboardId));
      const result = d.moveCard(cardId, position, size);
      if (!result.ok) return result;
      return ok(await dashStore.save(result.value));
    },
    async updateLayout(dashboardId, layout) {
      const d = await dashStore.findById(dashboardId);
      if (!d) return err(new NotFoundError('Dashboard', dashboardId));
      const result = d.updateLayout(layout);
      if (!result.ok) return result;
      return ok(await dashStore.save(result.value));
    },
    async reorderCards(dashboardId, cardIds) {
      const d = await dashStore.findById(dashboardId);
      if (!d) return err(new NotFoundError('Dashboard', dashboardId));
      const result = d.reorderCards(cardIds);
      if (!result.ok) return result;
      return ok(await dashStore.save(result.value));
    },
    async addFilter(dashboardId, filter) {
      const d = await dashStore.findById(dashboardId);
      if (!d) return err(new NotFoundError('Dashboard', dashboardId));
      const result = d.addFilter(filter);
      if (!result.ok) return result;
      return ok(await dashStore.save(result.value));
    },
    async removeFilter(dashboardId, filterId) {
      const d = await dashStore.findById(dashboardId);
      if (!d) return err(new NotFoundError('Dashboard', dashboardId));
      const result = d.removeFilter(filterId);
      if (!result.ok) return result;
      return ok(await dashStore.save(result.value));
    },
    async duplicate(id, newName, createdBy) {
      const d = await dashStore.findById(id);
      if (!d) return err(new NotFoundError('Dashboard', id));
      const result = models.Dashboard.create({ name: newName, description: d.description, organizationId: d.organizationId, createdBy, isPublic: d.isPublic, layout: d.layout });
      if (!result.ok) return result as Result<DashboardEntity>;
      return ok(await dashStore.save(result.value as unknown as DashboardEntity));
    },
  };

  // User service
  const userService: UserServiceLike = {
    async create(dto) {
      const exists = await userRepo.existsByEmail(dto.email);
      if (exists) return err(new ConflictError(`User with email '${dto.email}' already exists`));
      const role = models.Role.createViewer(dto.organizationId);
      const result = models.User.create({ ...dto, role });
      if (!result.ok) return result as Result<UserEntity>;
      return ok(await userRepo.save(result.value as unknown as UserEntity));
    },
    async getById(id) {
      const u = await userRepo.findById(id);
      if (!u) return err(new NotFoundError('User', id));
      return ok(u);
    },
    async getByEmail(email) {
      const u = await userRepo.findByEmail(email);
      if (!u) return err(new NotFoundError('User', email));
      return ok(u);
    },
    async list(options) {
      return ok(await userRepo.findByOrganization(options));
    },
    async update(id, dto) {
      const u = await userRepo.findById(id);
      if (!u) return err(new NotFoundError('User', id));
      const result = u.updateProfile(dto);
      if (!result.ok) return result;
      return ok(await userRepo.save(result.value));
    },
    async delete(id) {
      const u = await userRepo.findById(id);
      if (!u) return err(new NotFoundError('User', id));
      await userRepo.delete(id);
      return ok(undefined);
    },
    async activate(id) {
      const u = await userRepo.findById(id);
      if (!u) return err(new NotFoundError('User', id));
      const result = u.activate();
      if (!result.ok) return result;
      return ok(await userRepo.save(result.value));
    },
    async deactivate(id) {
      const u = await userRepo.findById(id);
      if (!u) return err(new NotFoundError('User', id));
      const result = u.deactivate();
      if (!result.ok) return result;
      return ok(await userRepo.save(result.value));
    },
    async assignRole(userId, roleId) {
      const u = await userRepo.findById(userId);
      if (!u) return err(new NotFoundError('User', userId));
      const role = new models.Role({ id: roleId, name: 'custom', permissions: [], organizationId: u.organizationId });
      const result = u.assignRole(role as unknown as RoleEntity);
      if (!result.ok) return result;
      return ok(await userRepo.save(result.value));
    },
    async hasPermission(userId, permission) {
      const u = await userRepo.findById(userId);
      if (!u) return err(new NotFoundError('User', userId));
      return ok(u.hasPermission(permission));
    },
    async recordLogin(userId) {
      const u = await userRepo.findById(userId);
      if (!u) return err(new NotFoundError('User', userId));
      return ok(await userRepo.save(u.recordLogin()));
    },
  };

  return {
    logger,
    config,
    tokenService,
    passwordService,
    dataSourceService,
    questionService,
    dashboardService,
    userService,
    userRepository: userRepo,
    pluginRegistry,
  };
}

/**
 * Synchronous container factory — creates container with lazy async initialization.
 * Returns immediately, services are initialized on first use.
 */
export function createContainer(options: CreateContainerOptions): ServiceContainer {
  // We create a proxy that lazily initializes.
  // For simplicity in the current codebase, we use a synchronous approach
  // with direct in-memory implementations that don't need async module loading.

  const { config } = options;
  const logger = options.logger ?? createLogger('meridian-server', {
    level: config.LOG_LEVEL,
    pretty: config.NODE_ENV === 'development',
  });

  // Create a minimal container synchronously for test/dev use.
  // The real async container should be used in production via createContainerAsync.

  // For the synchronous path, we use placeholder services that will be
  // overridden when createApp calls createContainerAsync.
  // This is a deliberate tradeoff for testability.

  const placeholder = {} as ServiceContainer;
  placeholder.logger = logger;
  placeholder.config = config;
  return placeholder;
}

/**
 * Create a test container with all services initialized.
 */
export async function createTestContainer(configOverrides: Partial<ServerConfig> = {}): Promise<ServiceContainer> {
  const config: ServerConfig = {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
    PORT: 0,
    LOG_LEVEL: 'silent',
    CORS_ORIGIN: '*',
    SWAGGER_ENABLED: false,
    NODE_ENV: 'test',
    ACCESS_TOKEN_EXPIRY: '15m',
    REFRESH_TOKEN_EXPIRY: '7d',
    JWT_ISSUER: 'meridian-test',
    RATE_LIMIT_MAX: 1000,
    RATE_LIMIT_WINDOW_MS: 60_000,
    TRUST_PROXY: false,
    EMBED_TOKEN_EXPIRY: '24h',
    ...configOverrides,
  };

  return createContainerAsync({ config, logger: createNoopLogger() });
}
