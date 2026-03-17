import { vi } from 'vitest';
import type { Database } from '../../connection.js';

// ── Mock Database Factory ───────────────────────────────────────────

/**
 * Create a mock Drizzle database instance for unit tests.
 *
 * Each query method returns a chainable builder that ultimately
 * resolves to configurable return values. This allows tests to
 * set up expectations without a real database.
 */

interface MockQueryChain {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  offset: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  leftJoin: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  onConflictDoUpdate: ReturnType<typeof vi.fn>;
  onConflictDoNothing: ReturnType<typeof vi.fn>;
}

/**
 * Create a chainable mock that returns `defaultResult` when resolved.
 * Each method in the chain returns `this` so methods can be called in any order.
 */
function createChainableMock(defaultResult: unknown = []): MockQueryChain {
  const chain: Partial<MockQueryChain> = {};

  const methods = [
    'from',
    'where',
    'limit',
    'offset',
    'orderBy',
    'leftJoin',
    'innerJoin',
    'groupBy',
    'returning',
    'set',
    'values',
    'onConflictDoUpdate',
    'onConflictDoNothing',
  ] as const;

  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }

  // Make the chain itself thenable so `await db.select()...` works
  (chain as Record<string, unknown>)['then'] = (
    resolve: (value: unknown) => void,
  ) => {
    resolve(defaultResult);
  };

  return chain as MockQueryChain;
}

export interface MockDb {
  db: Database;
  /** Override the return value for the next select() chain */
  setSelectResult: (result: unknown) => void;
  /** Override the return value for the next insert() chain */
  setInsertResult: (result: unknown) => void;
  /** Override the return value for the next update() chain */
  setUpdateResult: (result: unknown) => void;
  /** Override the return value for the next delete() chain */
  setDeleteResult: (result: unknown) => void;
  /** Get the mock function references for assertions */
  mocks: {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
}

export function createMockDb(): MockDb {
  let selectResult: unknown = [];
  let insertResult: unknown = [];
  let updateResult: unknown = [];
  let deleteResult: unknown = [];

  const selectMock = vi.fn().mockImplementation(() => createChainableMock(selectResult));
  const insertMock = vi.fn().mockImplementation(() => createChainableMock(insertResult));
  const updateMock = vi.fn().mockImplementation(() => createChainableMock(updateResult));
  const deleteMock = vi.fn().mockImplementation(() => createChainableMock(deleteResult));

  const db = {
    select: selectMock,
    insert: insertMock,
    update: updateMock,
    delete: deleteMock,
    query: {},
  } as unknown as Database;

  return {
    db,
    setSelectResult: (result: unknown) => {
      selectResult = result;
    },
    setInsertResult: (result: unknown) => {
      insertResult = result;
    },
    setUpdateResult: (result: unknown) => {
      updateResult = result;
    },
    setDeleteResult: (result: unknown) => {
      deleteResult = result;
    },
    mocks: {
      select: selectMock,
      insert: insertMock,
      update: updateMock,
      delete: deleteMock,
    },
  };
}

// ── Sample Data Factories ───────────────────────────────────────────

let idCounter = 0;

export function generateTestId(): string {
  idCounter++;
  return `00000000-0000-0000-0000-${String(idCounter).padStart(12, '0')}`;
}

export function resetIdCounter(): void {
  idCounter = 0;
}

export function createSampleOrganization(overrides: Record<string, unknown> = {}) {
  return {
    id: generateTestId(),
    name: 'Test Organization',
    slug: 'test-org',
    settings: {},
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function createSampleRole(overrides: Record<string, unknown> = {}) {
  return {
    id: generateTestId(),
    name: 'Test Role',
    permissions: ['dashboard:read', 'question:read'],
    organizationId: generateTestId(),
    isSystem: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function createSampleUser(overrides: Record<string, unknown> = {}) {
  return {
    id: generateTestId(),
    email: 'test@example.com',
    name: 'Test User',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
    avatarUrl: null,
    organizationId: generateTestId(),
    roleId: generateTestId(),
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function createSampleDataSource(overrides: Record<string, unknown> = {}) {
  return {
    id: generateTestId(),
    name: 'Test PostgreSQL',
    type: 'postgresql' as const,
    config: { host: 'localhost', port: 5432, database: 'testdb' },
    organizationId: generateTestId(),
    createdBy: generateTestId(),
    status: 'active' as const,
    lastTestedAt: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function createSampleQuestion(overrides: Record<string, unknown> = {}) {
  return {
    id: generateTestId(),
    name: 'Test Question',
    description: 'A test question',
    type: 'sql' as const,
    dataSourceId: generateTestId(),
    query: { sql: 'SELECT * FROM users' },
    visualization: { type: 'table' },
    organizationId: generateTestId(),
    createdBy: generateTestId(),
    isArchived: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function createSampleDashboard(overrides: Record<string, unknown> = {}) {
  return {
    id: generateTestId(),
    name: 'Test Dashboard',
    description: 'A test dashboard',
    organizationId: generateTestId(),
    createdBy: generateTestId(),
    isPublic: false,
    layout: { columns: 12, rowHeight: 80 },
    filters: [],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function createSampleDashboardCard(overrides: Record<string, unknown> = {}) {
  return {
    id: generateTestId(),
    dashboardId: generateTestId(),
    questionId: generateTestId(),
    positionX: 0,
    positionY: 0,
    width: 6,
    height: 4,
    settings: {},
    ...overrides,
  };
}

export function createSampleAuditLog(overrides: Record<string, unknown> = {}) {
  return {
    id: generateTestId(),
    userId: generateTestId(),
    action: 'user.login',
    entityType: 'user',
    entityId: generateTestId(),
    metadata: {},
    ipAddress: '127.0.0.1',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function createSampleCacheEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: generateTestId(),
    key: 'cache:test:key',
    value: { rows: [], count: 0 },
    expiresAt: new Date(Date.now() + 300_000),
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function createSamplePluginEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: generateTestId(),
    name: '@meridian/connector-mysql',
    version: '1.0.0',
    type: 'connector' as const,
    config: {},
    isEnabled: true,
    installedAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}
