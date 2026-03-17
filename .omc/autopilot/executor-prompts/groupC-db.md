# Group C1: @meridian/db — Database Schema & Repositories

## Task
Implement the complete database layer using Drizzle ORM for PostgreSQL. This includes schema definitions, migrations, and repository implementations.

## Files to Create

### src/schema/users.ts
```typescript
import { pgTable, uuid, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  roleId: uuid('role_id').notNull().references(() => roles.id),
  isActive: boolean('is_active').default(true).notNull(),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### src/schema/organizations.ts
organizations table: id, name, slug, settings (jsonb), createdAt, updatedAt

### src/schema/roles.ts
roles table: id, name, permissions (text[]), organizationId, isSystem, createdAt

### src/schema/datasources.ts
datasources table: id, name, type (enum), config (jsonb, encrypted), organizationId, createdBy, status, lastTestedAt, createdAt, updatedAt

### src/schema/questions.ts
questions table: id, name, description, type (enum: visual/sql), dataSourceId, query (jsonb), visualization (jsonb), organizationId, createdBy, isArchived, createdAt, updatedAt

### src/schema/dashboards.ts
dashboards table: id, name, description, organizationId, createdBy, isPublic, layout (jsonb), filters (jsonb), createdAt, updatedAt

### src/schema/dashboard-cards.ts
dashboard_cards table: id, dashboardId, questionId, positionX, positionY, width, height, settings (jsonb)

### src/schema/cache-entries.ts
cache_entries table: id, key (unique index), value (jsonb), expiresAt, createdAt

### src/schema/audit-logs.ts
audit_logs table: id, userId, action, entityType, entityId, metadata (jsonb), ipAddress, createdAt

### src/schema/plugin-registry.ts
plugin_registry table: id, name, version, type, config (jsonb), isEnabled, installedAt, updatedAt

### src/schema/relations.ts
Define all Drizzle relations between tables

### src/schema/index.ts — re-exports all schemas

### src/connection.ts
```typescript
export function createDatabase(url: string): PostgresJsDatabase;
export function createTestDatabase(): PostgresJsDatabase; // SQLite for tests
```

### src/migrate.ts
Migration runner using drizzle-kit

### src/repositories/user.repository.ts
Implements UserRepository from @meridian/core:
- findById, findByEmail, findByOrganization
- save (upsert), delete
- updateLastLogin

### src/repositories/datasource.repository.ts
### src/repositories/question.repository.ts
### src/repositories/dashboard.repository.ts
### src/repositories/organization.repository.ts
(Same implementation pattern)

### src/repositories/audit-log.repository.ts
- create(log), findByEntity, findByUser, findByDateRange

### src/seed.ts
Seed data: default org, admin role, admin user, sample datasource

### src/index.ts — re-exports

### drizzle.config.ts
Drizzle Kit config for migrations

## Tests
- src/repositories/user.repository.test.ts
- src/repositories/datasource.repository.test.ts
- src/repositories/question.repository.test.ts
- src/repositories/dashboard.repository.test.ts
(Use in-memory SQLite or mocked Drizzle for tests)

## Dependencies
- @meridian/core, @meridian/shared
- drizzle-orm, @neondatabase/serverless or postgres (pg driver)
- drizzle-kit (devDep)

## Estimated LOC: ~8000 + ~2000 tests
