// ── Plugin Types ─────────────────────────────────────────────────────
export type {
  PluginType,
  PluginManifest,
  Connector,
  ConnectorPlugin,
  ChartProps,
  VisualizationPlugin,
  TransformationPlugin,
  HttpMethod,
  RouteDefinition,
  ApiPlugin,
  LoadedPlugin,
  PluginInfo,
  ServiceContainer,
  PluginContext,
  PluginModule,
  ExtendedPluginManifest,
} from './plugin-types.js';

export {
  PluginLoadError,
  PluginNotFoundError,
  PluginAlreadyRegisteredError,
  PluginManifestError,
} from './plugin-types.js';

// ── Plugin Loader ─────────────────────────────────────────────────────
export {
  PluginLoader,
  PluginManifestSchema,
  validatePluginManifest,
  loadSinglePlugin,
} from './plugin-loader.js';

export type { ParsedPluginManifest, PluginLoaderOptions } from './plugin-loader.js';

// ── Plugin Registry ───────────────────────────────────────────────────
export {
  PluginRegistry,
  getDefaultRegistry,
  setDefaultRegistry,
} from './plugin-registry.js';

export type {
  PluginRegistryOptions,
  PluginRegistryEvent,
  PluginEventListener,
} from './plugin-registry.js';

// ── Plugin Context ────────────────────────────────────────────────────
export {
  createPluginContext,
  createScopedPluginContext,
  createTestPluginContext,
  buildScopedConfig,
} from './plugin-context.js';

// ── Built-in Plugins ──────────────────────────────────────────────────
export {
  CsvImportPlugin,
  CsvImportConfigSchema,
  CSV_IMPORT_MANIFEST,
} from './built-in/csv-import.plugin.js';

export type { CsvImportConfig } from './built-in/csv-import.plugin.js';

export {
  JsonImportPlugin,
  JsonImportConfigSchema,
  JSON_IMPORT_MANIFEST,
} from './built-in/json-import.plugin.js';

export type { JsonImportConfig } from './built-in/json-import.plugin.js';

// ── Logger Re-exports ─────────────────────────────────────────────────
export type { Logger } from './logger-compat.js';
export { createNoopLogger } from './logger-compat.js';
