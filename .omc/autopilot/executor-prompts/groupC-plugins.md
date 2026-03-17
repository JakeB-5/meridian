# Group C4: @meridian/plugins — Plugin System

## Task
Implement a dynamic plugin system that supports loading, registering, and managing plugins for connectors, visualizations, transformations, and API routes.

## Files to Create

### src/plugin-loader.ts
Dynamic plugin loading:
```typescript
export class PluginLoader {
  loadFromDirectory(dir: string): Promise<PluginManifest[]>;
  loadPlugin(manifestPath: string): Promise<LoadedPlugin>;
  unloadPlugin(name: string): Promise<void>;
  validateManifest(manifest: unknown): Result<PluginManifest>;
}
```
- Validates plugin manifest (Zod)
- Dynamic import() of plugin entry point
- Sandboxed context creation

### src/plugin-registry.ts
```typescript
export class PluginRegistry {
  register(plugin: LoadedPlugin): void;
  unregister(name: string): void;
  getPlugin(name: string): LoadedPlugin | undefined;
  getPluginsByType(type: PluginType): LoadedPlugin[];
  listPlugins(): PluginInfo[];
  isEnabled(name: string): boolean;
  enable(name: string): void;
  disable(name: string): void;
}
```

### src/plugin-context.ts
Sandbox context passed to plugins:
```typescript
export function createPluginContext(plugin: PluginManifest, services: ServiceContainer): PluginContext;
```
- Scoped logger (prefixed with plugin name)
- Config access (plugin-specific settings)
- Registration methods based on plugin type
- No direct DB access (security)

### src/plugin-types.ts
Extended plugin interfaces:
```typescript
export interface ConnectorPlugin {
  createConnector(config: unknown): Connector;
  getConfigSchema(): ZodSchema;
}

export interface VisualizationPlugin {
  chartType: string;
  component: React.ComponentType<ChartProps>;
  configSchema: ZodSchema;
}

export interface TransformationPlugin {
  name: string;
  transform(data: QueryResult, config: unknown): QueryResult;
  configSchema: ZodSchema;
}

export interface ApiPlugin {
  routes: RouteDefinition[];
}
```

### src/built-in/csv-import.plugin.ts
Built-in CSV import plugin:
- Reads CSV files
- Parses with configurable delimiter, headers
- Returns as QueryResult

### src/built-in/json-import.plugin.ts
Built-in JSON import plugin

### src/index.ts — re-exports

## Tests
- src/plugin-loader.test.ts (load, validate, error handling)
- src/plugin-registry.test.ts (register, enable/disable, list)
- src/plugin-context.test.ts (scoped logger, registration)
- src/built-in/csv-import.plugin.test.ts

## Dependencies
- @meridian/core, @meridian/shared
- zod (for schema validation)

## Estimated LOC: ~3000 + ~1000 tests
