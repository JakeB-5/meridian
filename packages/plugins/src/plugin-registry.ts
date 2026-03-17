import type { PluginType } from '@meridian/shared';
import type { Logger } from './logger-compat.js';
import { createNoopLogger } from './logger-compat.js';
import {
  PluginNotFoundError,
  PluginAlreadyRegisteredError,
} from './plugin-types.js';
import type { LoadedPlugin, PluginInfo } from './plugin-types.js';

// ── PluginRegistry ───────────────────────────────────────────────────

export interface PluginRegistryOptions {
  logger?: Logger;
  /**
   * If true, registering a plugin whose name is already in the registry
   * will replace the existing entry instead of throwing.
   * Default: false (throw on duplicate).
   */
  allowOverride?: boolean;
}

/**
 * Central in-memory registry for all loaded Meridian plugins.
 *
 * Responsibilities:
 * - Store and retrieve LoadedPlugin instances by name
 * - Support enable/disable lifecycle without unloading
 * - Provide filtered views by plugin type
 * - Emit basic event notifications (via callbacks) on state changes
 */
export class PluginRegistry {
  private readonly plugins = new Map<string, LoadedPlugin>();
  private readonly logger: Logger;
  private readonly allowOverride: boolean;
  private readonly listeners: Map<PluginRegistryEvent, PluginEventListener[]> =
    new Map();

  constructor(options: PluginRegistryOptions = {}) {
    this.logger = options.logger ?? createNoopLogger();
    this.allowOverride = options.allowOverride ?? false;
  }

  // ── Registration ───────────────────────────────────────────────────

  /**
   * Register a loaded plugin.
   * Throws PluginAlreadyRegisteredError if a plugin with the same name is
   * already registered (unless allowOverride is true).
   */
  register(plugin: LoadedPlugin): void {
    const { name } = plugin.manifest;

    if (this.plugins.has(name)) {
      if (this.allowOverride) {
        this.logger.warn('Overriding existing plugin registration', { name });
      } else {
        throw new PluginAlreadyRegisteredError(name);
      }
    }

    this.plugins.set(name, { ...plugin });
    this.logger.info('Plugin registered', {
      name,
      version: plugin.manifest.version,
      type: plugin.manifest.type,
      enabled: plugin.enabled,
    });
    this.emit('registered', plugin);
  }

  /**
   * Unregister a plugin by name.
   * Throws PluginNotFoundError if the plugin is not registered.
   */
  unregister(name: string): void {
    const plugin = this.requirePlugin(name);
    this.plugins.delete(name);
    this.logger.info('Plugin unregistered', { name });
    this.emit('unregistered', plugin);
  }

  // ── Lookup ─────────────────────────────────────────────────────────

  /**
   * Retrieve a plugin by name. Returns undefined if not found.
   */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Retrieve a plugin by name. Throws PluginNotFoundError if not found.
   */
  requirePlugin(name: string): LoadedPlugin {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new PluginNotFoundError(name);
    }
    return plugin;
  }

  /**
   * Retrieve all plugins of a specific type.
   * Optionally filter to only enabled plugins.
   */
  getPluginsByType(type: PluginType, onlyEnabled = false): LoadedPlugin[] {
    const results: LoadedPlugin[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.manifest.type === type) {
        if (!onlyEnabled || plugin.enabled) {
          results.push(plugin);
        }
      }
    }
    return results;
  }

  /**
   * Get all registered plugins as an array.
   */
  getAllPlugins(onlyEnabled = false): LoadedPlugin[] {
    const all = Array.from(this.plugins.values());
    return onlyEnabled ? all.filter((p) => p.enabled) : all;
  }

  /**
   * Return summary info for all registered plugins.
   */
  listPlugins(): PluginInfo[] {
    return Array.from(this.plugins.values()).map((p) => ({
      name: p.manifest.name,
      version: p.manifest.version,
      type: p.manifest.type,
      description: p.manifest.description,
      author: p.manifest.author,
      enabled: p.enabled,
      loadedAt: p.loadedAt,
    }));
  }

  /**
   * Return the count of registered plugins, optionally filtered by type or
   * enabled state.
   */
  count(filter?: { type?: PluginType; enabled?: boolean }): number {
    if (!filter) return this.plugins.size;
    let n = 0;
    for (const p of this.plugins.values()) {
      if (filter.type !== undefined && p.manifest.type !== filter.type) continue;
      if (filter.enabled !== undefined && p.enabled !== filter.enabled) continue;
      n++;
    }
    return n;
  }

  // ── Enable / Disable ───────────────────────────────────────────────

  /**
   * Check whether a plugin is currently enabled.
   * Throws PluginNotFoundError if not registered.
   */
  isEnabled(name: string): boolean {
    return this.requirePlugin(name).enabled;
  }

  /**
   * Enable a registered plugin.
   * No-op if already enabled.
   */
  enable(name: string): void {
    const plugin = this.requirePlugin(name);
    if (plugin.enabled) {
      this.logger.debug('Plugin already enabled', { name });
      return;
    }
    plugin.enabled = true;
    this.logger.info('Plugin enabled', { name });
    this.emit('enabled', plugin);
  }

  /**
   * Disable a registered plugin.
   * Disabled plugins remain in the registry but are excluded from
   * getPluginsByType / getAllPlugins when onlyEnabled=true.
   * No-op if already disabled.
   */
  disable(name: string): void {
    const plugin = this.requirePlugin(name);
    if (!plugin.enabled) {
      this.logger.debug('Plugin already disabled', { name });
      return;
    }
    plugin.enabled = false;
    this.logger.info('Plugin disabled', { name });
    this.emit('disabled', plugin);
  }

  /**
   * Toggle the enabled state of a plugin.
   */
  toggle(name: string): boolean {
    const plugin = this.requirePlugin(name);
    if (plugin.enabled) {
      this.disable(name);
    } else {
      this.enable(name);
    }
    return plugin.enabled;
  }

  // ── Existence Checks ───────────────────────────────────────────────

  /**
   * Returns true if a plugin with the given name is registered.
   */
  has(name: string): boolean {
    return this.plugins.has(name);
  }

  // ── Bulk Operations ────────────────────────────────────────────────

  /**
   * Register multiple plugins at once.
   * Stops on the first error unless continueOnError is true.
   */
  registerAll(plugins: LoadedPlugin[], continueOnError = false): void {
    for (const plugin of plugins) {
      try {
        this.register(plugin);
      } catch (error) {
        if (continueOnError) {
          this.logger.error('Failed to register plugin (continuing)', {
            name: plugin.manifest.name,
            error: String(error),
          });
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Remove all registered plugins.
   */
  clear(): void {
    const count = this.plugins.size;
    this.plugins.clear();
    this.logger.info('Plugin registry cleared', { removedCount: count });
  }

  // ── Event Listeners ────────────────────────────────────────────────

  /**
   * Subscribe to registry lifecycle events.
   */
  on(event: PluginRegistryEvent, listener: PluginEventListener): () => void {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    // Return an unsubscribe function
    return () => {
      const updated = (this.listeners.get(event) ?? []).filter(
        (l) => l !== listener,
      );
      this.listeners.set(event, updated);
    };
  }

  private emit(event: PluginRegistryEvent, plugin: LoadedPlugin): void {
    const list = this.listeners.get(event) ?? [];
    for (const listener of list) {
      try {
        listener(plugin);
      } catch (error) {
        this.logger.error('Plugin registry event listener threw', {
          event,
          pluginName: plugin.manifest.name,
          error: String(error),
        });
      }
    }
  }
}

// ── Event Types ──────────────────────────────────────────────────────

export type PluginRegistryEvent =
  | 'registered'
  | 'unregistered'
  | 'enabled'
  | 'disabled';

export type PluginEventListener = (plugin: LoadedPlugin) => void;

// ── Singleton Registry ───────────────────────────────────────────────

let _defaultRegistry: PluginRegistry | null = null;

/**
 * Get (or lazily create) the process-level default plugin registry.
 * Most application code should use this singleton rather than creating
 * their own registry instance.
 */
export function getDefaultRegistry(): PluginRegistry {
  if (!_defaultRegistry) {
    _defaultRegistry = new PluginRegistry();
  }
  return _defaultRegistry;
}

/**
 * Replace the default registry — primarily useful in tests.
 */
export function setDefaultRegistry(registry: PluginRegistry | null): void {
  _defaultRegistry = registry;
}
