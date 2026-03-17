import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';
import { z } from 'zod';
import { ok, err, tryCatch } from '@meridian/shared';
import type { Result } from '@meridian/shared';
import { createNoopLogger } from './logger-compat.js';
import type { Logger } from './logger-compat.js';
import {
  PluginLoadError,
  PluginManifestError,
} from './plugin-types.js';
import type {
  LoadedPlugin,
  PluginModule,
  PluginContext,
  ServiceContainer,
  ExtendedPluginManifest,
} from './plugin-types.js';
import type { PluginManifest, PluginType } from '@meridian/shared';
import { createPluginContext } from './plugin-context.js';

// ── Manifest Zod Schema ──────────────────────────────────────────────

const PLUGIN_TYPES: [PluginType, ...PluginType[]] = [
  'connector',
  'visualization',
  'transformation',
  'api',
];

export const PluginManifestSchema = z.object({
  name: z
    .string()
    .min(1, 'Plugin name must not be empty')
    .max(128, 'Plugin name must not exceed 128 characters')
    .regex(
      /^[a-z0-9-_]+$/,
      'Plugin name may only contain lowercase letters, numbers, hyphens, and underscores',
    ),
  version: z
    .string()
    .regex(
      /^\d+\.\d+\.\d+(-[\w.]+)?$/,
      'Version must follow semantic versioning (e.g. 1.0.0)',
    ),
  type: z.enum(PLUGIN_TYPES),
  description: z.string().min(1).max(1024),
  author: z.string().max(256).optional(),
  entryPoint: z.string().min(1),
  minMeridianVersion: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  configKeys: z.array(z.string()).optional(),
  homepageUrl: z.string().url().optional(),
});

export type ParsedPluginManifest = z.infer<typeof PluginManifestSchema>;

// ── PluginLoader ─────────────────────────────────────────────────────

export interface PluginLoaderOptions {
  logger?: Logger;
  /**
   * Services (logger, config) to inject into plugin contexts.
   * If omitted, a minimal no-op service container is used.
   */
  services?: ServiceContainer;
  /**
   * Maximum number of plugins to load concurrently from a directory.
   * Defaults to 4.
   */
  concurrency?: number;
}

/**
 * Loads plugins from the filesystem and validates their manifests.
 *
 * Usage:
 *   const loader = new PluginLoader({ logger });
 *   const loaded = await loader.loadPlugin('/path/to/plugin/manifest.json');
 */
export class PluginLoader {
  private readonly logger: Logger;
  private readonly services: ServiceContainer;
  private readonly concurrency: number;
  /** Track loaded plugin instances by name for unloading */
  private readonly loadedPlugins = new Map<string, LoadedPlugin>();

  constructor(options: PluginLoaderOptions = {}) {
    this.logger = options.logger ?? createNoopLogger();
    this.services = options.services ?? {
      logger: createNoopLogger(),
      config: {},
    };
    this.concurrency = options.concurrency ?? 4;
  }

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Scan a directory for plugin manifest files (meridian-plugin.json or plugin.json)
   * and load each one.
   *
   * @param dir Absolute or relative path to the plugins directory
   * @returns Array of successfully loaded plugins (failures are logged and skipped)
   */
  async loadFromDirectory(dir: string): Promise<LoadedPlugin[]> {
    const absDir = isAbsolute(dir) ? dir : resolve(process.cwd(), dir);

    this.logger.info('Scanning plugin directory', { dir: absDir });

    let entries: string[];
    try {
      entries = await readdir(absDir);
    } catch (error) {
      this.logger.error('Failed to read plugin directory', {
        dir: absDir,
        error: String(error),
      });
      return [];
    }

    // Find all subdirectories that contain a manifest file
    const manifestPaths: string[] = [];
    for (const entry of entries) {
      const entryPath = join(absDir, entry);
      try {
        const s = await stat(entryPath);
        if (s.isDirectory()) {
          for (const manifestName of ['meridian-plugin.json', 'plugin.json']) {
            const candidatePath = join(entryPath, manifestName);
            try {
              await stat(candidatePath);
              manifestPaths.push(candidatePath);
              break; // Only pick the first match per directory
            } catch {
              // File does not exist; try next name
            }
          }
        } else if (
          entry === 'meridian-plugin.json' ||
          entry === 'plugin.json'
        ) {
          // Manifest file directly inside the scan dir
          manifestPaths.push(entryPath);
        }
      } catch {
        // Stat failed; skip entry
      }
    }

    this.logger.info('Found plugin manifests', {
      count: manifestPaths.length,
      paths: manifestPaths,
    });

    const loaded: LoadedPlugin[] = [];
    // Load in bounded concurrency batches
    for (let i = 0; i < manifestPaths.length; i += this.concurrency) {
      const batch = manifestPaths.slice(i, i + this.concurrency);
      const results = await Promise.allSettled(
        batch.map((p) => this.loadPlugin(p)),
      );
      for (const result of results) {
        if (result.status === 'fulfilled') {
          loaded.push(result.value);
        } else {
          this.logger.error('Failed to load plugin from directory scan', {
            reason: String(result.reason),
          });
        }
      }
    }

    return loaded;
  }

  /**
   * Load a single plugin from a manifest JSON file path.
   *
   * @param manifestPath Absolute path to the manifest JSON file
   */
  async loadPlugin(manifestPath: string): Promise<LoadedPlugin> {
    const absManifestPath = isAbsolute(manifestPath)
      ? manifestPath
      : resolve(process.cwd(), manifestPath);

    this.logger.debug('Loading plugin manifest', { path: absManifestPath });

    // 1. Read manifest file
    let rawManifest: unknown;
    try {
      const content = await readFile(absManifestPath, 'utf-8');
      rawManifest = JSON.parse(content);
    } catch (error) {
      throw new PluginLoadError(
        absManifestPath,
        `Could not read or parse manifest file: ${String(error)}`,
        { manifestPath: absManifestPath },
      );
    }

    // 2. Validate manifest
    const manifestResult = this.validateManifest(rawManifest);
    if (!manifestResult.ok) {
      throw manifestResult.error;
    }
    const manifest = manifestResult.value as PluginManifest;

    // 3. Check for duplicate
    if (this.loadedPlugins.has(manifest.name)) {
      this.logger.warn('Plugin already loaded; skipping', {
        name: manifest.name,
      });
      return this.loadedPlugins.get(manifest.name)!;
    }

    // 4. Resolve entry point relative to the manifest file's directory
    const manifestDir = absManifestPath.replace(/[\\/][^\\/]+$/, '');
    const entryPath = isAbsolute(manifest.entryPoint)
      ? manifest.entryPoint
      : resolve(manifestDir, manifest.entryPoint);

    this.logger.debug('Importing plugin entry point', {
      name: manifest.name,
      entryPath,
    });

    // 5. Dynamically import the plugin module
    let pluginModule: PluginModule;
    try {
      pluginModule = (await import(entryPath)) as PluginModule;
    } catch (error) {
      throw new PluginLoadError(
        manifest.name,
        `Dynamic import failed: ${String(error)}`,
        { entryPath },
      );
    }

    // 6. Validate module shape
    if (typeof pluginModule.default !== 'function') {
      throw new PluginLoadError(
        manifest.name,
        'Plugin module must export a default function that accepts a PluginContext',
        { entryPath },
      );
    }

    // 7. Create sandboxed context
    const context: PluginContext = createPluginContext(manifest, this.services);

    // 8. Instantiate plugin
    let instance: LoadedPlugin['instance'];
    try {
      instance = await Promise.resolve(pluginModule.default(context));
    } catch (error) {
      throw new PluginLoadError(
        manifest.name,
        `Plugin factory function threw: ${String(error)}`,
        { entryPath },
      );
    }

    const loaded: LoadedPlugin = {
      manifest,
      instance,
      entryPath,
      loadedAt: new Date(),
      enabled: true,
    };

    this.loadedPlugins.set(manifest.name, loaded);
    this.logger.info('Plugin loaded successfully', {
      name: manifest.name,
      version: manifest.version,
      type: manifest.type,
    });

    return loaded;
  }

  /**
   * Unload a previously loaded plugin by name.
   * Releases the reference and clears the entry from the cache.
   */
  async unloadPlugin(name: string): Promise<void> {
    if (!this.loadedPlugins.has(name)) {
      this.logger.warn('Attempted to unload unknown plugin', { name });
      return;
    }

    this.loadedPlugins.delete(name);
    this.logger.info('Plugin unloaded', { name });
    // Note: ES module dynamic imports are not truly unloadable in the V8/Node runtime.
    // The module cache is managed by the runtime. For full hot-reload support a
    // separate worker process per plugin would be required.
  }

  /**
   * Validate raw manifest data against the Zod schema.
   * Returns a Result so callers can handle errors without exceptions.
   */
  validateManifest(manifest: unknown): Result<ParsedPluginManifest> {
    const parsed = PluginManifestSchema.safeParse(manifest);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      return err(new PluginManifestError(issues, { zodIssues: parsed.error.issues }));
    }
    return ok(parsed.data);
  }

  /**
   * Get a snapshot of all plugins currently tracked by this loader.
   */
  getLoadedPlugins(): ReadonlyMap<string, LoadedPlugin> {
    return this.loadedPlugins;
  }

  /**
   * Check whether a plugin name is currently loaded in this loader.
   */
  isLoaded(name: string): boolean {
    return this.loadedPlugins.has(name);
  }
}

// ── Convenience async wrapper for validate-only use ──────────────────

/**
 * Validate a manifest object without creating a loader instance.
 */
export function validatePluginManifest(
  manifest: unknown,
): Result<ParsedPluginManifest> {
  return new PluginLoader().validateManifest(manifest);
}

// ── Helper: load a single plugin without managing a registry ─────────

/**
 * Load a single plugin from a manifest path using a temporary loader.
 * Convenience function for one-off use cases.
 */
export async function loadSinglePlugin(
  manifestPath: string,
  options?: PluginLoaderOptions,
): Promise<Result<LoadedPlugin>> {
  return tryCatch(
    () => new PluginLoader(options).loadPlugin(manifestPath),
    (e) =>
      e instanceof PluginLoadError || e instanceof PluginManifestError
        ? e
        : new PluginLoadError(manifestPath, String(e)),
  );
}
