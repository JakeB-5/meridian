import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  databaseTypeSchema,
  AuthorizationError,
} from '@meridian/shared';
import type { ServiceContainer } from '../services/container.js';

// ── Request Schemas ─────────────────────────────────────────────────

const idParamSchema = z.object({
  id: z.string().min(1, 'Data source ID is required'),
});

const tableParamSchema = z.object({
  id: z.string().min(1, 'Data source ID is required'),
  table: z.string().min(1, 'Table name is required'),
});

const listQuerySchema = z.object({
  type: databaseTypeSchema.optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(25),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const createBodySchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  type: databaseTypeSchema,
  host: z.string().optional(),
  port: z.coerce.number().int().positive().max(65535).optional(),
  database: z.string().min(1, 'Database name is required'),
  username: z.string().optional(),
  password: z.string().optional(),
  ssl: z.boolean().optional().default(false),
  options: z.record(z.unknown()).optional(),
});

const updateBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  host: z.string().optional(),
  port: z.coerce.number().int().positive().max(65535).optional(),
  database: z.string().min(1).optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  ssl: z.boolean().optional(),
  options: z.record(z.unknown()).optional(),
});

// ── Response Helpers ────────────────────────────────────────────────

interface DataSourceResponse {
  id: string;
  name: string;
  type: string;
  host?: string;
  port?: number;
  database: string;
  ssl: boolean;
  options: Record<string, unknown>;
  organizationId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastTestedAt?: string;
  lastError?: string;
}

function toDataSourceResponse(ds: {
  id: string;
  name: string;
  type: string;
  host?: string;
  port?: number;
  database: string;
  credentials: { ssl: boolean };
  options: Record<string, unknown>;
  organizationId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  lastTestedAt?: Date;
  lastError?: string;
}): DataSourceResponse {
  return {
    id: ds.id,
    name: ds.name,
    type: ds.type,
    host: ds.host,
    port: ds.port,
    database: ds.database,
    ssl: ds.credentials.ssl,
    options: ds.options,
    organizationId: ds.organizationId,
    status: ds.status,
    createdAt: ds.createdAt.toISOString(),
    updatedAt: ds.updatedAt.toISOString(),
    lastTestedAt: ds.lastTestedAt?.toISOString(),
    lastError: ds.lastError,
  };
}

// ── Route Registration ──────────────────────────────────────────────

export async function datasourceRoutes(app: FastifyInstance, container: ServiceContainer): Promise<void> {
  const { dataSourceService, logger } = container;

  // ── GET /api/datasources — List datasources for org ─────────────

  app.get('/api/datasources', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const query = listQuerySchema.parse(request.query);

    const result = await dataSourceService.listByOrganization(user.orgId);
    if (!result.ok) throw result.error;

    let datasources = result.value;

    // Apply client-side filtering for type and search
    if (query.type) {
      datasources = datasources.filter((ds) => ds.type === query.type);
    }
    if (query.search) {
      const search = query.search.toLowerCase();
      datasources = datasources.filter(
        (ds) => ds.name.toLowerCase().includes(search) || ds.database.toLowerCase().includes(search),
      );
    }

    // Apply pagination
    const total = datasources.length;
    const paginated = datasources.slice(query.offset, query.offset + query.limit);

    return reply.status(200).send({
      data: paginated.map(toDataSourceResponse),
      meta: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + query.limit < total,
      },
    });
  });

  // ── POST /api/datasources — Create datasource ──────────────────

  app.post('/api/datasources', {
    preHandler: [app.requireAuth, app.requirePermission('datasource:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = createBodySchema.parse(request.body);

    const result = await dataSourceService.create({
      ...body,
      organizationId: user.orgId,
    });
    if (!result.ok) throw result.error;

    logger.info('Data source created', {
      id: result.value.id,
      name: result.value.name,
      type: result.value.type,
      userId: user.sub,
    });

    return reply.status(201).send({ data: toDataSourceResponse(result.value) });
  });

  // ── GET /api/datasources/:id — Get datasource ──────────────────

  app.get('/api/datasources/:id', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);

    const result = await dataSourceService.getById(id);
    if (!result.ok) throw result.error;

    // Verify org access
    if (result.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this data source');
    }

    return reply.status(200).send({ data: toDataSourceResponse(result.value) });
  });

  // ── PUT /api/datasources/:id — Update datasource ───────────────

  app.put('/api/datasources/:id', {
    preHandler: [app.requireAuth, app.requirePermission('datasource:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);
    const body = updateBodySchema.parse(request.body);

    // Check org access first
    const existing = await dataSourceService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this data source');
    }

    const result = await dataSourceService.update(id, body);
    if (!result.ok) throw result.error;

    logger.info('Data source updated', { id, userId: user.sub });

    return reply.status(200).send({ data: toDataSourceResponse(result.value) });
  });

  // ── DELETE /api/datasources/:id — Delete datasource ─────────────

  app.delete('/api/datasources/:id', {
    preHandler: [app.requireAuth, app.requirePermission('datasource:delete')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);

    // Check org access first
    const existing = await dataSourceService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this data source');
    }

    const result = await dataSourceService.delete(id);
    if (!result.ok) throw result.error;

    logger.info('Data source deleted', { id, userId: user.sub });

    return reply.status(204).send();
  });

  // ── POST /api/datasources/:id/test — Test connection ────────────

  app.post('/api/datasources/:id/test', {
    preHandler: [app.requireAuth, app.requirePermission('datasource:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);

    // Check org access first
    const existing = await dataSourceService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this data source');
    }

    const result = await dataSourceService.testConnection(id);
    if (!result.ok) throw result.error;

    logger.info('Data source connection tested', {
      id,
      success: result.value.success,
      latencyMs: result.value.latencyMs,
      userId: user.sub,
    });

    return reply.status(200).send({ data: result.value });
  });

  // ── GET /api/datasources/:id/schema — Get database schema ──────

  app.get('/api/datasources/:id/schema', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);

    // Check org access first
    const existing = await dataSourceService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this data source');
    }

    const result = await dataSourceService.getSchema(id);
    if (!result.ok) throw result.error;

    return reply.status(200).send({ data: result.value });
  });

  // ── GET /api/datasources/:id/tables — List tables ───────────────

  app.get('/api/datasources/:id/tables', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);

    // Check org access first
    const existing = await dataSourceService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this data source');
    }

    const result = await dataSourceService.getTables(id);
    if (!result.ok) throw result.error;

    return reply.status(200).send({ data: result.value });
  });

  // ── GET /api/datasources/:id/tables/:table/columns — List columns

  app.get('/api/datasources/:id/tables/:table/columns', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id, table } = tableParamSchema.parse(request.params);

    // Check org access first
    const existing = await dataSourceService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this data source');
    }

    // Get tables and find the requested one
    const tablesResult = await dataSourceService.getTables(id);
    if (!tablesResult.ok) throw tablesResult.error;

    const tableInfo = tablesResult.value.find((t) => t.name === table);
    const columns = tableInfo?.columns ?? [];

    return reply.status(200).send({ data: columns });
  });
}
