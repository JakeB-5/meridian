# Group A1: @meridian/config — Shared Configuration Package

## Task
Implement the complete shared configuration package for the Meridian monorepo.

## Files to Create

### packages/config/src/typescript/base.json
Base TypeScript config for Node.js packages:
- Extends ../../tsconfig.base.json
- target: ES2022, module: ESNext, moduleResolution: bundler

### packages/config/src/typescript/react.json
TypeScript config for React packages:
- Extends base.json
- jsx: react-jsx
- lib: ["ES2022", "DOM", "DOM.Iterable"]

### packages/config/src/eslint/base.config.mjs
ESLint flat config for TypeScript:
- @typescript-eslint/parser
- Rules: no-unused-vars (error), no-console (warn), consistent-return
- Ignore: dist/, node_modules/, coverage/

### packages/config/src/eslint/react.config.mjs
ESLint config extending base with React rules:
- eslint-plugin-react, eslint-plugin-react-hooks
- jsx-runtime support

### packages/config/src/vitest/base.config.ts
Shared Vitest configuration:
- globals: true
- coverage: { provider: 'v8', thresholds: { lines: 80, functions: 80, branches: 80 } }
- testMatch: ['**/*.test.ts', '**/*.test.tsx']

### packages/config/src/prettier/base.json
Prettier config (mirrors root .prettierrc)

### packages/config/src/index.ts
Re-export paths to all configs

## Tests: None needed (config-only package)
## Estimated LOC: ~500
