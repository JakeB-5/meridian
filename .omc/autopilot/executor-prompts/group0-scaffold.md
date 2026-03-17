# Group 0: Monorepo Scaffold Prompt

## Task
Initialize the Meridian monorepo with Turborepo + pnpm. Create ALL directory structures, root configs, and package stubs.

## Files to Create

### Root
```
package.json              — root workspace config (name: "meridian", private: true)
pnpm-workspace.yaml       — workspace packages: ["apps/*", "packages/*"]
turbo.json                — pipeline: build, test, lint, typecheck, dev
tsconfig.base.json        — base TS config (strict, ESNext, NodeNext)
.gitignore                — node_modules, dist, .env, coverage, .turbo
.prettierrc               — singleQuote, trailingComma: all, semi: true, printWidth: 100
.editorconfig             — indent_style: space, indent_size: 2
.npmrc                    — shamefully-hoist=false, strict-peer-dependencies=true
docker-compose.yml        — postgres:16 + redis:7 services
Dockerfile                — multi-stage build for server
README.md                 — project overview
```

### turbo.json pipeline
```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["tsconfig.base.json"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

### Each package stub needs:
- `package.json` with correct name, version, main, types, scripts
- `tsconfig.json` extending base
- `src/index.ts` with placeholder export
- `vitest.config.ts` if applicable

### Package names:
- packages/config
- packages/shared
- packages/core
- packages/cache
- packages/db
- packages/connectors
- packages/realtime
- packages/plugins
- packages/ui
- packages/query-engine
- packages/auth
- packages/scheduler
- packages/viz
- packages/sdk

### App names:
- apps/server
- apps/worker
- apps/web
- apps/cli

### Root package.json scripts:
```json
{
  "dev": "turbo dev",
  "build": "turbo build",
  "test": "turbo test",
  "lint": "turbo lint",
  "lint:fix": "turbo lint -- --fix",
  "typecheck": "turbo typecheck",
  "clean": "turbo clean && rm -rf node_modules"
}
```

## Conventions
- All packages use `@meridian/` scope
- TypeScript strict mode everywhere
- ESM only (type: "module" in all package.json)
- Named exports only (no default exports)
