// TypeScript config paths
export const typescriptBaseConfigPath = new URL('./typescript/base.json', import.meta.url).pathname;
export const typescriptReactConfigPath = new URL('./typescript/react.json', import.meta.url).pathname;

// ESLint config paths
export const eslintBaseConfigPath = new URL('./eslint/base.config.mjs', import.meta.url).pathname;
export const eslintReactConfigPath = new URL('./eslint/react.config.mjs', import.meta.url).pathname;

// Vitest config path
export const vitestBaseConfigPath = new URL('./vitest/base.config.ts', import.meta.url).pathname;

// Prettier config path
export const prettierBaseConfigPath = new URL('./prettier/base.json', import.meta.url).pathname;

// Re-export config objects for programmatic use
export { baseConfig as eslintBaseConfig, default as eslintBaseConfigDefault } from './eslint/base.config.mjs';
export { reactConfig as eslintReactConfig, default as eslintReactConfigDefault } from './eslint/react.config.mjs';
export { baseVitestConfig, default as vitestBaseConfigDefault } from './vitest/base.config.ts';
