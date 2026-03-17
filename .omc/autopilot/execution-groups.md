# Execution Groups — Parallel Agent Assignment

## Group 0: Monorepo Scaffold (1 executor-high)
- Root package.json, turbo.json, tsconfig.base.json
- pnpm-workspace.yaml
- .gitignore, .prettierrc, .editorconfig
- All package directories with package.json + tsconfig.json stubs
- Docker and docker-compose.yml
- Root scripts (dev, build, test, lint, typecheck)

## Group A: Tier 0 Packages (2 parallel executors)
### Agent A1: @meridian/config
- ESLint flat config (eslint.config.mjs)
- TypeScript base configs (base, node, react)
- Vitest shared config
- Tailwind v4 preset
- Prettier config
- ~1K LOC

### Agent A2: @meridian/shared
- Error types (MeridianError hierarchy)
- Result type (Ok/Err pattern)
- Zod schema helpers
- Date/string/number utils
- Logger abstraction (pino)
- Constants (HTTP status, error codes)
- Event types (for realtime)
- ~3K LOC + tests

## Group B: Tier 1 Packages (2 parallel executors)
### Agent B1: @meridian/core
- Domain models: DataSource, Question, Dashboard, DashboardCard, Visualization
- Domain models: User, Role, Permission, Organization
- Domain models: Plugin, Metric, SemanticLayer
- Value objects, enums
- Repository interfaces (ports)
- Service interfaces
- ~5K LOC + tests

### Agent B2: @meridian/cache
- CacheProvider interface
- InMemoryCacheProvider (LRU)
- RedisCacheProvider (ioredis)
- Cache key generation (hash-based)
- TTL management
- Cache invalidation patterns
- ~2K LOC + tests

## Group C: Tier 2 Packages (5 parallel executors)
### Agent C1: @meridian/db
- Drizzle schema definitions (all tables)
- Migration setup
- Repository implementations
- Seed data
- ~8K LOC + tests

### Agent C2: @meridian/connectors
- Connector interface + base class
- PostgreSQL connector
- MySQL connector
- SQLite connector
- ClickHouse connector
- DuckDB connector
- BigQuery connector (stub)
- Snowflake connector (stub)
- Connection pooling
- ~10K LOC + tests

### Agent C3: @meridian/realtime
- WebSocket server (ws)
- Channel/subscription management
- Message types and serialization
- Heartbeat / reconnection
- Auth integration
- ~3K LOC + tests

### Agent C4: @meridian/plugins
- Plugin interface and types
- PluginLoader (dynamic import)
- PluginRegistry
- PluginContext (sandbox)
- Built-in plugin: CSV import
- ~3K LOC + tests

### Agent C5: @meridian/ui
- Design tokens / theme
- Button, Input, Select, Modal, Dropdown
- Table, Pagination
- Card, Badge, Avatar
- Toast/notification system
- Layout components (Sidebar, Header, Content)
- Form components with Zod integration
- ~8K LOC + tests

## Group D: Tier 3 Packages (4 parallel executors)
### Agent D1: @meridian/query-engine
- VisualQuery → AbstractQuery → SQL pipeline
- SQL dialect abstraction
- PostgreSQL dialect
- MySQL dialect
- Query optimizer (basic)
- Parameter binding
- Result transformation
- ~8K LOC + tests

### Agent D2: @meridian/auth
- JWT token management (jose)
- Password hashing (argon2)
- Session management
- RBAC engine
- Row-level security engine
- Auth middleware for Fastify
- SSO/SAML/OIDC stubs
- ~5K LOC + tests

### Agent D3: @meridian/scheduler
- Job definition and registry
- Cron expression parser
- Job queue (BullMQ integration)
- Data refresh scheduler
- Job status tracking
- ~3K LOC + tests

### Agent D4: @meridian/viz
- Chart type registry
- ECharts wrapper components
- Chart types: Bar, Line, Area, Pie, Donut, Scatter
- Chart types: Table, Number, Gauge, Funnel
- Chart types: Map (choropleth), Treemap, Heatmap
- Chart config builder
- Responsive container
- ~8K LOC + tests

## Group E: Tier 4 Package (1 executor)
### Agent E1: @meridian/sdk
- MeridianEmbed class
- React components: <MeridianDashboard>, <MeridianQuestion>
- Web component wrappers
- Auth token management
- Theming/styling API
- ~4K LOC + tests

## Group F: Tier 5 Apps (4 parallel executors)
### Agent F1: apps/server
- Fastify app setup
- Route modules (auth, datasources, questions, dashboards, users, plugins)
- Middleware (auth, cors, rate-limit, logging)
- WebSocket upgrade handling
- Error handling
- OpenAPI spec generation
- ~12K LOC + tests

### Agent F2: apps/worker
- BullMQ worker setup
- Job handlers: query execution, export, refresh
- Health check endpoint
- Graceful shutdown
- ~3K LOC + tests

### Agent F3: apps/web
- Vite + React 19 setup
- Routing (TanStack Router)
- Auth pages (login, register)
- Dashboard list/detail/editor
- Question builder (visual + SQL)
- Data source management
- User/role management
- Settings
- ~15K LOC + tests

### Agent F4: apps/cli
- Commander.js setup
- Commands: datasource (add/list/test), query (run/export)
- Commands: dashboard (list/export/import)
- Commands: user (create/list/delete)
- Commands: server (start/stop/status)
- Config file management
- ~3K LOC + tests

## Total Estimated LOC
- Packages: ~58K
- Apps: ~33K
- Config/scaffold: ~2K
- Tests: ~15K (within above estimates)
- **Total: ~93K LOC** (will exceed 100K with full implementations)
