# Meridian

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/meridian/meridian/pulls)

**The TypeScript-native BI platform for modern data teams**

Meridian is a self-hosted, open-source business intelligence and data analytics platform built entirely in TypeScript. It fills the gap where no production-grade BI tool exists in the TypeScript ecosystem, combining the ease of use of Metabase with the analytical power of Apache Superset in a modern, real-time, embeddable architecture.

## Why Meridian?

The BI landscape is dominated by tools built in other languages:
- **Metabase** (Clojure) — Easy to use, but limited at scale and hard to extend
- **Superset** (Python) — Powerful analytics, but complex to self-host and extend
- **Redash** (Python) — Great for SQL teams, but development has stagnated

**Meridian** is different. It's:

- **TypeScript-native**: Full stack in TypeScript — backend, frontend, SDK, CLI. No language barriers. Contribute to the exact same codebase you use.
- **Real-time first**: WebSocket-based live dashboards, not polling. See data updates instantly.
- **Embeddable**: First-class embedded analytics SDK with React components and Web Components. Free in the open-source core.
- **AI-native**: Built-in NL-to-SQL query generation, auto-insights, and anomaly detection.
- **Developer-friendly**: Code-first API with a beautiful visual UI on top. Git-based version control for dashboards.
- **Zero-ops self-hosting**: Single Docker command to get started. SQLite for dev, PostgreSQL for production.

## Features

### Data Connectivity
- **7 Database Connectors**: PostgreSQL, MySQL, SQLite, ClickHouse, BigQuery, Snowflake, DuckDB
- **Flexible Query Layer**: Connect any SQL-compatible data source
- **Connection Pooling**: Optimized for high-concurrency environments

### Query Engine
- **Visual Query Builder**: Drag-and-drop interface for non-technical users
- **SQL Editor**: For power users who prefer writing SQL directly
- **Multi-dialect Support**: PostgreSQL, MySQL, ClickHouse, BigQuery, Snowflake SQL dialects
- **Query Optimization**: Automatic query rewriting and caching by query hash
- **Type Safety**: Full end-to-end type safety from query to results

### Visualization & Dashboards
- **13+ Chart Types**: Line, Bar, Scatter, Pie, Gauge, Heatmap, Funnel, Sankey, and more
- **Apache ECharts Integration**: Beautiful, performant charts
- **Real-time Dashboards**: WebSocket-powered live updates
- **Drag-and-drop Dashboard Builder**: Arrange and resize visualizations instantly
- **Dashboard Filters**: Dynamic filtering across multiple questions
- **Scheduled Refresh**: Cron-based data refresh with BullMQ background jobs

### Authentication & Security
- **JWT + Session-based Auth**: Secure token management with Argon2 password hashing
- **Role-based Access Control (RBAC)**: Fine-grained permissions at team and dashboard level
- **Row-Level Security (RLS)**: Restrict data visibility based on user attributes
- **SSO Integration**: OIDC, SAML, and OAuth support
- **Multi-tenant Ready**: Built for SaaS deployments

### Embedded Analytics SDK
- **React Components**: Drop charts directly into your app
- **Web Components**: Framework-agnostic, works in any web app
- **Flexible Theming**: Match your brand's design system
- **Same-origin + CORS Support**: Works in embedded and cross-origin scenarios

### Plugin System
- **Extensible Architecture**: Add custom connectors, visualizations, transformations
- **4 Extension Points**:
  - Connectors (new data sources)
  - Visualizations (new chart types)
  - Transformations (data processing steps)
  - API Routes (custom endpoints)
- **Sandbox Execution**: Safe plugin isolation

### Command-line Interface (CLI)
- **Dashboard Management**: Export/import dashboards and queries
- **Data Pipeline Orchestration**: Trigger queries and refresh operations
- **Automation**: Script common operations

### Background Jobs
- **BullMQ-powered Queue**: Reliable job processing with retries
- **Heavy Lifting**: Export generation, data refresh, transformation execution
- **Scalable Workers**: Horizontal scaling for high-volume operations

## Architecture

Meridian is organized as a **Turborepo + pnpm monorepo** with strict package boundaries and clear separation of concerns.

```
Meridian
├── apps/                          # 4 deployable applications
│   ├── web/                       # React 19 + Vite dashboard frontend
│   ├── server/                    # Fastify 5 API server (REST + WebSocket)
│   ├── cli/                       # Commander.js CLI tool
│   └── worker/                    # BullMQ background job processor
│
└── packages/                      # 14 reusable, independently testable packages
    ├── @meridian/core             # Domain models, business logic
    ├── @meridian/db               # Drizzle ORM schema, migrations, repositories
    ├── @meridian/query-engine     # SQL generation, optimization, execution
    ├── @meridian/connectors       # Database connector implementations
    ├── @meridian/viz              # Chart components (Apache ECharts wrappers)
    ├── @meridian/auth             # JWT, RBAC, RLS, SSO/SAML/OIDC
    ├── @meridian/realtime         # WebSocket engine for live updates
    ├── @meridian/sdk              # Embeddable analytics client SDK
    ├── @meridian/plugins          # Plugin system API and loader
    ├── @meridian/cache            # Multi-layer caching (in-memory + Redis)
    ├── @meridian/scheduler        # Cron-like job scheduling
    ├── @meridian/ui               # Shared React component library
    ├── @meridian/shared           # Shared types, utils, constants
    └── @meridian/config           # Shared ESLint, TypeScript, Tailwind configs
```

### Data Flow

```
Data Source
    ↓
Connector (with SQLDialect)
    ↓
Query Engine (visual → IR → SQL)
    ↓
Cache (Redis + in-memory)
    ↓
API Server (Fastify REST + WebSocket)
    ↓
Frontend (React Dashboard) + SDK (Embedded Apps)
    ↓
Scheduler triggers refresh → Worker executes → Cache updates → WebSocket broadcast
```

## Quick Start

### Prerequisites

- **Node.js 20+** (Check with `node --version`)
- **pnpm 9.15+** (Install with `npm install -g pnpm`)
- **Docker & Docker Compose** (For PostgreSQL + Redis)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/meridian/meridian.git
   cd meridian
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set required values (see [Environment Variables](#environment-variables) section).

4. **Start PostgreSQL and Redis**
   ```bash
   docker-compose up -d postgres redis
   ```

5. **Run database migrations**
   ```bash
   pnpm --filter @meridian/db migrate
   ```

6. **Start development servers**
   ```bash
   pnpm dev
   ```

   This starts:
   - **Frontend**: http://localhost:5173
   - **API Server**: http://localhost:3001
   - **WebSocket**: ws://localhost:3001

7. **Open the dashboard**
   Navigate to [http://localhost:5173](http://localhost:5173) and sign in with default credentials (see setup wizard).

## Development

### Common Commands

```bash
# Install dependencies
pnpm install

# Development (all apps and packages)
pnpm dev

# Development (specific app)
pnpm --filter @meridian/web dev
pnpm --filter @meridian/server dev
pnpm --filter @meridian/cli dev

# Build all
pnpm build

# Build specific package
pnpm --filter @meridian/core build

# Test all (with cache busting)
pnpm test --no-cache

# Test specific package
pnpm --filter @meridian/query-engine test -- --no-cache

# Test single file
pnpm --filter @meridian/core vitest run src/models/dashboard.test.ts --no-cache

# Lint all
pnpm lint

# Lint and fix
pnpm lint:fix

# Type check
pnpm typecheck

# Format code
pnpm format
```

### Working with Specific Packages

Each package is independently testable and buildable:

```bash
# Work on the query engine
cd packages/query-engine
pnpm dev
pnpm test

# Work on the auth package
cd packages/auth
pnpm dev
pnpm test

# Work on the web app
cd apps/web
pnpm dev
```

### Database Management

```bash
# Run migrations
pnpm --filter @meridian/db migrate

# Generate migration files
pnpm --filter @meridian/db generate

# Open Drizzle Studio (GUI for database)
pnpm --filter @meridian/db studio
```

### Project-specific Conventions

- **Naming**: camelCase for variables/functions, PascalCase for types/classes/components
- **Exports**: Named exports only (no default exports)
- **File naming**: kebab-case for files (`query-engine.ts`), PascalCase for React components
- **Testing**: Co-located test files (`foo.ts` → `foo.test.ts`), integration tests in `__tests__/`
- **Error handling**: Custom error classes extending `MeridianError` with error codes
- **Validation**: Zod schemas at all API boundaries
- **Commits**: Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`)

## Docker Deployment

### Development with Docker Compose

```bash
docker-compose -f docker-compose.dev.yml up
```

This runs PostgreSQL, Redis, and the development servers.

### Production Deployment

1. **Set environment variables in `.env`**:
   ```bash
   cp .env.example .env
   # Edit .env with production values
   ```

2. **Start all services**:
   ```bash
   docker-compose up -d
   ```

   This starts:
   - PostgreSQL (metadata store)
   - Redis (cache + job queue)
   - Fastify API server
   - Background job worker
   - React web frontend (served via Nginx)

3. **View logs**:
   ```bash
   docker-compose logs -f server
   docker-compose logs -f worker
   ```

4. **Stop services**:
   ```bash
   docker-compose down
   ```

### Environment Variables

See [.env.example](./.env.example) for the complete list of environment variables.

**Essential variables**:

```env
# PostgreSQL
DATABASE_URL=postgresql://user:password@postgres:5432/meridian
POSTGRES_USER=meridian
POSTGRES_PASSWORD=changeme

# Redis
REDIS_URL=redis://redis:6379
REDIS_PASSWORD=

# API Server
PORT=3001
JWT_SECRET=<generate-with-openssl-rand-base64-64>
LOG_LEVEL=info

# Frontend
WEB_PORT=80
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001

# CORS
CORS_ORIGIN=http://localhost
```

**Optional features**:
- OIDC/SAML SSO
- SMTP email notifications
- S3 exports storage
- OpenAI NL-to-SQL
- OpenTelemetry observability

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Monorepo** | Turborepo + pnpm | Latest |
| **Backend** | Fastify | 5.x |
| **Frontend** | React + Vite | 19 + 6 |
| **Styling** | TailwindCSS | 4.x |
| **Database** | PostgreSQL | 16+ |
| **Cache/Queue** | Redis + BullMQ | 7+ |
| **ORM** | Drizzle ORM | Latest |
| **Language** | TypeScript | 5.7+ |
| **Charts** | Apache ECharts | 5.x |
| **Auth** | jose (JWT) + argon2 | Latest |
| **Testing** | Vitest + Playwright | Latest |
| **Linting** | ESLint 9 (flat config) + Prettier | Latest |
| **Validation** | Zod | 3.x |

## Contributing

We welcome contributions from the community! Here's how to get started:

1. **Fork the repository** on GitHub
2. **Create a feature branch**: `git checkout -b feature/your-feature`
3. **Make your changes** and write tests
4. **Run tests locally**: `pnpm test --no-cache`
5. **Commit using Conventional Commits**: `git commit -m "feat: add new feature"`
6. **Push and open a PR** against the `main` branch

### Development Guidelines

- Write tests for new features (target: 80%+ coverage)
- Ensure all tests pass: `pnpm test --no-cache`
- Follow the project's TypeScript and ESLint rules
- Keep commits focused and descriptive
- Update documentation as needed

## License

This project is licensed under the **MIT License** — see [LICENSE](./LICENSE) for details.

---

**Questions?** Open an issue on GitHub or check out the [documentation](./docs).

**Want to contribute?** See [CONTRIBUTING.md](./CONTRIBUTING.md).
