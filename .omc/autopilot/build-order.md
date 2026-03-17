# Meridian Build Order (Topological Sort)

## Tier 0: No internal dependencies (build first)
- `@meridian/config` — Shared ESLint, TypeScript, Tailwind, Vitest configs
- `@meridian/shared` — Shared types, utils, constants

## Tier 1: Depends on shared only
- `@meridian/core` — Core business logic, domain models (depends: shared)
- `@meridian/cache` — Multi-layer cache (depends: shared)

## Tier 2: Depends on core
- `@meridian/db` — Drizzle ORM schema, migrations (depends: core, shared)
- `@meridian/connectors` — Database connectors (depends: core, shared)
- `@meridian/realtime` — WebSocket engine (depends: core, shared)
- `@meridian/plugins` — Plugin system (depends: core, shared)
- `@meridian/ui` — React component library (depends: shared)

## Tier 3: Depends on tier 2
- `@meridian/query-engine` — SQL generation, optimization (depends: core, connectors, shared)
- `@meridian/auth` — Authentication & authorization (depends: core, db, shared)
- `@meridian/scheduler` — Job scheduling (depends: core, cache, shared)
- `@meridian/viz` — Chart components (depends: core, shared)

## Tier 4: Depends on tier 3
- `@meridian/sdk` — Embeddable analytics SDK (depends: shared, viz)

## Tier 5: Apps (depend on packages)
- `apps/server` — Fastify API server
- `apps/worker` — Background job processor
- `apps/web` — React dashboard
- `apps/cli` — CLI tool

## Parallel Execution Groups
- Group A (Tier 0): config + shared → simultaneous
- Group B (Tier 1): core + cache → simultaneous (after A)
- Group C (Tier 2): db + connectors + realtime + plugins + ui → simultaneous (after B)
- Group D (Tier 3): query-engine + auth + scheduler + viz → simultaneous (after C)
- Group E (Tier 4): sdk → after D
- Group F (Tier 5): server + worker + web + cli → simultaneous (after E)
