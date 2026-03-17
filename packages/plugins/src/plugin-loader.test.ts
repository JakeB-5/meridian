import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { PluginLoader, validatePluginManifest } from './plugin-loader.js';
import {
  PluginLoadError,
  PluginManifestError,
} from './plugin-types.js';
import { createNoopLogger } from './logger-compat.js';

// ── Helpers ──────────────────────────────────────────────────────────

/** Create a temporary directory for each test */
async function makeTmpDir(): Promise<string> {
  const dir = join(tmpdir(), `meridian-plugin-test-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Write a plugin manifest file */
async function writeManifest(
  dir: string,
  manifest: Record<string, unknown>,
  filename = 'meridian-plugin.json',
): Promise<string> {
  const path = join(dir, filename);
  await writeFile(path, JSON.stringify(manifest), 'utf-8');
  return path;
}

/** Write a plugin entry module that exports a simple factory */
async function writeEntryModule(dir: string, filename = 'index.mjs'): Promise<string> {
  const path = join(dir, filename);
  // Must export a default function that returns a plugin instance
  const content = `
export default function(context) {
  return {
    name: 'test-plugin',
    description: 'A simple test plugin',
    transform: (data, _config) => data,
    configSchema: { parse: (v) => v },
  };
}
`;
  await writeFile(path, content, 'utf-8');
  return path;
}

const VALID_MANIFEST = {
  name: 'test-plugin',
  version: '1.0.0',
  type: 'transformation',
  description: 'A test plugin for unit tests',
  author: 'Test Author',
  entryPoint: './index.mjs',
};

// ── validateManifest ─────────────────────────────────────────────────

describe('PluginLoader.validateManifest', () => {
  const loader = new PluginLoader({ logger: createNoopLogger() });

  it('returns ok for a valid manifest', () => {
    const result = loader.validateManifest(VALID_MANIFEST);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('test-plugin');
      expect(result.value.version).toBe('1.0.0');
      expect(result.value.type).toBe('transformation');
    }
  });

  it('returns err when name is missing', () => {
    const result = loader.validateManifest({ ...VALID_MANIFEST, name: undefined });
    expect(result.ok).toBe(false);
  });

  it('returns err when name contains invalid characters', () => {
    const result = loader.validateManifest({ ...VALID_MANIFEST, name: 'My Plugin!' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(PluginManifestError);
    }
  });

  it('returns err when version is not semver', () => {
    const result = loader.validateManifest({ ...VALID_MANIFEST, version: 'v1' });
    expect(result.ok).toBe(false);
  });

  it('returns err when type is unknown', () => {
    const result = loader.validateManifest({ ...VALID_MANIFEST, type: 'unknown-type' });
    expect(result.ok).toBe(false);
  });

  it('accepts all valid plugin types', () => {
    for (const type of ['connector', 'visualization', 'transformation', 'api']) {
      const result = loader.validateManifest({ ...VALID_MANIFEST, type });
      expect(result.ok).toBe(true);
    }
  });

  it('allows optional fields to be omitted', () => {
    const minimal = {
      name: 'minimal-plugin',
      version: '0.0.1',
      type: 'api',
      description: 'Minimal plugin',
      entryPoint: './index.js',
    };
    const result = loader.validateManifest(minimal);
    expect(result.ok).toBe(true);
  });

  it('validates homepageUrl as a proper URL when provided', () => {
    const result = loader.validateManifest({
      ...VALID_MANIFEST,
      homepageUrl: 'not-a-url',
    });
    expect(result.ok).toBe(false);
  });

  it('accepts valid homepageUrl', () => {
    const result = loader.validateManifest({
      ...VALID_MANIFEST,
      homepageUrl: 'https://example.com/my-plugin',
    });
    expect(result.ok).toBe(true);
  });

  it('returns err for non-object input', () => {
    expect(loader.validateManifest(null).ok).toBe(false);
    expect(loader.validateManifest(undefined).ok).toBe(false);
    expect(loader.validateManifest('string').ok).toBe(false);
    expect(loader.validateManifest(42).ok).toBe(false);
  });

  it('returns err when description is empty', () => {
    const result = loader.validateManifest({ ...VALID_MANIFEST, description: '' });
    expect(result.ok).toBe(false);
  });
});

// ── validatePluginManifest (standalone) ──────────────────────────────

describe('validatePluginManifest (standalone)', () => {
  it('works the same as PluginLoader.validateManifest', () => {
    const result = validatePluginManifest(VALID_MANIFEST);
    expect(result.ok).toBe(true);
  });
});

// ── loadPlugin ───────────────────────────────────────────────────────

describe('PluginLoader.loadPlugin', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('throws PluginLoadError when manifest file does not exist', async () => {
    const loader = new PluginLoader({ logger: createNoopLogger() });
    await expect(
      loader.loadPlugin(join(tmpDir, 'nonexistent.json')),
    ).rejects.toBeInstanceOf(PluginLoadError);
  });

  it('throws PluginLoadError when manifest JSON is malformed', async () => {
    const manifestPath = join(tmpDir, 'meridian-plugin.json');
    await writeFile(manifestPath, '{ invalid json }', 'utf-8');
    const loader = new PluginLoader({ logger: createNoopLogger() });
    await expect(loader.loadPlugin(manifestPath)).rejects.toBeInstanceOf(
      PluginLoadError,
    );
  });

  it('throws PluginManifestError when manifest schema validation fails', async () => {
    const manifestPath = await writeManifest(tmpDir, {
      name: 'INVALID NAME WITH SPACES',
      version: '1.0.0',
      type: 'transformation',
      description: 'test',
      entryPoint: './index.mjs',
    });
    const loader = new PluginLoader({ logger: createNoopLogger() });
    await expect(loader.loadPlugin(manifestPath)).rejects.toBeInstanceOf(
      PluginManifestError,
    );
  });

  it('throws PluginLoadError when entry point module does not exist', async () => {
    const manifestPath = await writeManifest(tmpDir, {
      ...VALID_MANIFEST,
      entryPoint: './nonexistent.mjs',
    });
    const loader = new PluginLoader({ logger: createNoopLogger() });
    await expect(loader.loadPlugin(manifestPath)).rejects.toBeInstanceOf(
      PluginLoadError,
    );
  });

  it('throws PluginLoadError when module does not export a default function', async () => {
    const entryPath = join(tmpDir, 'index.mjs');
    await writeFile(entryPath, 'export const foo = 42;', 'utf-8');
    const manifestPath = await writeManifest(tmpDir, VALID_MANIFEST);
    const loader = new PluginLoader({ logger: createNoopLogger() });
    await expect(loader.loadPlugin(manifestPath)).rejects.toBeInstanceOf(
      PluginLoadError,
    );
  });

  it('returns the same loaded plugin on repeated calls with the same name', async () => {
    await writeEntryModule(tmpDir);
    const manifestPath = await writeManifest(tmpDir, VALID_MANIFEST);
    const loader = new PluginLoader({ logger: createNoopLogger() });
    const first = await loader.loadPlugin(manifestPath);
    const second = await loader.loadPlugin(manifestPath);
    expect(first.manifest.name).toBe(second.manifest.name);
    expect(loader.getLoadedPlugins().size).toBe(1);
  });

  it('marks loaded plugin as enabled by default', async () => {
    await writeEntryModule(tmpDir);
    const manifestPath = await writeManifest(tmpDir, VALID_MANIFEST);
    const loader = new PluginLoader({ logger: createNoopLogger() });
    const plugin = await loader.loadPlugin(manifestPath);
    expect(plugin.enabled).toBe(true);
  });

  it('sets loadedAt to a recent Date', async () => {
    await writeEntryModule(tmpDir);
    const manifestPath = await writeManifest(tmpDir, VALID_MANIFEST);
    const loader = new PluginLoader({ logger: createNoopLogger() });
    const before = Date.now();
    const plugin = await loader.loadPlugin(manifestPath);
    const after = Date.now();
    expect(plugin.loadedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(plugin.loadedAt.getTime()).toBeLessThanOrEqual(after);
  });
});

// ── unloadPlugin ─────────────────────────────────────────────────────

describe('PluginLoader.unloadPlugin', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('removes the plugin from loadedPlugins', async () => {
    await writeEntryModule(tmpDir);
    const manifestPath = await writeManifest(tmpDir, VALID_MANIFEST);
    const loader = new PluginLoader({ logger: createNoopLogger() });
    await loader.loadPlugin(manifestPath);
    expect(loader.isLoaded('test-plugin')).toBe(true);
    await loader.unloadPlugin('test-plugin');
    expect(loader.isLoaded('test-plugin')).toBe(false);
  });

  it('is a no-op when plugin is not loaded', async () => {
    const loader = new PluginLoader({ logger: createNoopLogger() });
    // Should not throw
    await expect(loader.unloadPlugin('nonexistent')).resolves.toBeUndefined();
  });
});

// ── loadFromDirectory ────────────────────────────────────────────────

describe('PluginLoader.loadFromDirectory', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array for empty directory', async () => {
    const loader = new PluginLoader({ logger: createNoopLogger() });
    const result = await loader.loadFromDirectory(tmpDir);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for non-existent directory', async () => {
    const loader = new PluginLoader({ logger: createNoopLogger() });
    const result = await loader.loadFromDirectory(join(tmpDir, 'no-such-dir'));
    expect(result).toHaveLength(0);
  });

  it('loads plugins from subdirectories', async () => {
    const pluginDir = join(tmpDir, 'my-plugin');
    await mkdir(pluginDir, { recursive: true });
    await writeEntryModule(pluginDir);
    await writeManifest(pluginDir, {
      ...VALID_MANIFEST,
      name: 'my-plugin',
    });

    const loader = new PluginLoader({ logger: createNoopLogger() });
    const result = await loader.loadFromDirectory(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].manifest.name).toBe('my-plugin');
  });

  it('skips directories without a recognised manifest file', async () => {
    const noManifestDir = join(tmpDir, 'no-manifest');
    await mkdir(noManifestDir, { recursive: true });
    await writeFile(join(noManifestDir, 'index.mjs'), 'export default () => {};', 'utf-8');

    const loader = new PluginLoader({ logger: createNoopLogger() });
    const result = await loader.loadFromDirectory(tmpDir);
    expect(result).toHaveLength(0);
  });

  it('continues loading other plugins when one fails', async () => {
    // Good plugin
    const goodDir = join(tmpDir, 'good-plugin');
    await mkdir(goodDir, { recursive: true });
    await writeEntryModule(goodDir);
    await writeManifest(goodDir, {
      ...VALID_MANIFEST,
      name: 'good-plugin',
    });

    // Bad plugin — entry point missing
    const badDir = join(tmpDir, 'bad-plugin');
    await mkdir(badDir, { recursive: true });
    await writeManifest(badDir, {
      ...VALID_MANIFEST,
      name: 'bad-plugin',
      entryPoint: './missing.mjs',
    });

    const loader = new PluginLoader({ logger: createNoopLogger() });
    const result = await loader.loadFromDirectory(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].manifest.name).toBe('good-plugin');
  });

  it('prefers meridian-plugin.json over plugin.json when both exist', async () => {
    const pluginDir = join(tmpDir, 'dual-manifest');
    await mkdir(pluginDir, { recursive: true });
    await writeEntryModule(pluginDir);
    await writeManifest(pluginDir, {
      ...VALID_MANIFEST,
      name: 'primary-manifest',
    }, 'meridian-plugin.json');
    await writeManifest(pluginDir, {
      ...VALID_MANIFEST,
      name: 'secondary-manifest',
    }, 'plugin.json');

    const loader = new PluginLoader({ logger: createNoopLogger() });
    const result = await loader.loadFromDirectory(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].manifest.name).toBe('primary-manifest');
  });
});
