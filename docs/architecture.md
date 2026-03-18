# Meridian - Architecture Overview

This document describes the system architecture, data flow, design patterns, and key
technical decisions behind the Meridian BI platform.

---

## Table of Contents

- [1. System Architecture](#1-system-architecture)
- [2. Data Flow](#2-data-flow)
- [3. Package Dependency Graph](#3-package-dependency-graph)
- [4. Technology Choices and Rationale](#4-technology-choices-and-rationale)
- [5. Key Design Patterns](#5-key-design-patterns)
- [6. Database Schema](#6-database-schema)
- [7. API Route Structure](#7-api-route-structure)
- [8. WebSocket Protocol](#8-websocket-protocol)
- [9. Plugin System Architecture](#9-plugin-system-architecture)
- [10. Query Engine Pipeline](#10-query-engine-pipeline)
- [11. Caching Strategy](#11-caching-strategy)
- [12. Authentication and Authorization](#12-authentication-and-authorization)

---

## 1. System Architecture

Meridian follows a **modular monorepo** architecture using Turborepo and pnpm workspaces.
The system is composed of 4 deployable applications and 14 reusable packages.

```
                                    Internet
                                       |
                              +--------+--------+
                              |   Reverse Proxy  |
                              |    (nginx)       |
                              +--------+--------+
                                       |
                        +--------------+--------------+
                        |                             |
                +-------+-------+             +-------+-------+
                |   Web App     |             |  API Server   |
                |  (React/Vite) |             |  (Fastify)    |
                |  Port: 80     |  REST/WS    |  Port: 3001   |
                +---------------+------------>+-------+-------+
                                                      |
                        +-----------------------------+-----------------------------+
                        |                             |                             |
                +-------+-------+             +-------+-------+             +-------+-------+
                |  PostgreSQL   |             |    Redis      |             |   Worker      |
                |  (metadata)   |             | (cache+queue) |             |  (BullMQ)     |
                |  Port: 5432   |             |  Port: 6379   |             |               |
                +---------------+             +---------------+             +-------+-------+
                                                                                    |
                                                                            +-------+-------+
                                                                            | Data Sources  |
                                                                            | (PG/MySQL/    |
                                                                            |  SQLite/CH/   |
                                                                            |  DuckDB/...)  |
                                                                            +---------------+
```

### Application Components

| Application | Technology | Purpose |
|-------------|-----------|---------|
| `apps/web` | React 19 + Vite 6 + TailwindCSS v4 | Dashboard UI, query builder, admin panel |
| `apps/server` | Fastify 5 | REST API, WebSocket server, authentication |
| `apps/worker` | BullMQ | Background job processing (exports, data refresh, heavy queries) |
| `apps/cli` | Commander.js | CLI tool for automation and scripting |

### Infrastructure Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| PostgreSQL 16 | Metadata store | Users, dashboards, questions, data sources, audit logs |
| Redis 7 | Cache + Queue | Query result cache, BullMQ job queue backend |
| nginx | Reverse proxy | Static file serving, SSL termination, API proxying |

---

## 2. Data Flow

### Query Execution Flow

```
User Action (Dashboard/Query Builder)
    |
    v
[1] API Request (POST /api/questions/:id/execute)
    |
    v
[2] Authentication Middleware (JWT verification)
    |
    v
[3] Authorization Check (RBAC + RLS)
    |
    v
[4] Cache Lookup (query hash -> cached result?)
    |-- Cache HIT --> Return cached result
    |
    v (Cache MISS)
[5] Question Service (load question definition)
    |
    v
[6] Query Engine Pipeline:
    |   VisualQuery --> AbstractQuery (IR) --> Optimized IR --> SQL string
    |
    v
[7] Connector (execute SQL against data source)
    |   PostgreSQL / MySQL / SQLite / ClickHouse / DuckDB
    |
    v
[8] Result Processing (type mapping, formatting)
    |
    v
[9] Cache Store (save result with TTL)
    |
    v
[10] WebSocket Broadcast (notify subscribers of fresh data)
    |
    v
[11] API Response (query results + metadata)
```

### Scheduled Refresh Flow

```
Scheduler (cron trigger)
    |
    v
BullMQ Job Enqueue
    |
    v
Worker Picks Up Job
    |
    v
Query Execution (steps 5-9 above)
    |
    v
Cache Updated
    |
    v
WebSocket Broadcast to Dashboard Subscribers
```

### Data Source Connection Flow

```
Admin adds Data Source
    |
    v
Connection Test (Connector validates credentials)
    |
    v
Schema Introspection (list databases, schemas, tables, columns)
    |
    v
Data Source saved to metadata DB
    |
    v
Available for query building
```

---

## 3. Package Dependency Graph

```
@meridian/shared (no dependencies)
    ^
    |
@meridian/config (no dependencies)
    ^
    |
    +---------------------------+---------------------------+
    |                           |                           |
@meridian/core              @meridian/cache           @meridian/ui
(shared)                    (shared)                  (shared, React)
    ^                           ^
    |                           |
    +----------+----------+     |
    |          |          |     |
@meridian/db  |   @meridian/scheduler
(core,shared) |   (core,cache,shared)
    ^         |
    |         |
    |   @meridian/connectors
    |   (core, shared)
    |         ^
    |         |
    |   @meridian/query-engine
    |   (core, connectors, shared)
    |
@meridian/auth
(core, db, shared)
    |
@meridian/realtime                @meridian/viz
(core, shared)                    (core, shared, React)
    |                                    ^
    |                                    |
@meridian/plugins                 @meridian/sdk
(core, shared)                    (shared, viz)
    |
    +------+------+------+------+
    |      |      |      |      |
  server  web   worker  cli   (apps depend on any packages)
```

### Dependency Rules (Enforced)

| Package | Allowed Dependencies |
|---------|---------------------|
| `@meridian/shared` | None (leaf node) |
| `@meridian/config` | None (leaf node) |
| `@meridian/core` | `shared` only |
| `@meridian/db` | `core`, `shared` |
| `@meridian/query-engine` | `core`, `connectors`, `shared` |
| `@meridian/connectors` | `core`, `shared` |
| `@meridian/auth` | `core`, `db`, `shared` |
| `@meridian/viz` | `core`, `shared` (React peer) |
| `@meridian/ui` | `shared` (React peer) |
| `@meridian/sdk` | `shared`, `viz` |
| `@meridian/realtime` | `core`, `shared` |
| `@meridian/cache` | `shared` |
| `@meridian/scheduler` | `core`, `cache`, `shared` |
| `@meridian/plugins` | `core`, `shared` |
| `apps/*` | Any `packages/*` |

---

## 4. Technology Choices and Rationale

### Backend: Fastify 5

**Why Fastify over Express**:
- Schema-based validation with Zod integration (type-safe request/response)
- Plugin architecture aligns with Meridian's plugin system
- Superior performance (benchmarks show 2-3x Express throughput)
- Built-in TypeScript support and serialization
- Active community and stable release cadence

### ORM: Drizzle ORM

**Why Drizzle over Prisma/TypeORM**:
- TypeScript-first with zero-cost abstractions
- SQL-like syntax that maps directly to generated queries
- Superior migration tooling with `drizzle-kit`
- Smaller bundle size (no binary engine like Prisma)
- Better raw SQL escape hatch for the query engine

### Frontend: React 19 + Vite 6

**Why React 19**:
- Server components readiness for future SSR
- Concurrent features for responsive dashboard UI
- Largest ecosystem for BI component libraries
- TanStack Query for server state management

**Why Vite 6**:
- Fastest HMR for development experience
- ESM-native build pipeline
- Rollup-based production builds with tree shaking

### Charts: Apache ECharts 5

**Why ECharts over D3/Chart.js/Recharts**:
- 13+ chart types out of the box (including Sankey, Funnel, Heatmap, Treemap)
- GPU-accelerated rendering for large datasets
- Rich interaction (zoom, brush, tooltip)
- Active development with Apache governance
- Comprehensive theming system

### Cache: Redis 7 + In-Memory

**Why multi-layer cache**:
- L1 (in-memory): Sub-millisecond reads for hot data, per-process
- L2 (Redis): Shared cache across server instances, persistent across restarts
- Cache key based on query hash ensures consistency
- TTL-based expiration with scheduled refresh override

### Queue: BullMQ

**Why BullMQ over Agenda/pg-boss**:
- Redis-backed (reuses existing Redis infrastructure)
- Reliable job processing with at-least-once delivery
- Priority queues, rate limiting, delayed jobs
- Dashboard UI available (`bull-board`)
- Horizontal scaling with multiple workers

### Auth: jose + argon2

**Why jose over jsonwebtoken**:
- Web Crypto API compatible (works in Edge runtimes)
- Modern API with Promise-based interface
- Smaller bundle, faster operations
- Supports JWE (encrypted tokens) for future needs

**Why argon2 over bcrypt**:
- Winner of the Password Hashing Competition (PHC)
- Memory-hard (resistant to GPU attacks)
- Configurable parallelism and memory cost
- Recommended by OWASP

---

## 5. Key Design Patterns

### Hexagonal Architecture (Ports and Adapters)

Meridian uses hexagonal architecture in the `@meridian/core` package:

```
                    +-------------------------------+
                    |        Application Core       |
                    |                               |
  Inbound Ports     |   Domain Models               |   Outbound Ports
  (interfaces)  --->|   (User, Dashboard, Question) |---> (interfaces)
                    |                               |
  API Routes        |   Domain Services             |   Repositories
  WebSocket     --->|   (UserService, etc.)         |---> Database
  CLI               |                               |   Cache
                    |   Business Rules              |   External APIs
                    +-------------------------------+
```

**Port interfaces** (in `packages/core/src/ports/`):
- `user.repository.ts` -- data access contract
- `dashboard.repository.ts` -- data access contract
- `datasource.repository.ts` -- data access contract
- `question.repository.ts` -- data access contract
- `metric.repository.ts` -- data access contract
- `organization.repository.ts` -- data access contract

**Adapters** (implementations):
- `@meridian/db` repositories (Drizzle ORM adapter)
- `apps/server` in-memory stores (test/dev adapter)

### Domain-Driven Design (DDD)

Domain models are rich objects with behavior, not anemic data structures:

```typescript
// Domain model with business logic
class Dashboard {
  addCard(params): Result<Dashboard>     // enforces card limit, validates position
  removeCard(cardId): Result<Dashboard>  // validates card existence
  moveCard(cardId, pos): Result<Dashboard>  // validates bounds
  reorderCards(ids): Result<Dashboard>    // validates all IDs exist
  updateMetadata(dto): Result<Dashboard> // validates name length
}
```

Key DDD concepts used:
- **Entities** with identity (User, Dashboard, Question, DataSource)
- **Value Objects** (CardPosition, CardSize, DashboardLayout, VisualizationConfig)
- **Aggregate Roots** (Dashboard owns its Cards and Filters)
- **Domain Events** (defined in `packages/core/src/events/`)
- **Repository Pattern** (ports define contracts, adapters implement)

### Result Type (Railway-Oriented Programming)

All operations that can fail return `Result<T>` instead of throwing exceptions:

```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: MeridianError };

// Usage
const result = Dashboard.create({ name, organizationId, createdBy });
if (!result.ok) {
  return err(result.error);  // propagate error
}
const dashboard = result.value;  // type-safe access
```

Benefits:
- Compile-time error handling (cannot forget to check errors)
- Composable operations (chain `Result` values)
- No exception-based control flow
- Clear error types with error codes

### Dependency Injection (Service Container)

The server uses a DI container pattern for service composition:

```typescript
interface ServiceContainer {
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
```

Container creation is async to support dynamic module loading:

```typescript
const container = await createContainerAsync({ config });
```

---

## 6. Database Schema

Meridian's metadata is stored in PostgreSQL using 10 Drizzle ORM tables:

```
+------------------+       +------------------+       +------------------+
| organizations    |<------| users            |       | roles            |
|------------------|       |------------------|       |------------------|
| id (PK)          |       | id (PK)          |       | id (PK)          |
| name             |       | email            |       | name             |
| created_at       |       | name             |       | permissions[]    |
| updated_at       |       | password_hash    |       | organization_id  |
+------------------+       | avatar_url       |       +------------------+
        |                  | organization_id  |
        |                  | role_id (FK)     |
        |                  | status           |
        |                  | last_login_at    |
        |                  | created_at       |
        |                  +------------------+
        |
        |
+-------+----------+       +------------------+       +------------------+
| datasources      |<------| questions        |       | dashboards       |
|------------------|       |------------------|       |------------------|
| id (PK)          |       | id (PK)          |       | id (PK)          |
| name             |       | name             |       | name             |
| type             |       | description      |       | description      |
| host             |       | type (visual/sql)|       | organization_id  |
| port             |       | datasource_id    |       | created_by       |
| database         |       | query (jsonb)    |       | is_public        |
| credentials      |       | visualization    |       | layout (jsonb)   |
| options (jsonb)  |       | organization_id  |       | filters (jsonb)  |
| organization_id  |       | created_by       |       | created_at       |
| status           |       | collection_id    |       | updated_at       |
| created_at       |       | cached_result    |       +------------------+
| updated_at       |       | cache_expires_at |               |
+------------------+       | created_at       |               |
                           | updated_at       |       +-------+----------+
                           +------------------+       | dashboard_cards  |
                                                      |------------------|
                                                      | id (PK)          |
+------------------+       +------------------+       | dashboard_id(FK) |
| audit_logs       |       | cache_entries    |       | question_id (FK) |
|------------------|       |------------------|       | position (jsonb) |
| id (PK)          |       | id (PK)          |       | size (jsonb)     |
| user_id          |       | key              |       | title            |
| action           |       | value (jsonb)    |       +------------------+
| resource_type    |       | expires_at       |
| resource_id      |       | created_at       |
| metadata (jsonb) |       +------------------+       +------------------+
| ip_address       |                                  | plugin_registry  |
| user_agent       |                                  |------------------|
| created_at       |                                  | id (PK)          |
+------------------+                                  | name             |
                                                      | version          |
                                                      | type             |
                                                      | description      |
                                                      | enabled          |
                                                      | config (jsonb)   |
                                                      | loaded_at        |
                                                      +------------------+
```

---

## 7. API Route Structure

All API routes are defined in `apps/server/src/routes/` as Fastify route modules.

### Route Files

| File | Prefix | Description |
|------|--------|-------------|
| `auth.routes.ts` | `/api/auth` | Authentication (register, login, refresh, logout, me) |
| `datasources.routes.ts` | `/api/datasources` | Data source CRUD, test, schema |
| `questions.routes.ts` | `/api/questions` | Question CRUD, execute, preview |
| `dashboards.routes.ts` | `/api/dashboards` | Dashboard CRUD, cards, filters, share |
| `users.routes.ts` | `/api/users` | User CRUD, roles, activation |
| `plugins.routes.ts` | `/api/plugins` | Plugin list, install, enable, disable |
| `embed.routes.ts` | `/api/embed` | Embed token generation, embedded dashboards/questions |
| `export.routes.ts` | `/api/export` | Export questions/dashboards (CSV, JSON, XLSX, PDF, PNG) |
| `admin.routes.ts` | `/api/admin` | Admin settings, audit logs, system info |
| `semantic.routes.ts` | `/api/semantic` | Semantic layer (metrics, models) |

### Request/Response Envelope

All API responses follow a consistent envelope pattern:

```json
// Success
{
  "ok": true,
  "data": { ... },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-03-17T12:00:00Z"
  }
}

// Error
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Dashboard not found",
    "details": { ... }
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-03-17T12:00:00Z"
  }
}
```

### Middleware Stack

Requests pass through this middleware chain:

```
Request
  -> Request ID (UUID generation)
  -> Request Logger (structured logging)
  -> CORS (origin validation)
  -> Rate Limiter (per-endpoint limits)
  -> Compression (gzip/brotli)
  -> Authentication (JWT verification, except public routes)
  -> Authorization (RBAC permission check)
  -> Audit (log action for compliance)
  -> Route Handler
  -> Error Handler (sanitized error response)
```

---

## 8. WebSocket Protocol

The real-time system in `@meridian/realtime` provides live dashboard updates.

### Connection Flow

```
Client                          Server
  |                               |
  |--- WS Connect -------------->|
  |    (with JWT in query param)  |
  |                               |-- Verify JWT
  |                               |-- Register client
  |<-- Connection ACK ------------|
  |                               |
  |--- Subscribe ---------------->|
  |    { type: "subscribe",       |
  |      channel: "dashboard:123"}|
  |                               |-- Add to channel
  |<-- Subscription Confirmed ----|
  |                               |
  |<-- Data Update ---------------|  (triggered by cache refresh)
  |    { type: "data_update",     |
  |      channel: "dashboard:123",|
  |      payload: { ... } }      |
  |                               |
  |--- Unsubscribe -------------->|
  |    { type: "unsubscribe",     |
  |      channel: "dashboard:123"}|
  |                               |
  |--- Disconnect --------------->|
  |                               |-- Cleanup subscriptions
```

### Message Types

| Type | Direction | Purpose |
|------|-----------|---------|
| `subscribe` | Client -> Server | Subscribe to a dashboard or question channel |
| `unsubscribe` | Client -> Server | Unsubscribe from a channel |
| `ping` | Client -> Server | Keep-alive |
| `connection_ack` | Server -> Client | Connection established |
| `subscription_confirmed` | Server -> Client | Subscription active |
| `data_update` | Server -> Client | Fresh data available |
| `error` | Server -> Client | Error message |
| `pong` | Server -> Client | Keep-alive response |

### Channel Naming Convention

```
dashboard:{dashboardId}          -- Dashboard-level updates
question:{questionId}            -- Individual question updates
datasource:{datasourceId}:schema -- Schema change notifications
system:notifications             -- System-wide broadcasts
```

### Components

| Component | File | Responsibility |
|-----------|------|---------------|
| `WsServer` | `ws-server.ts` | WebSocket server lifecycle, connection handling |
| `ChannelManager` | `channel-manager.ts` | Channel subscriptions, message routing |
| `ClientRegistry` | `client-registry.ts` | Connected client tracking, authentication state |
| `MessageHandler` | `message-handler.ts` | Message parsing, dispatch to handlers |
| `MessageSerializer` | `message-serializer.ts` | JSON serialization/deserialization |

---

## 9. Plugin System Architecture

The plugin system in `@meridian/plugins` enables runtime extensibility.

### Extension Points

```
+---------------------+
|   Plugin Loader     |  -- discovers and loads plugins from filesystem/registry
+---------+-----------+
          |
          v
+---------------------+
|  Plugin Registry    |  -- manages plugin lifecycle (register, enable, disable)
+---------+-----------+
          |
          v
+---------------------+
|  Plugin Context     |  -- sandbox for plugin execution, provides API surface
+---------+-----------+
          |
    +-----+-----+-----+-----+
    |           |           |           |
    v           v           v           v
Connector   Visualization  Transform   Route
Extension    Extension     Extension   Extension
```

### Plugin Interface

```typescript
interface MeridianPlugin {
  name: string;
  version: string;
  type: 'connector' | 'visualization' | 'transformation' | 'route';
  description: string;
  author?: string;
  entryPoint: string;

  register(context: PluginContext): void | Promise<void>;
}
```

### Plugin Context API

Plugins receive a `PluginContext` that provides safe access to Meridian internals:

```typescript
interface PluginContext {
  logger: Logger;                              // Scoped logger
  registerConnector(connector: Connector): void;
  registerVisualization(viz: Visualization): void;
  registerTransformation(transform: Transform): void;
  registerRoute(route: RouteDefinition): void;
  getConfig(key: string): unknown;
  emitEvent(event: PluginEvent): void;
}
```

### Plugin Lifecycle

1. **Discovery**: Plugin loader scans registered plugins
2. **Validation**: Manifest validated against schema (name, version, type, entryPoint)
3. **Loading**: Dynamic `import()` of plugin entry point
4. **Registration**: Plugin's `register()` called with sandboxed context
5. **Activation**: Plugin enabled in registry, extensions become active
6. **Deactivation**: Plugin disabled, extensions removed from active set

---

## 10. Query Engine Pipeline

The query engine in `@meridian/query-engine` translates visual queries into optimized,
dialect-specific SQL.

### Pipeline Stages

```
VisualQuery (UI representation)
    |
    v
[Translator]  packages/query-engine/src/translator/
    |          Converts VisualQuery to AbstractQuery (IR)
    v
AbstractQuery (Intermediate Representation)
    |
    v
[Optimizer]   packages/query-engine/src/optimizer/
    |          Applies optimization passes:
    |          - Predicate pushdown
    |          - Column pruning
    |          - Join reordering
    v
Optimized AbstractQuery
    |
    v
[Generator]   packages/query-engine/src/generator/
    |          Generates SQL from IR using dialect
    v
SQL String + Parameters
    |
    v
[Executor]    packages/query-engine/src/executor/
              Sends SQL to connector, returns typed results
```

### Supported SQL Dialects

| Dialect | File | Key Differences |
|---------|------|-----------------|
| PostgreSQL | `dialects/postgresql.dialect.ts` | `LIMIT/OFFSET`, `::type` casting, `ILIKE`, `date_trunc()` |
| MySQL | `dialects/mysql.dialect.ts` | `LIMIT x, y`, backtick quoting, `DATE_FORMAT()`, `TIMESTAMPDIFF()` |
| SQLite | `dialects/sqlite.dialect.ts` | `LIMIT`, `strftime()`, `julianday()`, `IIF` |
| ClickHouse | `dialects/clickhouse.dialect.ts` | `toStartOf*()`, `dateDiff()`, `SAMPLE`, `PREWHERE` |
| DuckDB | `dialects/duckdb.dialect.ts` | `date_trunc()`, `read_parquet()`, `QUALIFY`, `PIVOT` |

### Intermediate Representation (IR)

The IR in `packages/query-engine/src/ir/` provides a database-agnostic query model:

```typescript
interface AbstractQuery {
  select: SelectExpression[];
  from: FromClause;
  joins?: JoinClause[];
  where?: WhereClause;
  groupBy?: GroupByClause;
  having?: HavingClause;
  orderBy?: OrderByClause;
  limit?: number;
  offset?: number;
  aggregations?: Aggregation[];
}
```

---

## 11. Caching Strategy

### Multi-Layer Cache Architecture

```
Request
    |
    v
[L1 Cache - In-Memory]
    |-- HIT: return immediately (sub-ms latency)
    |
    v (MISS)
[L2 Cache - Redis]
    |-- HIT: populate L1, return (~1-5ms latency)
    |
    v (MISS)
[Data Source Query]
    |-- Execute query (~10-1000ms)
    |-- Store in L2 (Redis) with TTL
    |-- Store in L1 (in-memory) with shorter TTL
    |-- Return result
```

### Cache Key Strategy

Cache keys are computed from a hash of:
- Query definition (SQL or VisualQuery JSON)
- Query parameters
- Connector configuration (host, database)
- User context (for RLS-filtered queries)

```
cache_key = sha256(query + params + connector_config + user_context)
```

### Cache Invalidation

| Trigger | Action |
|---------|--------|
| TTL expiration | Automatic eviction from L1/L2 |
| Scheduled refresh | Worker re-executes query, updates cache, broadcasts via WebSocket |
| Manual refresh | User clicks refresh, bypasses cache |
| Schema change | Invalidate all queries for affected data source |
| Data source update | Invalidate all cached queries for that source |

### Components

| Component | File | Purpose |
|-----------|------|---------|
| `MultiLayerCache` | `multi-layer-cache.ts` | Orchestrates L1/L2 reads and writes |
| `CacheKey` | `cache-key.ts` | Deterministic cache key generation |
| Providers | `providers/` | In-memory and Redis cache provider implementations |
| Decorators | `decorators/` | Method-level caching via decorators |

---

## 12. Authentication and Authorization

### Authentication Flow

```
[Registration]
    |
    v
Password -> argon2id hash -> stored in DB
    |
    v
[Login]
    |
    v
Verify password (argon2id)
    |
    v
Generate token pair:
  - Access token (short-lived, e.g. 15min)
  - Refresh token (long-lived, e.g. 7 days)
    |
    v
[API Request]
    |
    v
JWT middleware extracts Bearer token
    |
    v
Verify signature + expiration (jose)
    |
    v
Decode payload: { sub, email, orgId, roleId, permissions[] }
    |
    v
Attach to request context
```

### Authorization Layers

```
[Layer 1: Authentication]
    Is the user logged in? (JWT valid?)
        |
        v
[Layer 2: RBAC]
    Does the user's role have the required permission?
    Permissions: dashboard:read, dashboard:write, datasource:admin, etc.
        |
        v
[Layer 3: Row-Level Security (RLS)]
    What data is this user allowed to see?
    Filters query results based on user attributes (org, team, etc.)
```

### Auth Package Structure

| Directory | Purpose |
|-----------|---------|
| `jwt/` | Token generation, verification, refresh |
| `password/` | Argon2 hashing, verification, strength validation |
| `rbac/` | Role definitions, permission checking |
| `rls/` | Row-level security policy engine |
| `session/` | Session management and storage |
| `sso/` | SSO provider interface (OIDC, SAML, OAuth) |
| `middleware/` | Fastify auth middleware hooks |
| `errors/` | Auth-specific error types |
