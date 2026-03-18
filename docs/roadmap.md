# Meridian - Development Roadmap

Priority-ranked improvement plan based on the [Completeness Analysis](./completeness-analysis.md).

---

## Table of Contents

- [Priority Levels](#priority-levels)
- [P0 -- Critical (Must Fix)](#p0--critical-must-fix)
- [P1 -- High Priority](#p1--high-priority)
- [P2 -- Medium Priority](#p2--medium-priority)
- [P3 -- Nice to Have](#p3--nice-to-have)
- [Timeline Estimate](#timeline-estimate)

---

## Priority Levels

| Level | Meaning | Criteria |
|-------|---------|----------|
| **P0** | Critical | Blocks production deployment or causes data loss |
| **P1** | High | Significant quality or reliability gap |
| **P2** | Medium | Feature completeness or developer experience improvement |
| **P3** | Nice to Have | Polish, optimization, or future capability |

---

## P0 -- Critical (Must Fix)

These items must be resolved before any production deployment.

### 1. Wire Drizzle ORM Repositories into Server DI Container

**Problem**: The server's `createContainerAsync()` in `apps/server/src/services/container.ts`
creates in-memory `Map`-based stores for all entities. The `@meridian/db` package has full
Drizzle ORM repositories (`user.repository.ts`, `dashboard.repository.ts`, etc.) that are
never used at runtime.

**Impact**: All data is lost on server restart. No production deployment is possible.

**Solution**:
1. Import Drizzle repositories from `@meridian/db` into the container factory
2. Initialize a Drizzle database connection using `DATABASE_URL` from config
3. Replace each `InMemoryStore` with the corresponding Drizzle repository
4. Adapt repository interfaces to match the `ServiceContainer` type contracts
5. Keep `InMemoryStore` as a fallback for test environments only

**Estimated effort**: 2-3 days

---

### 2. Implement Real Health Check Endpoint

**Problem**: The `/health` endpoint returns hardcoded success values without testing
actual service connectivity.

**Impact**: Container orchestrators (Docker, Kubernetes) cannot detect unhealthy instances.
Load balancers will route traffic to broken servers.

**Solution**:
1. Test PostgreSQL connectivity with a simple `SELECT 1` query
2. Test Redis connectivity with a `PING` command
3. Check BullMQ worker queue status
4. Return degraded status if any dependency is unreachable
5. Include response latency for each check

**Response format**:
```json
{
  "status": "healthy | degraded | unhealthy",
  "timestamp": "2026-03-17T12:00:00Z",
  "checks": {
    "database": { "status": "up", "latencyMs": 5 },
    "redis": { "status": "up", "latencyMs": 2 },
    "worker": { "status": "up", "queueDepth": 3 }
  }
}
```

**Estimated effort**: 0.5 days

---

### 3. Add GitHub Actions CI Pipeline

**Problem**: No automated testing, type checking, or build verification on pushes or PRs.
Broken code can be merged without detection.

**Impact**: Regressions go unnoticed. Contributors have no feedback loop.

**Solution**: Create `.github/workflows/ci.yml` with:
1. `pnpm typecheck` -- full type checking across all packages
2. `pnpm lint` -- ESLint validation
3. `pnpm test --no-cache` -- run all 2,293+ tests
4. `pnpm build` -- verify all packages build successfully
5. Matrix strategy for Node 20.x and 22.x
6. Cache pnpm store for faster CI runs

**Estimated effort**: 0.5 days

---

### 4. ~~Create LICENSE File~~ (COMPLETED)

MIT LICENSE file has been created at project root. Copyright (c) 2026 Meridian Contributors.

---

## P1 -- High Priority

These items significantly improve reliability and developer experience.

### 5. Add CLI Test Suite

**Problem**: `apps/cli` has zero test files. The CLI is a user-facing tool that handles
dashboard export/import, query execution, and pipeline orchestration.

**Impact**: CLI regressions are undetectable. Users may encounter broken commands.

**Solution**:
1. Add unit tests for each CLI command (Commander.js action handlers)
2. Test argument parsing and validation
3. Test output formatting (JSON, table)
4. Mock API calls for isolated testing
5. Target: 50%+ coverage

**Estimated effort**: 2-3 days

---

### 6. Add Web App Tests

**Problem**: `apps/web` has approximately 12% test coverage. The frontend is the primary
user interface.

**Impact**: UI regressions, broken interactions, and layout issues go undetected.

**Solution**:
1. Add component tests for critical pages (Dashboard, Query Builder, Data Sources)
2. Add hook tests for data fetching and state management
3. Add utility function tests
4. Use Vitest with `@testing-library/react`
5. Target: 40%+ coverage initially

**Estimated effort**: 3-5 days

---

### 7. Add Core Service Tests

**Problem**: Domain models in `@meridian/core` have tests, but the service layer
(`dashboard.service.ts`, `datasource.service.ts`, `query-execution.service.ts`,
`question.service.ts`, `user.service.ts`) lacks direct unit tests.

**Impact**: Business logic regressions in service orchestration are undetectable.

**Solution**:
1. Add unit tests for each service method with mocked repository dependencies
2. Test error paths and edge cases
3. Test validation and business rule enforcement
4. Target: 70%+ coverage for services

**Estimated effort**: 2-3 days

---

### 8. Implement Real Database Migrations

**Problem**: While `@meridian/db` has `drizzle-kit` tooling configured, there is no
versioned migration directory with tracked schema changes.

**Impact**: Schema changes cannot be safely applied to existing databases. No rollback
capability.

**Solution**:
1. Generate initial migration from current schema using `drizzle-kit generate`
2. Create `packages/db/migrations/` directory with versioned SQL files
3. Add migration runner to server startup
4. Document migration workflow in deployment guide
5. Add migration CI check (ensure no pending migrations)

**Estimated effort**: 1-2 days

---

### 9. Add CONTRIBUTING.md

**Problem**: `README.md` links to `CONTRIBUTING.md` but the file does not exist.
Contributors have no guide for development workflow.

**Impact**: Higher barrier to contribution. Inconsistent code quality from external PRs.

**Solution**: Create comprehensive contributing guide covering development setup,
branch strategy, commit conventions, PR process, code style, and testing requirements.

**Estimated effort**: 0.5 days (see [docs/contributing.md](./contributing.md))

---

### 10. Wire Swagger/OpenAPI Documentation

**Problem**: Server has a `SWAGGER_ENABLED` config flag but no actual Swagger integration.
API consumers have no programmatic reference.

**Impact**: Frontend and SDK developers must read route source code to understand API contracts.

**Solution**:
1. Install `@fastify/swagger` and `@fastify/swagger-ui`
2. Generate OpenAPI spec from Zod route schemas (Fastify + Zod integration)
3. Serve Swagger UI at `/docs` when `SWAGGER_ENABLED=true`
4. Export OpenAPI JSON at `/docs/json`
5. Add to CI: validate OpenAPI spec is up-to-date

**Estimated effort**: 1-2 days

---

### 11. Add Pre-commit Hooks

**Problem**: No automatic linting or formatting enforcement before commits. Contributors
can commit code that fails lint checks.

**Impact**: Inconsistent code quality. CI failures that could have been caught locally.

**Solution**:
1. Install `husky` and `lint-staged`
2. Configure pre-commit hook to run:
   - `eslint --fix` on staged `.ts`/`.tsx` files
   - `prettier --write` on staged files
3. Configure `commit-msg` hook for Conventional Commits validation
4. Add setup instructions to CONTRIBUTING.md

**Estimated effort**: 0.5 days

---

### 12. Implement Real Audit Logging with DB Persistence

**Problem**: `audit.middleware.ts` exists in the server, and `audit-log.repository.ts`
exists in `@meridian/db`, but audit events are not persisted to the database.

**Impact**: No audit trail for compliance. Cannot investigate security incidents.

**Solution**:
1. Wire `AuditLogRepository` into the server DI container
2. Update audit middleware to persist events via the repository
3. Add admin API endpoint for querying audit logs
4. Include: user, action, resource, timestamp, IP address, user agent

**Estimated effort**: 1 day

---

## P2 -- Medium Priority

These items complete feature gaps and improve operational maturity.

### 13. Complete SSO Provider Implementations

**Problem**: Google and GitHub OAuth providers have stub `handleCallback` implementations.

**Solution**:
1. Implement Google OAuth callback with token exchange and profile fetch
2. Implement GitHub OAuth callback with token exchange and user API call
3. Add integration tests with mocked OAuth servers
4. Document SSO setup in deployment guide

**Estimated effort**: 2-3 days

---

### 14. Add E2E Tests with Playwright

**Problem**: Playwright is listed as a dependency but no E2E test files exist.

**Solution**:
1. Create `e2e/` directory at project root
2. Add test scenarios: login, create data source, build query, create dashboard
3. Configure Playwright to run against Docker Compose dev environment
4. Add to CI as a separate job (runs after unit tests pass)

**Estimated effort**: 3-5 days

---

### 15. Implement PDF/PNG Export

**Problem**: Export service has stub methods for PDF and PNG. Users cannot export
dashboards as static documents or images.

**Solution**:
1. Use Playwright (already a dependency) for headless rendering
2. Render dashboard to HTML, capture as PDF via `page.pdf()`
3. Capture as PNG via `page.screenshot()`
4. Queue export jobs via BullMQ worker for heavy dashboards
5. Store exports temporarily or in S3 (per `STORAGE_TYPE` config)

**Estimated effort**: 2-3 days

---

### 16. Add CHANGELOG.md

**Problem**: No changelog tracking version history or notable changes.

**Solution**:
1. Create `CHANGELOG.md` following Keep a Changelog format
2. Backfill major milestones from git history
3. Consider `changesets` or `conventional-changelog` for automation

**Estimated effort**: 0.5 days

---

### 17. Add Monitoring (OpenTelemetry)

**Problem**: `.env.example` defines `OTEL_EXPORTER_OTLP_ENDPOINT` but no OpenTelemetry
instrumentation exists in the codebase.

**Solution**:
1. Install `@opentelemetry/sdk-node` and relevant instrumentations
2. Add automatic instrumentation for Fastify, PostgreSQL, Redis
3. Export traces and metrics to configurable OTLP endpoint
4. Add Grafana dashboard templates for common metrics
5. Add health check latency histogram

**Estimated effort**: 2-3 days

---

### 18. Implement NL-to-SQL Feature

**Problem**: NL-to-SQL is listed as a key differentiator but is not implemented.

**Solution**:
1. Create `@meridian/ai` package or add to `@meridian/query-engine`
2. Implement schema-aware prompt construction
3. Integrate OpenAI/Anthropic API for SQL generation
4. Add SQL validation and safety checks
5. Expose via API endpoint and visual UI

**Estimated effort**: 5-7 days

---

### 19. Complete Semantic Layer with DB Persistence

**Problem**: Semantic layer service uses in-memory `Map` objects. Definitions are lost on restart.

**Solution**:
1. Create `semantic_models` and `metrics` database tables in `@meridian/db`
2. Add corresponding repositories
3. Update `semantic-layer.service.ts` to use repositories
4. Wire into server DI container

**Estimated effort**: 2 days

---

### 20. Implement BigQuery Connector

**Problem**: `bigquery.connector.ts` exists as a stub.

**Solution**:
1. Implement connector using `@google-cloud/bigquery` SDK
2. Support service account and OAuth authentication
3. Implement schema introspection
4. Add integration tests with BigQuery emulator or test project
5. Validate BigQuery SQL dialect in query engine

**Estimated effort**: 3-4 days

---

### 21. Implement Snowflake Connector

**Problem**: `snowflake.connector.ts` exists as a stub.

**Solution**:
1. Implement connector using `snowflake-sdk`
2. Support username/password and key-pair authentication
3. Implement warehouse and schema selection
4. Add integration tests
5. Validate Snowflake SQL dialect in query engine

**Estimated effort**: 3-4 days

---

## P3 -- Nice to Have

These items improve polish, performance, and future capabilities.

### 22. Add DuckDB Full Test Coverage

**Problem**: DuckDB connector has basic tests but lacks coverage for native binary
edge cases (loading, platform differences).

**Solution**:
1. Add platform-specific tests (macOS, Linux, Windows)
2. Test large dataset handling
3. Test concurrent query execution
4. Test file-based and in-memory modes

**Estimated effort**: 1-2 days

---

### 23. Add XLSX Export

**Problem**: XLSX export is a stub method.

**Solution**:
1. Install `exceljs` library
2. Implement worksheet creation from query results
3. Support multi-sheet exports for dashboards
4. Add styling (headers, alternating rows, auto-width columns)

**Estimated effort**: 1-2 days

---

### 24. Dashboard Git Versioning

**Problem**: README mentions "Git-based version control for dashboards" but this feature
is not implemented.

**Solution**:
1. Store dashboard JSON in a Git-managed directory
2. Track changes with commit messages
3. Support diff and rollback operations
4. Expose version history via API

**Estimated effort**: 5-7 days

---

### 25. Architecture Decision Records (ADRs)

**Problem**: No record of architectural decisions and their rationale.

**Solution**:
1. Create `docs/decisions/` directory
2. Backfill key decisions (monorepo structure, Drizzle ORM, ECharts, hexagonal architecture)
3. Establish ADR template for future decisions

**Estimated effort**: 1-2 days

---

### 26. Performance Benchmarks

**Problem**: No performance baseline or regression detection.

**Solution**:
1. Add benchmarks for query engine (SQL generation, optimization)
2. Add benchmarks for cache (hit/miss latency)
3. Add benchmarks for WebSocket throughput
4. Store results in CI for regression detection

**Estimated effort**: 2-3 days

---

### 27. Load Testing Setup

**Problem**: No load testing to validate production capacity.

**Solution**:
1. Create `k6` or `artillery` load test scripts
2. Test API endpoints under concurrent load
3. Test WebSocket connection scaling
4. Test query execution under concurrent requests
5. Document capacity planning based on results

**Estimated effort**: 2-3 days

---

## Timeline Estimate

| Phase | Items | Estimated Duration |
|-------|-------|-------------------|
| **Phase 1: Production Blockers** | P0 items 1-4 | 3-4 days |
| **Phase 2: Quality Foundation** | P1 items 5-12 | 10-15 days |
| **Phase 3: Feature Completion** | P2 items 13-21 | 20-30 days |
| **Phase 4: Polish** | P3 items 22-27 | 12-18 days |

**Total estimated effort**: 45-67 days (single developer)

With parallel development across multiple contributors, Phase 1 + Phase 2 can be
completed in approximately 2-3 weeks.
