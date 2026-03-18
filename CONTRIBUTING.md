# Contributing to Meridian

Thank you for your interest in contributing to Meridian! This guide covers everything
you need to get started.

---

## Table of Contents

- [Development Setup](#development-setup)
- [Branch Strategy](#branch-strategy)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Code Style Guide](#code-style-guide)
- [Testing Requirements](#testing-requirements)
- [Package Dependency Rules](#package-dependency-rules)
- [Getting Help](#getting-help)

---

## Development Setup

### Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Node.js | 20+ | `node --version` |
| pnpm | 9.15+ | `pnpm --version` |
| Docker | 24.0+ | `docker --version` |
| Docker Compose | 2.20+ | `docker compose version` |
| Git | 2.40+ | `git --version` |

### Initial Setup

```bash
# 1. Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/meridian.git
cd meridian

# 2. Add upstream remote
git remote add upstream https://github.com/meridian/meridian.git

# 3. Install dependencies
pnpm install

# 4. Set up environment variables
cp .env.example .env
# Edit .env with your local values (defaults work for most setups)

# 5. Start PostgreSQL and Redis
docker compose up -d postgres redis

# 6. Run database migrations
pnpm --filter @meridian/db migrate

# 7. Start all development servers
pnpm dev
```

This starts:
- **Frontend**: http://localhost:5173
- **API Server**: http://localhost:3001
- **WebSocket**: ws://localhost:3001

### Useful Commands

```bash
# Run all tests
pnpm test --no-cache

# Run tests for a specific package
pnpm --filter @meridian/query-engine test -- --no-cache

# Run a single test file
pnpm --filter @meridian/core vitest run src/models/dashboard.test.ts --no-cache

# Type check all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Lint and auto-fix
pnpm lint:fix

# Build all packages
pnpm build

# Build a specific package
pnpm --filter @meridian/core build
```

---

## Branch Strategy

### Branch Naming

All feature branches should be created from `dev`:

```bash
# Update your local dev branch
git checkout dev
git pull upstream dev

# Create a feature branch
git checkout -b feature/your-feature-name dev
```

### Branch Naming Conventions

| Prefix | Purpose | Example |
|--------|---------|---------|
| `feature/` | New features | `feature/bigquery-connector` |
| `fix/` | Bug fixes | `fix/cache-invalidation` |
| `refactor/` | Code refactoring | `refactor/query-engine-ir` |
| `test/` | Adding or fixing tests | `test/cli-commands` |
| `docs/` | Documentation changes | `docs/api-reference` |
| `chore/` | Maintenance tasks | `chore/update-dependencies` |

### Pull Request Targets

- Feature branches merge into `dev`
- Release branches merge into `main`
- Hotfixes merge into both `main` and `dev`

```
main (production releases)
  ^
  |
dev (integration branch)
  ^
  |
feature/your-feature (your work)
```

---

## Commit Conventions

Meridian uses [Conventional Commits](https://www.conventionalcommits.org/).

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat(query-engine): add BigQuery dialect` |
| `fix` | Bug fix | `fix(cache): prevent stale cache on schema change` |
| `refactor` | Code restructuring (no behavior change) | `refactor(core): extract validation into value objects` |
| `test` | Adding or updating tests | `test(auth): add RBAC permission matrix tests` |
| `docs` | Documentation changes | `docs: update deployment guide` |
| `chore` | Maintenance tasks | `chore: update TypeScript to 5.8` |
| `perf` | Performance improvement | `perf(query-engine): optimize join reordering` |
| `style` | Code style changes (formatting, semicolons) | `style: apply prettier formatting` |
| `ci` | CI/CD changes | `ci: add GitHub Actions workflow` |

### Scope

The scope should be the package name without the `@meridian/` prefix:

- `feat(core): ...`
- `fix(query-engine): ...`
- `test(auth): ...`
- `refactor(db): ...`

For app-level changes, use the app name:

- `feat(server): ...`
- `fix(web): ...`
- `test(cli): ...`

### Examples

```
feat(connectors): add ClickHouse connection pooling

Add configurable connection pool for ClickHouse connector with
min/max connections, idle timeout, and health checks.

Closes #42
```

```
fix(realtime): handle WebSocket reconnection on network change

Previously, clients would not reconnect when the network
interface changed (e.g., WiFi to Ethernet). Now the client
detects connection loss and attempts reconnection with
exponential backoff.
```

---

## Pull Request Process

### Before Opening a PR

1. **Ensure all tests pass locally**:
   ```bash
   pnpm test --no-cache
   ```

2. **Ensure type checking passes**:
   ```bash
   pnpm typecheck
   ```

3. **Ensure linting passes**:
   ```bash
   pnpm lint
   ```

4. **Rebase on latest dev**:
   ```bash
   git fetch upstream
   git rebase upstream/dev
   ```

### PR Template

When opening a PR, include:

```markdown
## Summary

Brief description of what this PR does and why.

## Changes

- Added X to Y
- Fixed Z in W
- Updated A to use B

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests added (if applicable)
- [ ] Manual testing performed

## Screenshots (if UI changes)

Before / After screenshots or recordings.
```

### Review Process

1. Open PR against `dev` branch
2. Automated CI checks must pass (tests, lint, typecheck, build)
3. At least 1 code review approval required
4. Address all review comments
5. Squash and merge when approved

### Review Criteria

Reviewers look for:
- Correctness of implementation
- Test coverage for new code
- Adherence to coding conventions
- No breaking changes to public APIs
- No security vulnerabilities
- Documentation for new features

---

## Code Style Guide

### General Rules

| Rule | Convention |
|------|-----------|
| Naming (variables, functions) | `camelCase` |
| Naming (types, classes, components) | `PascalCase` |
| Naming (constants) | `UPPER_SNAKE_CASE` |
| File naming (TypeScript) | `kebab-case.ts` |
| File naming (React components) | `PascalCase.tsx` |
| Exports | Named exports only (no `default` exports) |
| Imports | Path aliases via `@/` within each package |

### TypeScript

```typescript
// Named exports only
export function createDashboard(params: CreateDashboardParams): Result<Dashboard> {
  // ...
}

// No default exports
// BAD: export default class Dashboard { ... }
// GOOD: export class Dashboard { ... }

// Use const assertions for constants
export const MAX_CARDS_PER_DASHBOARD = 50 as const;

// Prefer interfaces for object shapes
export interface DashboardCreateParams {
  name: string;
  description?: string;
  organizationId: string;
  createdBy: string;
}

// Use Zod for runtime validation at API boundaries
export const createDashboardSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  isPublic: z.boolean().optional().default(false),
});
```

### Error Handling

```typescript
// Use Result type for expected errors
function divide(a: number, b: number): Result<number> {
  if (b === 0) {
    return err(new ValidationError('Division by zero'));
  }
  return ok(a / b);
}

// Custom error classes with error codes
export class QueryExecutionError extends MeridianError {
  constructor(message: string, cause?: Error) {
    super('QUERY_EXECUTION_ERROR', message, cause);
  }
}

// Never throw in domain logic -- return Result<T>
// Exceptions are only for truly unexpected situations (bugs)
```

### React Components

```tsx
// Functional components only
export function DashboardCard({ question, position, onMove }: DashboardCardProps) {
  // Zustand for client state
  const theme = useThemeStore((s) => s.theme);

  // TanStack Query for server state
  const { data, isLoading } = useQuery({
    queryKey: ['question', question.id],
    queryFn: () => api.questions.getById(question.id),
  });

  if (isLoading) return <Skeleton />;

  return (
    <Card className="dashboard-card">
      <CardHeader>{question.name}</CardHeader>
      <CardContent>
        <ChartRenderer config={question.visualization} data={data} />
      </CardContent>
    </Card>
  );
}
```

### File Organization

```
packages/core/src/
  models/                 # Domain models (entities, value objects)
    dashboard.model.ts
    dashboard.model.test.ts
  services/               # Domain services (business logic orchestration)
    dashboard.service.ts
  ports/                  # Port interfaces (repository contracts)
    dashboard.repository.ts
  events/                 # Domain events
    dashboard.events.ts
  index.ts                # Public API (re-exports)
```

---

## Testing Requirements

### Coverage Expectations

| Area | Minimum Coverage |
|------|-----------------|
| Domain models | 80%+ |
| Domain services | 70%+ |
| API route handlers | 60%+ |
| Utility functions | 80%+ |
| React components (critical) | 50%+ |

### Testing Patterns

#### Unit Tests

Co-located with source files:

```
query-engine.ts       # Source
query-engine.test.ts  # Tests (same directory)
```

```typescript
import { describe, it, expect, vi } from 'vitest';
import { QueryEngine } from './query-engine.js';

describe('QueryEngine', () => {
  it('translates visual query to SQL', () => {
    const engine = new QueryEngine();
    const result = engine.translate(visualQuery);
    expect(result.ok).toBe(true);
    expect(result.value.sql).toContain('SELECT');
  });
});
```

#### Integration Tests

Placed in `__tests__/` directories:

```
packages/db/src/__tests__/
  user.repository.integration.test.ts
```

#### Test Utilities

- Use Vitest's `vi.fn()` and `vi.mock()` for mocking
- Use factory functions for creating test fixtures
- Reset state between tests with `beforeEach`

### Running Tests

```bash
# All tests (no cache to ensure fresh runs)
pnpm test --no-cache

# Watch mode for development
pnpm --filter @meridian/core vitest watch

# With coverage report
pnpm --filter @meridian/core vitest run --coverage

# Single file
pnpm --filter @meridian/core vitest run src/models/dashboard.test.ts --no-cache
```

---

## Package Dependency Rules

Strict dependency rules prevent circular imports and maintain clean architecture.

### Allowed Dependencies

```
@meridian/shared     -> (none)
@meridian/config     -> (none)
@meridian/core       -> shared
@meridian/db         -> core, shared
@meridian/connectors -> core, shared
@meridian/query-engine -> core, connectors, shared
@meridian/auth       -> core, db, shared
@meridian/cache      -> shared
@meridian/scheduler  -> core, cache, shared
@meridian/realtime   -> core, shared
@meridian/viz        -> core, shared (React peer)
@meridian/ui         -> shared (React peer)
@meridian/sdk        -> shared, viz
@meridian/plugins    -> core, shared
apps/*               -> any packages/*
```

### Rules

1. **Packages MUST NOT depend on apps** (packages are reusable libraries)
2. **Packages MUST NOT have circular dependencies** (`A -> B -> A`)
3. **`@meridian/shared` MUST have zero internal dependencies** (leaf node)
4. **React is a peer dependency** for `viz`, `ui`, and `sdk`
5. **Database access goes through `@meridian/db`** only (not raw queries)
6. **External queries go through `@meridian/query-engine`** (not direct SQL)

### Adding a New Dependency

Before adding a new `npm` dependency:
1. Check if existing packages already provide the functionality
2. Evaluate bundle size impact (use `bundlephobia.com`)
3. Verify the package is actively maintained
4. Prefer packages with TypeScript types included
5. Add to the specific package that needs it, not the root

---

## Getting Help

- **Questions**: Open a GitHub Discussion
- **Bugs**: Open a GitHub Issue with reproduction steps
- **Feature Requests**: Open a GitHub Issue with the `enhancement` label
- **Security Issues**: Email security@meridian.dev (do not open public issues)

---

Thank you for contributing to Meridian!
