import type { PluginManifest } from '@meridian/shared';
import { MeridianError } from '@meridian/shared';
import type { Logger } from './logger-compat.js';
import type { PluginContext, ServiceContainer } from './plugin-types.js';

// ── PluginContext Factory ─────────────────────────────────────────────

/**
 * Create a sandboxed PluginContext for a specific plugin.
 *
 * The context provides:
 * - A logger child scoped with the plugin name so all log output is
 *   prefixed/tagged with the plugin's identity.
 * - Read-only access to plugin-specific configuration values from the
 *   ServiceContainer. The container should only expose keys relevant to
 *   this plugin (typically prefixed with the plugin name).
 * - The plugin manifest for runtime self-inspection.
 *
 * No direct database access is exposed — plugins that need persistence
 * must go through the API layer.
 */
export function createPluginContext(
  manifest: PluginManifest,
  services: ServiceContainer,
): PluginContext {
  // Create a child logger tagged with the plugin name so every log line
  // carries plugin identity metadata.
  const scopedLogger: Logger = services.logger.child({
    plugin: manifest.name,
    pluginVersion: manifest.version,
    pluginType: manifest.type,
  });

  // Build a read-only view of config for this plugin.
  // We shallow-copy to prevent plugins from mutating the shared container.
  const pluginConfig: Readonly<Record<string, unknown>> = Object.freeze(
    Object.assign({}, services.config),
  );

  return {
    manifest: Object.freeze({ ...manifest }),
    logger: scopedLogger,

    getConfig<T = unknown>(key: string): T | undefined {
      return pluginConfig[key] as T | undefined;
    },

    requireConfig<T = unknown>(key: string): T {
      const value = pluginConfig[key];
      if (value === undefined || value === null) {
        throw new MeridianError(
          `Plugin '${manifest.name}' requires config key '${key}' but it was not provided`,
          'ERR_VALIDATION',
          500,
          { pluginName: manifest.name, missingKey: key },
        );
      }
      return value as T;
    },
  };
}

// ── Scoped Config Builder ────────────────────────────────────────────

/**
 * Extract plugin-specific config from a flat config map by namespace prefix.
 *
 * Convention: config keys prefixed with `<pluginName>.` are scoped to that
 * plugin. This helper strips the prefix so plugins see bare key names.
 *
 * Example:
 *   fullConfig = { "csv-import.delimiter": ",", "json-import.strict": true }
 *   buildScopedConfig("csv-import", fullConfig) → { delimiter: "," }
 */
export function buildScopedConfig(
  pluginName: string,
  fullConfig: Record<string, unknown>,
): Record<string, unknown> {
  const prefix = `${pluginName}.`;
  const scoped: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fullConfig)) {
    if (key.startsWith(prefix)) {
      scoped[key.slice(prefix.length)] = value;
    } else if (!key.includes('.')) {
      // Also pass through keys with no namespace (global config)
      scoped[key] = value;
    }
  }

  return scoped;
}

/**
 * Create a plugin context with automatically scoped config.
 *
 * This is a convenience wrapper over createPluginContext that first applies
 * buildScopedConfig so the plugin only sees its own config keys.
 */
export function createScopedPluginContext(
  manifest: PluginManifest,
  services: ServiceContainer,
): PluginContext {
  const scopedConfig = buildScopedConfig(manifest.name, services.config);
  return createPluginContext(manifest, {
    ...services,
    config: scopedConfig,
  });
}

// ── Test Helper ──────────────────────────────────────────────────────

/**
 * Build a minimal PluginContext for unit testing plugins without a full
 * ServiceContainer. Logs are silenced by default.
 */
export function createTestPluginContext(
  manifest: PluginManifest,
  config: Record<string, unknown> = {},
  logger?: Logger,
): PluginContext {
  const testLogger: Logger = logger ?? {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child(_bindings: Record<string, unknown>): Logger {
      return this;
    },
  };

  return createPluginContext(manifest, {
    logger: testLogger,
    config,
  });
}
