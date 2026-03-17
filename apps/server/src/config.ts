import { z } from 'zod';

// ── Server Configuration Schema ─────────────────────────────────────

const configSchema = z.object({
  /** PostgreSQL connection URL for the metadata database */
  DATABASE_URL: z.string().url().default('postgresql://meridian:meridian@localhost:5432/meridian'),

  /** Redis connection URL for cache and queues */
  REDIS_URL: z.string().default('redis://localhost:6379'),

  /** JWT signing secret — must be at least 32 characters */
  JWT_SECRET: z.string().min(32).default('meridian-dev-secret-change-me-in-production-32chars'),

  /** HTTP port to listen on */
  PORT: z.coerce.number().int().positive().default(3001),

  /** Pino log level */
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),

  /** Allowed CORS origins (comma-separated for multiple) */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  /** Whether to enable Swagger documentation UI */
  SWAGGER_ENABLED: z.coerce.boolean().default(true),

  /** Node environment */
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  /** Access token expiry duration */
  ACCESS_TOKEN_EXPIRY: z.string().default('15m'),

  /** Refresh token expiry duration */
  REFRESH_TOKEN_EXPIRY: z.string().default('7d'),

  /** JWT issuer claim */
  JWT_ISSUER: z.string().default('meridian'),

  /** Rate limit: max requests per window */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  /** Rate limit: time window in milliseconds */
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  /** Whether to trust the proxy X-Forwarded-For header */
  TRUST_PROXY: z.coerce.boolean().default(false),

  /** Embed token expiry duration */
  EMBED_TOKEN_EXPIRY: z.string().default('24h'),
});

export type ServerConfig = z.infer<typeof configSchema>;

let _config: ServerConfig | null = null;

/**
 * Load and validate server configuration from environment variables.
 * Returns a cached instance on subsequent calls.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  if (_config) return _config;

  const result = configSchema.safeParse(env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid server configuration:\n${formatted}`);
  }

  _config = result.data;
  return _config;
}

/**
 * Get the current config (throws if loadConfig hasn't been called).
 */
export function getConfig(): ServerConfig {
  if (!_config) {
    throw new Error('Config not loaded. Call loadConfig() first.');
  }
  return _config;
}

/**
 * Reset cached config — used in tests.
 */
export function resetConfig(): void {
  _config = null;
}

/**
 * Parse CORS_ORIGIN string into an array of origins.
 */
export function parseCorsOrigins(origin: string): string[] {
  if (origin === '*') return ['*'];
  return origin.split(',').map((o) => o.trim()).filter(Boolean);
}
