import type { ZodSchema } from 'zod';
import type { QueryResult, PluginManifest, PluginType } from '@meridian/shared';
import type { Logger } from '@meridian/shared';

// Re-export shared types for convenience
export type { PluginType, PluginManifest };

// ── Connector Plugin ─────────────────────────────────────────────────

/** Represents a database or data source connection */
export interface Connector {
  /** Test the connection and return true if healthy */
  testConnection(): Promise<boolean>;
  /** Execute a raw SQL query */
  executeQuery(sql: string, params?: unknown[]): Promise<QueryResult>;
  /** List all table names in the data source */
  listTables(): Promise<string[]>;
  /** Close/disconnect cleanly */
  close(): Promise<void>;
}

/** Plugin type that provides a new data source connector */
export interface ConnectorPlugin {
  /** The database/source type identifier, e.g. "mongodb", "kafka" */
  readonly connectorType: string;
  /** Create a connector instance from user-supplied config */
  createConnector(config: unknown): Connector;
  /** Zod schema for validating the connector config */
  getConfigSchema(): ZodSchema;
}

// ── Visualization Plugin ─────────────────────────────────────────────

/** Props passed to every chart component */
export interface ChartProps {
  data: QueryResult;
  config: Record<string, unknown>;
  width?: number;
  height?: number;
}

/** Plugin type that provides a new chart type */
export interface VisualizationPlugin {
  /** Unique chart type identifier, e.g. "sankey", "heatmap" */
  readonly chartType: string;
  /**
   * React component reference.
   * Typed as unknown to avoid requiring React as a peer dep in this package;
   * callers (viz package) cast to the appropriate component type.
   */
  readonly component: unknown;
  /** Zod schema describing the visualization config */
  readonly configSchema: ZodSchema;
  /** Human-readable display name */
  readonly displayName: string;
  /** Optional icon URL or data-URI */
  readonly iconUrl?: string;
}

// ── Transformation Plugin ────────────────────────────────────────────

/** Plugin type that provides a data transformation step */
export interface TransformationPlugin {
  /** Unique transformation name, e.g. "pivot", "unnest" */
  readonly name: string;
  /** Human-readable description */
  readonly description: string;
  /** Execute the transformation */
  transform(data: QueryResult, config: unknown): QueryResult;
  /** Zod schema describing the transformation config */
  readonly configSchema: ZodSchema;
}

// ── API Plugin ───────────────────────────────────────────────────────

/** Supported HTTP methods */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** A single route provided by an API plugin */
export interface RouteDefinition {
  method: HttpMethod;
  path: string;
  /** Route handler — typed loosely; callers cast to framework-specific handler */
  handler: (request: unknown, reply: unknown) => Promise<unknown>;
  /** Optional Zod schema for request body validation */
  bodySchema?: ZodSchema;
  /** Optional Zod schema for query param validation */
  querySchema?: ZodSchema;
  /** Description for auto-generated docs */
  description?: string;
  /** Whether authentication is required (default: true) */
  requiresAuth?: boolean;
}

/** Plugin type that provides additional API routes */
export interface ApiPlugin {
  /** Base path prefix for all routes, e.g. "/plugins/my-plugin" */
  readonly basePath: string;
  /** Route definitions */
  readonly routes: RouteDefinition[];
}

// ── Loaded Plugin ────────────────────────────────────────────────────

/** A fully loaded and instantiated plugin */
export interface LoadedPlugin {
  manifest: PluginManifest;
  /** The actual plugin implementation object */
  instance:
    | ConnectorPlugin
    | VisualizationPlugin
    | TransformationPlugin
    | ApiPlugin;
  /** Absolute path to the plugin's entry file */
  entryPath: string;
  /** When the plugin was loaded */
  loadedAt: Date;
  /** Whether the plugin is currently active */
  enabled: boolean;
}

/** Summary info for listing plugins */
export interface PluginInfo {
  name: string;
  version: string;
  type: PluginType;
  description: string;
  author?: string;
  enabled: boolean;
  loadedAt: Date;
}

// ── Service Container ────────────────────────────────────────────────

/** Services available to plugins via context */
export interface ServiceContainer {
  logger: Logger;
  /** Plugin-specific config values from environment / config file */
  config: Record<string, unknown>;
}

// ── Plugin Context ───────────────────────────────────────────────────

/** Sandboxed context injected into each plugin at registration time */
export interface PluginContext {
  /** Logger scoped to this plugin */
  logger: Logger;
  /** Access plugin-specific config value by key */
  getConfig<T = unknown>(key: string): T | undefined;
  /** Access required config value (throws if missing) */
  requireConfig<T = unknown>(key: string): T;
  /** Plugin manifest metadata */
  manifest: PluginManifest;
}

// ── Plugin Module Export Shape ───────────────────────────────────────

/**
 * The shape a plugin module must export as its default export.
 * The plugin module's default export is called with the context to produce the instance.
 */
export interface PluginModule {
  default: (context: PluginContext) =>
    | ConnectorPlugin
    | VisualizationPlugin
    | TransformationPlugin
    | ApiPlugin
    | Promise<ConnectorPlugin | VisualizationPlugin | TransformationPlugin | ApiPlugin>;
}

// ── Manifest Validation ──────────────────────────────────────────────

/** Extended manifest with optional capabilities declaration */
export interface ExtendedPluginManifest extends PluginManifest {
  /** Minimum Meridian version required */
  minMeridianVersion?: string;
  /** Declared permissions (reserved for future sandbox enforcement) */
  permissions?: string[];
  /** Additional metadata tags */
  tags?: string[];
  /** Config schema keys the plugin expects */
  configKeys?: string[];
  /** Human-readable homepage or docs URL */
  homepageUrl?: string;
}

// ── Plugin Errors ────────────────────────────────────────────────────

import { MeridianError } from '@meridian/shared';

/** Raised when a plugin fails to load */
export class PluginLoadError extends MeridianError {
  constructor(pluginName: string, reason: string, details?: Record<string, unknown>) {
    super(
      `Failed to load plugin '${pluginName}': ${reason}`,
      'ERR_PLUGIN_LOAD',
      500,
      { pluginName, ...details },
    );
    this.name = 'PluginLoadError';
  }
}

/** Raised when a plugin with the given name is not found in the registry */
export class PluginNotFoundError extends MeridianError {
  constructor(pluginName: string) {
    super(
      `Plugin '${pluginName}' not found in registry`,
      'ERR_NOT_FOUND',
      404,
      { pluginName },
    );
    this.name = 'PluginNotFoundError';
  }
}

/** Raised when a plugin with the same name is already registered */
export class PluginAlreadyRegisteredError extends MeridianError {
  constructor(pluginName: string) {
    super(
      `Plugin '${pluginName}' is already registered`,
      'ERR_CONFLICT',
      409,
      { pluginName },
    );
    this.name = 'PluginAlreadyRegisteredError';
  }
}

/** Raised when manifest validation fails */
export class PluginManifestError extends MeridianError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super(
      `Invalid plugin manifest: ${reason}`,
      'ERR_VALIDATION',
      400,
      details,
    );
    this.name = 'PluginManifestError';
  }
}
