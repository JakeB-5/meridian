import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from '@meridian/shared';
import { auditLogStore } from '../routes/admin.routes.js';

// ── Audit Middleware ─────────────────────────────────────────────────

/**
 * HTTP methods that constitute mutating (write) operations.
 * Only these methods will produce audit log entries.
 */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Map a URL path + HTTP method to a human-readable action string.
 * Falls back to `<METHOD> <path>` when no specific mapping is found.
 */
function resolveAction(method: string, url: string): string {
  // Strip query string and leading slash
  const path = url.split('?')[0].replace(/^\//, '');
  const segments = path.split('/');

  // api/<resource>/[id]/<sub-resource>
  // e.g. api/dashboards/abc123/cards  → dashboard.card.create (POST)
  //      api/questions/abc123         → question.delete (DELETE)

  const resource = segments[1]; // first segment after "api"
  const hasId = segments.length >= 3 && segments[2] !== '';
  const subResource = segments[3];

  const resourceMap: Record<string, string> = {
    dashboards: 'dashboard',
    questions: 'question',
    datasources: 'datasource',
    users: 'user',
    'semantic-models': 'semantic-model',
    export: 'export',
    admin: 'admin',
    auth: 'auth',
    plugins: 'plugin',
    embed: 'embed',
  };

  const base = resourceMap[resource] ?? resource ?? 'resource';

  if (subResource) {
    const subMap: Record<string, string> = {
      cards: 'card',
      filters: 'filter',
      metrics: 'metric',
      execute: 'execute',
      duplicate: 'duplicate',
      share: 'share',
      'test-connection': 'test-connection',
      settings: 'settings',
      'audit-logs': 'audit-log',
    };
    const sub = subMap[subResource] ?? subResource;
    const action = method === 'DELETE' ? 'delete'
      : method === 'PUT' || method === 'PATCH' ? 'update'
      : 'create';
    return `${base}.${sub}.${action}`;
  }

  if (hasId) {
    const action = method === 'DELETE' ? 'delete'
      : method === 'PUT' || method === 'PATCH' ? 'update'
      : 'read';
    return `${base}.${action}`;
  }

  return method === 'POST' ? `${base}.create` : `${base}.list`;
}

/**
 * Extract a resource ID from the request URL when present.
 * Returns the first path segment after the resource name (the entity ID).
 */
function extractResourceId(url: string): string | undefined {
  const path = url.split('?')[0].replace(/^\//, '');
  const segments = path.split('/');
  // segments: ['api', 'resource', '<id>', ...]
  return segments[2] || undefined;
}

/**
 * Extract the resource type from the request URL.
 */
function extractResourceType(url: string): string {
  const path = url.split('?')[0].replace(/^\//, '');
  const segments = path.split('/');
  return segments[1] ?? 'unknown';
}

// ── Registration ─────────────────────────────────────────────────────

/**
 * Register audit logging middleware on a Fastify instance.
 *
 * An audit entry is written for every mutating request (POST, PUT, PATCH,
 * DELETE) that returns a success status (< 400) AND where the user is
 * authenticated.  Unauthenticated requests and failures are not audited
 * because they either don't change state or are already captured in the
 * error logs.
 *
 * The audit entries are persisted to the `auditLogStore` which is shared
 * with the admin routes, so they appear in GET /api/admin/audit-logs.
 */
export function registerAuditMiddleware(
  app: FastifyInstance,
  logger: Logger,
): void {
  app.addHook(
    'onResponse',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Only log mutating operations
      if (!MUTATING_METHODS.has(request.method)) return;

      // Only log successful state changes
      if (reply.statusCode >= 400) return;

      // Only log authenticated requests
      const user = request.user;
      if (!user) return;

      const action = resolveAction(request.method, request.url);
      const resourceType = extractResourceType(request.url);
      const resourceId = extractResourceId(request.url);

      const entry = {
        id: crypto.randomUUID(),
        organizationId: user.orgId,
        userId: user.sub,
        userEmail: user.email,
        action,
        resourceType,
        resourceId,
        metadata: {
          method: request.method,
          path: request.url.split('?')[0],
          statusCode: reply.statusCode,
          responseTimeMs: Math.round(reply.elapsedTime),
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        createdAt: new Date(),
      };

      auditLogStore.push(entry);

      logger.debug('Audit entry created', {
        action,
        resourceType,
        resourceId,
        userId: user.sub,
        statusCode: reply.statusCode,
      });
    },
  );
}

/**
 * Manually append an audit entry outside the request lifecycle.
 * Useful for bulk operations or background tasks.
 */
export function writeAuditEntry(entry: {
  organizationId: string;
  userId: string;
  userEmail: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): void {
  auditLogStore.push({
    id: crypto.randomUUID(),
    ...entry,
    createdAt: new Date(),
  });
}
