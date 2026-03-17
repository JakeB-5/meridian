import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '@meridian/shared';
import type { PluginType, PluginManifest } from '@meridian/shared';
import type { ServiceContainer } from '../services/container.js';

// ── Request Schemas ─────────────────────────────────────────────────

const nameParamSchema = z.object({
  name: z.string().min(1, 'Plugin name is required'),
});

const listQuerySchema = z.object({
  type: z.enum(['connector', 'visualization', 'transformation', 'api']).optional(),
  enabled: z.coerce.boolean().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const installBodySchema = z.object({
  name: z.string().min(1, 'Plugin name is required').max(255),
  version: z.string().min(1, 'Version is required').max(50),
  type: z.enum(['connector', 'visualization', 'transformation', 'api']),
  description: z.string().max(2000).optional().default(''),
  author: z.string().max(255).optional(),
  entryPoint: z.string().min(1, 'Entry point is required'),
  config: z.record(z.unknown()).optional(),
  autoEnable: z.boolean().optional().default(true),
});

// ── Response Types ──────────────────────────────────────────────────

interface PluginResponse {
  name: string;
  version: string;
  type: PluginType;
  description: string;
  author?: string;
  enabled: boolean;
  loadedAt: Date;
}

// ── Route Registration ──────────────────────────────────────────────

export async function pluginRoutes(app: FastifyInstance, container: ServiceContainer): Promise<void> {
  const { pluginRegistry, logger } = container;

  // ── GET /api/plugins — List installed plugins ───────────────────

  app.get('/api/plugins', {
    preHandler: [app.requireAuth, app.requirePermission('plugin:read')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listQuerySchema.parse(request.query);

    let plugins = pluginRegistry.listPlugins();

    // Filter by type
    if (query.type) {
      plugins = plugins.filter((p) => p.type === query.type);
    }

    // Filter by enabled status
    if (query.enabled !== undefined) {
      plugins = plugins.filter((p) => p.enabled === query.enabled);
    }

    // Filter by search
    if (query.search) {
      const search = query.search.toLowerCase();
      plugins = plugins.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.description.toLowerCase().includes(search),
      );
    }

    // Pagination
    const total = plugins.length;
    const paginated = plugins.slice(query.offset, query.offset + query.limit);

    return reply.status(200).send({
      data: paginated,
      meta: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + query.limit < total,
      },
    });
  });

  // ── POST /api/plugins — Install plugin ──────────────────────────

  app.post('/api/plugins', {
    preHandler: [app.requireAuth, app.requirePermission('plugin:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = installBodySchema.parse(request.body);

    // Check if plugin already exists
    if (pluginRegistry.has(body.name)) {
      throw new ValidationError(`Plugin '${body.name}' is already installed`);
    }

    // Create the manifest
    const manifest: PluginManifest = {
      name: body.name,
      version: body.version,
      type: body.type,
      description: body.description ?? '',
      author: body.author,
      entryPoint: body.entryPoint,
    };

    // In a real implementation, we would:
    // 1. Download/resolve the plugin from a registry
    // 2. Validate the plugin module
    // 3. Load and initialize it
    // For now, we register it with a stub module

    const loadedPlugin = {
      manifest,
      enabled: body.autoEnable,
      loadedAt: new Date(),
      module: {
        register: async () => {},
      },
    };

    try {
      pluginRegistry.register(loadedPlugin);
    } catch (error) {
      if (error instanceof Error) {
        throw new ValidationError(error.message);
      }
      throw error;
    }

    logger.info('Plugin installed', {
      name: body.name,
      version: body.version,
      type: body.type,
      userId: user.sub,
    });

    const info = pluginRegistry.listPlugins().find((p) => p.name === body.name);

    return reply.status(201).send({
      data: info ?? {
        name: manifest.name,
        version: manifest.version,
        type: manifest.type,
        description: manifest.description,
        author: manifest.author,
        enabled: body.autoEnable,
        loadedAt: loadedPlugin.loadedAt,
      },
    });
  });

  // ── GET /api/plugins/:name — Get plugin details ────────────────

  app.get('/api/plugins/:name', {
    preHandler: [app.requireAuth, app.requirePermission('plugin:read')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = nameParamSchema.parse(request.params);

    const plugin = pluginRegistry.getPlugin(name);
    if (!plugin) {
      throw new NotFoundError('Plugin', name);
    }

    const info = {
      name: plugin.manifest.name,
      version: plugin.manifest.version,
      type: plugin.manifest.type,
      description: plugin.manifest.description,
      author: plugin.manifest.author,
      enabled: plugin.enabled,
      loadedAt: plugin.loadedAt,
    };

    return reply.status(200).send({ data: info });
  });

  // ── PUT /api/plugins/:name/enable — Enable plugin ──────────────

  app.put('/api/plugins/:name/enable', {
    preHandler: [app.requireAuth, app.requirePermission('plugin:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { name } = nameParamSchema.parse(request.params);

    if (!pluginRegistry.has(name)) {
      throw new NotFoundError('Plugin', name);
    }

    pluginRegistry.enable(name);

    logger.info('Plugin enabled', { name, userId: user.sub });

    const info = pluginRegistry.listPlugins().find((p) => p.name === name);
    return reply.status(200).send({ data: info });
  });

  // ── PUT /api/plugins/:name/disable — Disable plugin ─────────────

  app.put('/api/plugins/:name/disable', {
    preHandler: [app.requireAuth, app.requirePermission('plugin:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { name } = nameParamSchema.parse(request.params);

    if (!pluginRegistry.has(name)) {
      throw new NotFoundError('Plugin', name);
    }

    pluginRegistry.disable(name);

    logger.info('Plugin disabled', { name, userId: user.sub });

    const info = pluginRegistry.listPlugins().find((p) => p.name === name);
    return reply.status(200).send({ data: info });
  });

  // ── DELETE /api/plugins/:name — Uninstall plugin ────────────────

  app.delete('/api/plugins/:name', {
    preHandler: [app.requireAuth, app.requirePermission('plugin:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { name } = nameParamSchema.parse(request.params);

    if (!pluginRegistry.has(name)) {
      throw new NotFoundError('Plugin', name);
    }

    pluginRegistry.unregister(name);

    logger.info('Plugin uninstalled', { name, userId: user.sub });

    return reply.status(204).send();
  });
}
