// CLI configuration management — reads/writes ~/.meridian/config.json

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OutputFormat = 'table' | 'json' | 'csv';

export interface CliConfig {
  /** Meridian server base URL */
  serverUrl: string;
  /** API authentication token */
  apiToken?: string;
  /** Default output format for tabular data */
  outputFormat: OutputFormat;
  /** Whether to use colors in output */
  color: boolean;
  /** Request timeout in milliseconds */
  timeoutMs: number;
}

export type PartialCliConfig = Partial<CliConfig>;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const CONFIG_DIR = path.join(os.homedir(), '.meridian');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigFile(): string {
  return CONFIG_FILE;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_CONFIG: CliConfig = {
  serverUrl: 'http://localhost:3001',
  outputFormat: 'table',
  color: true,
  timeoutMs: 30_000,
};

// ---------------------------------------------------------------------------
// Read / Write
// ---------------------------------------------------------------------------

/**
 * Load config from disk, merging with defaults.
 * Returns DEFAULT_CONFIG if the file doesn't exist yet.
 */
export function loadConfig(): CliConfig {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return { ...DEFAULT_CONFIG };
    }
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as PartialCliConfig;
    return mergeConfig(parsed);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Write (full or partial) config to disk.
 * Merges with existing config so only specified keys are updated.
 */
export function saveConfig(updates: PartialCliConfig): void {
  const existing = loadConfig();
  const merged = { ...existing, ...updates };

  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
}

/**
 * Delete the config file (reset to defaults).
 */
export function deleteConfig(): void {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
  }
}

/**
 * Get a single config value by key.
 */
export function getConfigValue(key: keyof CliConfig): unknown {
  const config = loadConfig();
  return config[key];
}

/**
 * Set a single config value by key.
 */
export function setConfigValue(key: string, value: string): void {
  const update: PartialCliConfig = {};
  const typed = key as keyof CliConfig;

  switch (typed) {
    case 'serverUrl':
    case 'apiToken':
      (update as Record<string, unknown>)[typed] = value;
      break;
    case 'outputFormat':
      if (!['table', 'json', 'csv'].includes(value)) {
        throw new Error(`Invalid outputFormat: "${value}". Must be table, json, or csv.`);
      }
      update.outputFormat = value as OutputFormat;
      break;
    case 'color':
      update.color = value === 'true' || value === '1' || value === 'yes';
      break;
    case 'timeoutMs':
      const ms = parseInt(value, 10);
      if (isNaN(ms) || ms <= 0) {
        throw new Error(`Invalid timeoutMs: "${value}". Must be a positive integer.`);
      }
      update.timeoutMs = ms;
      break;
    default:
      throw new Error(`Unknown config key: "${key}"`);
  }

  saveConfig(update);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mergeConfig(partial: PartialCliConfig): CliConfig {
  return {
    serverUrl: partial.serverUrl ?? DEFAULT_CONFIG.serverUrl,
    apiToken: partial.apiToken,
    outputFormat: partial.outputFormat ?? DEFAULT_CONFIG.outputFormat,
    color: partial.color ?? DEFAULT_CONFIG.color,
    timeoutMs: partial.timeoutMs ?? DEFAULT_CONFIG.timeoutMs,
  };
}
