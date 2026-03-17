import { describe, it, expect, vi } from 'vitest';
import {
  createPluginContext,
  createScopedPluginContext,
  createTestPluginContext,
  buildScopedConfig,
} from './plugin-context.js';
import { MeridianError } from '@meridian/shared';
import type { PluginManifest } from '@meridian/shared';
import type { ServiceContainer } from './plugin-types.js';
import { createNoopLogger } from './logger-compat.js';
import type { Logger } from './logger-compat.js';

// ── Fixtures ─────────────────────────────────────────────────────────

const MANIFEST: PluginManifest = {
  name: 'my-plugin',
  version: '1.2.3',
  type: 'transformation',
  description: 'Test plugin',
  entryPoint: './index.js',
};

function makeServices(
  config: Record<string, unknown> = {},
  logger?: Logger,
): ServiceContainer {
  return {
    logger: logger ?? createNoopLogger(),
    config,
  };
}

// ── createPluginContext ───────────────────────────────────────────────

describe('createPluginContext', () => {
  it('returns a context with the correct manifest', () => {
    const ctx = createPluginContext(MANIFEST, makeServices());
    expect(ctx.manifest.name).toBe('my-plugin');
    expect(ctx.manifest.version).toBe('1.2.3');
    expect(ctx.manifest.type).toBe('transformation');
  });

  it('manifest is frozen (immutable)', () => {
    const ctx = createPluginContext(MANIFEST, makeServices());
    expect(Object.isFrozen(ctx.manifest)).toBe(true);
    expect(() => {
      (ctx.manifest as any).name = 'hacked';
    }).toThrow();
  });

  it('provides a scoped logger with plugin bindings', () => {
    const childSpy = vi.fn().mockReturnValue(createNoopLogger());
    const mockLogger: Logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: childSpy,
    };

    createPluginContext(MANIFEST, makeServices({}, mockLogger));

    expect(childSpy).toHaveBeenCalledOnce();
    const bindings = childSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(bindings.plugin).toBe('my-plugin');
    expect(bindings.pluginVersion).toBe('1.2.3');
    expect(bindings.pluginType).toBe('transformation');
  });

  it('getConfig returns config value by key', () => {
    const ctx = createPluginContext(
      MANIFEST,
      makeServices({ delimiter: ',', maxRows: 100 }),
    );
    expect(ctx.getConfig('delimiter')).toBe(',');
    expect(ctx.getConfig<number>('maxRows')).toBe(100);
  });

  it('getConfig returns undefined for missing key', () => {
    const ctx = createPluginContext(MANIFEST, makeServices({ a: 1 }));
    expect(ctx.getConfig('nonexistent')).toBeUndefined();
  });

  it('requireConfig returns value when present', () => {
    const ctx = createPluginContext(
      MANIFEST,
      makeServices({ apiKey: 'secret' }),
    );
    expect(ctx.requireConfig('apiKey')).toBe('secret');
  });

  it('requireConfig throws MeridianError when key is missing', () => {
    const ctx = createPluginContext(MANIFEST, makeServices({}));
    expect(() => ctx.requireConfig('missingKey')).toThrow(MeridianError);
  });

  it('requireConfig throws MeridianError when value is null', () => {
    const ctx = createPluginContext(
      MANIFEST,
      makeServices({ nullKey: null }),
    );
    expect(() => ctx.requireConfig('nullKey')).toThrow(MeridianError);
  });

  it('error message from requireConfig mentions the missing key', () => {
    const ctx = createPluginContext(MANIFEST, makeServices({}));
    expect(() => ctx.requireConfig('someKey')).toThrow(/someKey/);
  });

  it('error message from requireConfig mentions the plugin name', () => {
    const ctx = createPluginContext(MANIFEST, makeServices({}));
    expect(() => ctx.requireConfig('someKey')).toThrow(/my-plugin/);
  });

  it('config is read-only — mutations to original services config do not propagate', () => {
    const mutableConfig: Record<string, unknown> = { key: 'original' };
    const ctx = createPluginContext(MANIFEST, makeServices(mutableConfig));
    mutableConfig['key'] = 'mutated';
    // The context has its own frozen snapshot
    expect(ctx.getConfig('key')).toBe('original');
  });
});

// ── buildScopedConfig ─────────────────────────────────────────────────

describe('buildScopedConfig', () => {
  it('extracts prefixed keys and strips the prefix', () => {
    const full = {
      'csv-import.delimiter': ';',
      'csv-import.hasHeaders': false,
      'json-import.dataPath': 'data',
    };
    const scoped = buildScopedConfig('csv-import', full);
    expect(scoped).toEqual({ delimiter: ';', hasHeaders: false });
  });

  it('includes global keys (no dot) alongside scoped keys', () => {
    const full = {
      'my-plugin.key': 'value',
      globalKey: 'global',
    };
    const scoped = buildScopedConfig('my-plugin', full);
    expect(scoped.key).toBe('value');
    expect(scoped.globalKey).toBe('global');
  });

  it('excludes keys from other plugins', () => {
    const full = {
      'other-plugin.key': 'other',
      'my-plugin.key': 'mine',
    };
    const scoped = buildScopedConfig('my-plugin', full);
    expect(scoped).not.toHaveProperty('other-plugin.key');
    expect(scoped.key).toBe('mine');
  });

  it('returns empty object when no matching keys', () => {
    const scoped = buildScopedConfig('ghost', { 'other.key': 1 });
    expect(Object.keys(scoped)).toHaveLength(0);
  });

  it('handles empty config', () => {
    expect(buildScopedConfig('plugin', {})).toEqual({});
  });
});

// ── createScopedPluginContext ─────────────────────────────────────────

describe('createScopedPluginContext', () => {
  it('strips the plugin name prefix from config keys', () => {
    const services: ServiceContainer = {
      logger: createNoopLogger(),
      config: {
        'my-plugin.delimiter': ',',
        'other-plugin.foo': 'bar',
      },
    };
    const ctx = createScopedPluginContext(MANIFEST, services);
    expect(ctx.getConfig('delimiter')).toBe(',');
    expect(ctx.getConfig('foo')).toBeUndefined();
    expect(ctx.getConfig('other-plugin.foo')).toBeUndefined();
  });

  it('still has access to global (unprefixed) keys', () => {
    const services: ServiceContainer = {
      logger: createNoopLogger(),
      config: {
        'my-plugin.key': 'scoped',
        globalFlag: true,
      },
    };
    const ctx = createScopedPluginContext(MANIFEST, services);
    expect(ctx.getConfig('globalFlag')).toBe(true);
  });
});

// ── createTestPluginContext ───────────────────────────────────────────

describe('createTestPluginContext', () => {
  it('creates a context with the given manifest', () => {
    const ctx = createTestPluginContext(MANIFEST);
    expect(ctx.manifest.name).toBe('my-plugin');
  });

  it('creates a context with the given config', () => {
    const ctx = createTestPluginContext(MANIFEST, { key: 'val' });
    expect(ctx.getConfig('key')).toBe('val');
  });

  it('uses provided logger', () => {
    const childSpy = vi.fn().mockReturnValue(createNoopLogger());
    const customLogger: Logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: childSpy,
    };
    createTestPluginContext(MANIFEST, {}, customLogger);
    expect(childSpy).toHaveBeenCalledOnce();
  });

  it('uses noop logger by default (no output)', () => {
    // Should not throw or produce output
    const ctx = createTestPluginContext(MANIFEST);
    expect(() => ctx.logger.info('test message')).not.toThrow();
  });

  it('requireConfig works in test context', () => {
    const ctx = createTestPluginContext(MANIFEST, { dbUrl: 'sqlite://test' });
    expect(ctx.requireConfig('dbUrl')).toBe('sqlite://test');
  });

  it('requireConfig throws when key missing in test context', () => {
    const ctx = createTestPluginContext(MANIFEST);
    expect(() => ctx.requireConfig('missing')).toThrow(MeridianError);
  });
});

// ── Logger scoping ────────────────────────────────────────────────────

describe('Plugin context logger scoping', () => {
  it('logger is a child of the service logger with plugin metadata', () => {
    const childLogger: Logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnValue(createNoopLogger()),
    };
    const parentLogger: Logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnValue(childLogger),
    };

    const ctx = createPluginContext(MANIFEST, makeServices({}, parentLogger));

    // Calling ctx.logger.info should go to the child logger
    ctx.logger.info('hello');
    expect(childLogger.info).toHaveBeenCalledWith('hello');
  });
});
