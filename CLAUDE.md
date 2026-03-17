# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Meridian

**TypeScript-native, self-hosted business intelligence and data analytics platform.**

Meridian fills the gap where no production-grade BI tool exists in the TypeScript ecosystem. Metabase (Clojure), Superset (Python), and Redash (Python, development stagnant) dominate, but none offer a TypeScript-native alternative. Meridian combines Metabase's ease of use with Superset's analytical power in a modern, embeddable, real-time-first architecture.

**Positioning**: "The BI platform TypeScript teams can actually contribute to and extend."
**Target users**: Redash refugees (SQL-first teams), Metabase ceiling-hitters (scaling/embedding limits), TypeScript-native SaaS teams.

### Key Differentiators
- **TypeScript-native**: Full stack in TypeScript — backend, frontend, SDK, CLI. No Clojure/Python barrier.
- **Real-time first**: WebSocket-based live dashboards, not polling
- **Embeddable**: First-class embedded analytics SDK (React components + web components), free in OSS core
- **Plugin architecture**: Extensible connectors, visualizations, and transformations
- **Developer-friendly**: Code-first API with visual UI on top, Git-based version control for dashboards
- **Zero-ops self-hosting**: Single Docker command, SQLite for dev → PostgreSQL for production
- **AI-native**: Built-in NL-to-SQL query generation, auto-insights, anomaly detection
- **Semantic layer**: Reusable metric definitions, consistent calculations across dashboards

## Architecture

Turborepo + pnpm monorepo with strict package boundaries.

```
apps/
  web/              → React 19 + Vite dashboard (TailwindCSS v4)
  server/           → Fastify API server (REST + WebSocket)
  cli/              → Commander.js CLI tool
  worker/           → Background job processor (BullMQ)

packages/
  @meridian/core           → Core business logic, domain models
  @meridian/db             → Drizzle ORM schema, migrations, repositories
  @meridian/query-engine   → SQL generation, query optimization, execution
  @meridian/connectors     → Database connectors (PostgreSQL, MySQL, SQLite, ClickHouse, BigQuery, Snowflake, DuckDB)
  @meridian/viz            → Chart components (Apache ECharts wrappers)
  @meridian/auth           → Authentication (JWT + session), RBAC, row-level security, SSO/SAML/OIDC
  @meridian/realtime       → WebSocket engine for live dashboard updates
  @meridian/sdk            → Embeddable analytics client SDK
  @meridian/plugins        → Plugin system API and loader
  @meridian/cache          → Multi-layer cache (in-memory + Redis)
  @meridian/scheduler      → Cron-like job scheduling for data refresh
  @meridian/ui             → Shared React component library
  @meridian/shared         → Shared types, utils, constants
  @meridian/config         → Shared ESLint, TypeScript, Tailwind, Vitest configs
```

### Data Flow
```
Data Source → Connector → Query Engine → Cache → API Server → WebSocket → Dashboard
                                          ↓
                                      Scheduler (periodic refresh)
                                          ↓
                                       Worker (heavy queries, exports)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + pnpm workspaces |
| Backend | Fastify 5 + TypeScript 5.x |
| Frontend | React 19 + Vite 6 + TailwindCSS v4 |
| ORM | Drizzle ORM |
| Primary DB | PostgreSQL 16 (metadata store) |
| Cache | Redis 7 (via ioredis) |
| Queue | BullMQ (Redis-backed) |
| Real-time | ws (WebSocket) |
| Charts | Apache ECharts 5 |
| Auth | jose (JWT) + argon2 (password hashing) |
| Testing | Vitest (unit/integration) + Playwright (e2e) |
| Build | tsup (packages) + Vite (apps/web) + esbuild (apps/server) |
| Lint | ESLint 9 (flat config) + Prettier |
| Validation | Zod |

## Development Commands

```bash
# Install dependencies
pnpm install

# Development (all apps)
pnpm dev

# Development (specific app)
pnpm --filter @meridian/web dev
pnpm --filter @meridian/server dev

# Build all
pnpm build

# Build specific package
pnpm --filter @meridian/core build

# Test all (no cache)
pnpm test --no-cache

# Test specific package
pnpm --filter @meridian/query-engine test -- --no-cache

# Test single file
pnpm --filter @meridian/core vitest run src/models/dashboard.test.ts --no-cache

# Lint
pnpm lint

# Lint fix
pnpm lint:fix

# Type check
pnpm typecheck

# Database migrations
pnpm --filter @meridian/db migrate
pnpm --filter @meridian/db generate
pnpm --filter @meridian/db studio    # Drizzle Studio

# CLI (development)
pnpm --filter @meridian/cli dev -- <command>
```

## Coding Conventions

- **Naming**: camelCase for variables/functions, PascalCase for types/classes/components, UPPER_SNAKE_CASE for constants
- **Imports**: Named exports only (no default exports). Path aliases via `@/` within each package.
- **File naming**: kebab-case for files (`query-engine.ts`), PascalCase for React components (`DashboardCard.tsx`)
- **Testing**: Co-located test files (`foo.ts` → `foo.test.ts`). Integration tests in `__tests__/` directories.
- **Error handling**: Custom error classes extending `MeridianError` base. Always include error codes.
- **Validation**: Zod schemas at all API boundaries. Shared schemas in `@meridian/shared`.
- **Database**: All queries through Drizzle ORM. Raw SQL only in `@meridian/query-engine` for generated queries.
- **API routes**: Fastify route modules under `src/routes/`. Use Zod schemas for request/response validation.
- **React**: Functional components only. Zustand for client state. TanStack Query for server state.
- **Commits**: Conventional Commits format (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`)

## Package Dependency Rules

```
apps/* → can depend on any packages/*
@meridian/core → @meridian/shared only
@meridian/db → @meridian/core, @meridian/shared
@meridian/query-engine → @meridian/core, @meridian/connectors, @meridian/shared
@meridian/connectors → @meridian/core, @meridian/shared
@meridian/auth → @meridian/core, @meridian/db, @meridian/shared
@meridian/viz → @meridian/core, @meridian/shared (React peer dependency)
@meridian/ui → @meridian/shared (React peer dependency)
@meridian/sdk → @meridian/shared, @meridian/viz
@meridian/realtime → @meridian/core, @meridian/shared
@meridian/cache → @meridian/shared
@meridian/scheduler → @meridian/core, @meridian/cache, @meridian/shared
@meridian/plugins → @meridian/core, @meridian/shared
@meridian/shared → NO internal dependencies
@meridian/config → NO internal dependencies
```

## Critical Patterns

### Query Engine Pipeline
The query engine translates visual queries into optimized SQL:
1. `VisualQuery` (UI model) → `AbstractQuery` (IR) → `SQLQuery` (dialect-specific SQL)
2. Each connector implements `SQLDialect` interface for dialect differences
3. Query results are cached by hash of (query + params + connector config)

### Plugin System
Plugins are loaded dynamically and can extend:
- Connectors (new data sources)
- Visualizations (new chart types)
- Transformations (data processing steps)
- API routes (custom endpoints)

Plugin interface: `MeridianPlugin { name, version, type, register(context) }`

### Real-time Updates
- Server pushes dashboard refresh events via WebSocket
- Clients subscribe to specific dashboard/question IDs
- Scheduler triggers refresh → Worker executes query → Cache updated → WebSocket broadcast

## Environment Variables

```env
# Required
DATABASE_URL=postgresql://user:pass@localhost:5432/meridian
REDIS_URL=redis://localhost:6379

# Optional
JWT_SECRET=<generated-on-first-run>
PORT=3001
WEB_PORT=5173
LOG_LEVEL=info
```

## Autonomous Development Protocol

This project is built entirely by AI agent teams. No human makes architectural or implementation decisions.
- All goals, methods, and execution are AI-determined
- External research (web, docs) is actively preferred over assumptions
- Target scale: 100K+ lines of code
- Every package should have comprehensive tests (>80% coverage target)
