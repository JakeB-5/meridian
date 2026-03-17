import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { ServerConfig } from '../config.js';

// ── CORS Origin Helpers ──────────────────────────────────────────────

/**
 * Parse a comma-separated CORS origin string into an array of origins.
 * Returns ['*'] if the value is the wildcard.
 */
function parseOrigins(raw: string): string[] {
  if (raw === '*') return ['*'];
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Determine whether a given request origin is permitted.
 * Supports exact string matches and simple wildcard subdomain patterns
 * such as "https://*.example.com".
 */
function isOriginAllowed(origin: string, allowed: string[]): boolean {
  for (const pattern of allowed) {
    if (pattern === '*') return true;
    if (pattern === origin) return true;

    // Wildcard subdomain: https://*.example.com
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1); // ".example.com"
      if (origin.endsWith(suffix)) return true;
    }
  }
  return false;
}

// ── Registration ─────────────────────────────────────────────────────

/**
 * Register CORS middleware on a Fastify instance.
 *
 * Behaviour is driven by the `CORS_ORIGIN` environment variable:
 * - `*`            → allow all origins (development convenience)
 * - single origin  → allow exactly that origin
 * - comma list     → allow any origin in the list
 * - wildcard entry → e.g. `https://*.example.com` allows all subdomains
 *
 * Credentials are always enabled so session cookies and Authorization
 * headers work correctly for authenticated frontends.
 */
export async function registerCors(
  app: FastifyInstance,
  config: Pick<ServerConfig, 'CORS_ORIGIN'>,
): Promise<void> {
  const origins = parseOrigins(config.CORS_ORIGIN);
  const allowAll = origins.includes('*');

  await app.register(cors, {
    /**
     * Dynamic origin resolver — called per request.
     * For wildcard configs we reflect the request origin back so that
     * `credentials: true` is compatible (browsers block wildcard + credentials).
     */
    origin: (requestOrigin, cb) => {
      if (!requestOrigin) {
        // Same-origin or non-browser request — always permit
        cb(null, true);
        return;
      }

      if (allowAll || isOriginAllowed(requestOrigin, origins)) {
        cb(null, requestOrigin);
      } else {
        cb(new Error(`CORS: origin '${requestOrigin}' is not allowed`), false);
      }
    },

    credentials: true,

    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],

    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-Embed-Token',
      'X-Requested-With',
      'Accept',
      'Accept-Language',
      'Cache-Control',
    ],

    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-Request-Id',
      'X-Export-Job-Id',
      'X-Export-Row-Count',
      'Content-Disposition',
    ],

    // Cache preflight for 24 hours
    maxAge: 86_400,

    // Reply to preflight with 204 No Content
    optionsSuccessStatus: 204,
  });
}

/**
 * Build a CORS origin array for direct use with @fastify/cors `origin` option
 * when a simple string/array is preferred over the dynamic resolver.
 */
export function buildCorsOrigins(
  rawOrigin: string,
): true | string[] {
  const origins = parseOrigins(rawOrigin);
  if (origins.includes('*')) return true;
  return origins;
}
