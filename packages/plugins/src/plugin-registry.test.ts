import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PluginRegistry,
  getDefaultRegistry,
  setDefaultRegistry,
} from './plugin-registry.js';
import {
  PluginNotFoundError,
  PluginAlreadyRegisteredError,
} from './plugin-types.js';
import type { LoadedPlugin } from './plugin-types.js';
import { createNoopLogger } from './logger-compat.js';

// ── Fixtures ─────────────────────────────────────────────────────────

function makePlugin(overrides: Partial<LoadedPlugin> = {}): LoadedPlugin {
  return {
    manifest: {
      name: 'test-plugin',
      version: '1.0.0',
      type: 'transformation',
      description: 'A test plugin',
      entryPoint: './index.js',
    },
    instance: {
      name: 'test-plugin',
      description: 'test',
      transform: (data, _cfg) => data,
      configSchema: {} as never,
    },
    entryPath: '/plugins/test-plugin/index.js',
    loadedAt: new Date(),
    enabled: true,
    ...overrides,
  };
}

function makeConnectorPlugin(name: string): LoadedPlugin {
  return makePlugin({
    manifest: {
      name,
      version: '1.0.0',
      type: 'connector',
      description: `Connector plugin ${name}`,
      entryPoint: './index.js',
    },
  });
}

function makeVizPlugin(name: string): LoadedPlugin {
  return makePlugin({
    manifest: {
      name,
      version: '1.0.0',
      type: 'visualization',
      description: `Visualization plugin ${name}`,
      entryPoint: './index.js',
    },
  });
}

// ── register ─────────────────────────────────────────────────────────

describe('PluginRegistry.register', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry({ logger: createNoopLogger() });
  });

  it('registers a plugin successfully', () => {
    const plugin = makePlugin();
    expect(() => registry.register(plugin)).not.toThrow();
    expect(registry.has('test-plugin')).toBe(true);
  });

  it('throws PluginAlreadyRegisteredError on duplicate name', () => {
    registry.register(makePlugin());
    expect(() => registry.register(makePlugin())).toThrow(
      PluginAlreadyRegisteredError,
    );
  });

  it('overrides existing plugin when allowOverride=true', () => {
    const reg = new PluginRegistry({ allowOverride: true, logger: createNoopLogger() });
    reg.register(makePlugin({ manifest: { name: 'test-plugin', version: '1.0.0', type: 'transformation', description: 'v1', entryPoint: './index.js' } }));
    reg.register(makePlugin({ manifest: { name: 'test-plugin', version: '2.0.0', type: 'transformation', description: 'v2', entryPoint: './index.js' } }));
    const plugin = reg.requirePlugin('test-plugin');
    expect(plugin.manifest.version).toBe('2.0.0');
  });

  it('emits registered event', () => {
    const listener = vi.fn();
    registry.on('registered', listener);
    registry.register(makePlugin());
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].manifest.name).toBe('test-plugin');
  });

  it('count increases after registering', () => {
    expect(registry.count()).toBe(0);
    registry.register(makePlugin({ manifest: { name: 'a', version: '1.0.0', type: 'transformation', description: 'd', entryPoint: './i.js' } }));
    expect(registry.count()).toBe(1);
    registry.register(makeConnectorPlugin('b'));
    expect(registry.count()).toBe(2);
  });
});

// ── unregister ───────────────────────────────────────────────────────

describe('PluginRegistry.unregister', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry({ logger: createNoopLogger() });
  });

  it('removes the plugin', () => {
    registry.register(makePlugin());
    registry.unregister('test-plugin');
    expect(registry.has('test-plugin')).toBe(false);
  });

  it('throws PluginNotFoundError when plugin does not exist', () => {
    expect(() => registry.unregister('ghost')).toThrow(PluginNotFoundError);
  });

  it('emits unregistered event', () => {
    const listener = vi.fn();
    registry.on('unregistered', listener);
    registry.register(makePlugin());
    registry.unregister('test-plugin');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

// ── getPlugin / requirePlugin ─────────────────────────────────────────

describe('PluginRegistry.getPlugin / requirePlugin', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry({ logger: createNoopLogger() });
    registry.register(makePlugin());
  });

  it('getPlugin returns the plugin by name', () => {
    const p = registry.getPlugin('test-plugin');
    expect(p).toBeDefined();
    expect(p!.manifest.name).toBe('test-plugin');
  });

  it('getPlugin returns undefined for unknown name', () => {
    expect(registry.getPlugin('unknown')).toBeUndefined();
  });

  it('requirePlugin returns the plugin', () => {
    const p = registry.requirePlugin('test-plugin');
    expect(p.manifest.name).toBe('test-plugin');
  });

  it('requirePlugin throws PluginNotFoundError for unknown name', () => {
    expect(() => registry.requirePlugin('unknown')).toThrow(PluginNotFoundError);
  });
});

// ── getPluginsByType ──────────────────────────────────────────────────

describe('PluginRegistry.getPluginsByType', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry({ logger: createNoopLogger() });
    registry.register(makeConnectorPlugin('conn-1'));
    registry.register(makeConnectorPlugin('conn-2'));
    registry.register(makeVizPlugin('viz-1'));
    registry.register(makePlugin({ manifest: { name: 'transform-1', version: '1.0.0', type: 'transformation', description: 'd', entryPoint: './i.js' } }));
  });

  it('returns all connector plugins', () => {
    const connectors = registry.getPluginsByType('connector');
    expect(connectors).toHaveLength(2);
    expect(connectors.every((p) => p.manifest.type === 'connector')).toBe(true);
  });

  it('returns all visualization plugins', () => {
    const viz = registry.getPluginsByType('visualization');
    expect(viz).toHaveLength(1);
  });

  it('returns empty array when no plugins of that type', () => {
    expect(registry.getPluginsByType('api')).toHaveLength(0);
  });

  it('filters by enabled when onlyEnabled=true', () => {
    registry.disable('conn-1');
    const all = registry.getPluginsByType('connector');
    const enabled = registry.getPluginsByType('connector', true);
    expect(all).toHaveLength(2);
    expect(enabled).toHaveLength(1);
    expect(enabled[0].manifest.name).toBe('conn-2');
  });
});

// ── listPlugins ───────────────────────────────────────────────────────

describe('PluginRegistry.listPlugins', () => {
  it('returns PluginInfo summaries for all registered plugins', () => {
    const registry = new PluginRegistry({ logger: createNoopLogger() });
    registry.register(makePlugin());
    registry.register(makeConnectorPlugin('conn'));

    const list = registry.listPlugins();
    expect(list).toHaveLength(2);
    for (const info of list) {
      expect(info).toHaveProperty('name');
      expect(info).toHaveProperty('version');
      expect(info).toHaveProperty('type');
      expect(info).toHaveProperty('description');
      expect(info).toHaveProperty('enabled');
      expect(info).toHaveProperty('loadedAt');
    }
  });

  it('returns empty array when registry is empty', () => {
    const registry = new PluginRegistry({ logger: createNoopLogger() });
    expect(registry.listPlugins()).toHaveLength(0);
  });
});

// ── enable / disable / isEnabled ─────────────────────────────────────

describe('PluginRegistry enable / disable', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry({ logger: createNoopLogger() });
    registry.register(makePlugin());
  });

  it('isEnabled returns true for newly registered plugin', () => {
    expect(registry.isEnabled('test-plugin')).toBe(true);
  });

  it('disable sets enabled=false', () => {
    registry.disable('test-plugin');
    expect(registry.isEnabled('test-plugin')).toBe(false);
  });

  it('enable sets enabled=true', () => {
    registry.disable('test-plugin');
    registry.enable('test-plugin');
    expect(registry.isEnabled('test-plugin')).toBe(true);
  });

  it('disable is a no-op when already disabled', () => {
    registry.disable('test-plugin');
    expect(() => registry.disable('test-plugin')).not.toThrow();
    expect(registry.isEnabled('test-plugin')).toBe(false);
  });

  it('enable is a no-op when already enabled', () => {
    expect(() => registry.enable('test-plugin')).not.toThrow();
    expect(registry.isEnabled('test-plugin')).toBe(true);
  });

  it('throws PluginNotFoundError when enabling unknown plugin', () => {
    expect(() => registry.enable('ghost')).toThrow(PluginNotFoundError);
  });

  it('throws PluginNotFoundError when disabling unknown plugin', () => {
    expect(() => registry.disable('ghost')).toThrow(PluginNotFoundError);
  });

  it('throws PluginNotFoundError when checking isEnabled for unknown plugin', () => {
    expect(() => registry.isEnabled('ghost')).toThrow(PluginNotFoundError);
  });

  it('emits enabled event on enable', () => {
    const listener = vi.fn();
    registry.on('enabled', listener);
    registry.disable('test-plugin');
    registry.enable('test-plugin');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('emits disabled event on disable', () => {
    const listener = vi.fn();
    registry.on('disabled', listener);
    registry.disable('test-plugin');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('toggle switches enabled state', () => {
    expect(registry.isEnabled('test-plugin')).toBe(true);
    registry.toggle('test-plugin');
    expect(registry.isEnabled('test-plugin')).toBe(false);
    registry.toggle('test-plugin');
    expect(registry.isEnabled('test-plugin')).toBe(true);
  });
});

// ── getAllPlugins ─────────────────────────────────────────────────────

describe('PluginRegistry.getAllPlugins', () => {
  it('returns all plugins', () => {
    const registry = new PluginRegistry({ logger: createNoopLogger() });
    registry.register(makePlugin());
    registry.register(makeConnectorPlugin('conn'));
    expect(registry.getAllPlugins()).toHaveLength(2);
  });

  it('filters to only enabled when flag is set', () => {
    const registry = new PluginRegistry({ logger: createNoopLogger() });
    registry.register(makePlugin());
    registry.register(makeConnectorPlugin('conn'));
    registry.disable('conn');
    expect(registry.getAllPlugins(true)).toHaveLength(1);
  });
});

// ── registerAll ───────────────────────────────────────────────────────

describe('PluginRegistry.registerAll', () => {
  it('registers multiple plugins at once', () => {
    const registry = new PluginRegistry({ logger: createNoopLogger() });
    registry.registerAll([makePlugin(), makeConnectorPlugin('conn')]);
    expect(registry.count()).toBe(2);
  });

  it('throws on first error by default', () => {
    const registry = new PluginRegistry({ logger: createNoopLogger() });
    registry.register(makePlugin());
    // second call has duplicate name
    expect(() => registry.registerAll([makePlugin(), makeConnectorPlugin('conn')])).toThrow(
      PluginAlreadyRegisteredError,
    );
    // 'conn' was not registered because we threw before reaching it
    expect(registry.has('conn')).toBe(false);
  });

  it('continues after errors when continueOnError=true', () => {
    const registry = new PluginRegistry({ logger: createNoopLogger() });
    registry.register(makePlugin());
    // First in list is duplicate, second is new
    registry.registerAll([makePlugin(), makeConnectorPlugin('conn')], true);
    expect(registry.has('conn')).toBe(true);
  });
});

// ── clear ─────────────────────────────────────────────────────────────

describe('PluginRegistry.clear', () => {
  it('removes all registered plugins', () => {
    const registry = new PluginRegistry({ logger: createNoopLogger() });
    registry.register(makePlugin());
    registry.register(makeConnectorPlugin('conn'));
    registry.clear();
    expect(registry.count()).toBe(0);
  });
});

// ── count ─────────────────────────────────────────────────────────────

describe('PluginRegistry.count', () => {
  it('counts by type', () => {
    const registry = new PluginRegistry({ logger: createNoopLogger() });
    registry.register(makeConnectorPlugin('c1'));
    registry.register(makeConnectorPlugin('c2'));
    registry.register(makeVizPlugin('v1'));
    expect(registry.count({ type: 'connector' })).toBe(2);
    expect(registry.count({ type: 'visualization' })).toBe(1);
    expect(registry.count({ type: 'api' })).toBe(0);
  });

  it('counts by enabled state', () => {
    const registry = new PluginRegistry({ logger: createNoopLogger() });
    registry.register(makePlugin());
    registry.register(makeConnectorPlugin('conn'));
    registry.disable('conn');
    expect(registry.count({ enabled: true })).toBe(1);
    expect(registry.count({ enabled: false })).toBe(1);
  });
});

// ── event listener unsubscribe ────────────────────────────────────────

describe('PluginRegistry event listener unsubscribe', () => {
  it('stops calling listener after unsubscribe', () => {
    const registry = new PluginRegistry({ logger: createNoopLogger() });
    const listener = vi.fn();
    const unsub = registry.on('registered', listener);
    registry.register(makePlugin());
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    registry.register(makeConnectorPlugin('conn'));
    expect(listener).toHaveBeenCalledTimes(1); // still 1
  });
});

// ── singleton default registry ────────────────────────────────────────

describe('getDefaultRegistry / setDefaultRegistry', () => {
  it('creates a default registry on first call', () => {
    setDefaultRegistry(null);
    const reg = getDefaultRegistry();
    expect(reg).toBeInstanceOf(PluginRegistry);
  });

  it('returns the same instance on subsequent calls', () => {
    setDefaultRegistry(null);
    const a = getDefaultRegistry();
    const b = getDefaultRegistry();
    expect(a).toBe(b);
  });

  it('setDefaultRegistry replaces the singleton', () => {
    const custom = new PluginRegistry({ logger: createNoopLogger() });
    setDefaultRegistry(custom);
    expect(getDefaultRegistry()).toBe(custom);
    setDefaultRegistry(null); // restore
  });
});
