import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  AuthorizationError,
  NotFoundError,
  ConflictError,
  generateId,
} from '@meridian/shared';
import type { ServiceContainer } from '../services/container.js';

// ── Request Schemas ─────────────────────────────────────────────────

const idParamSchema = z.object({
  id: z.string().min(1, 'ID is required'),
});

const metricIdParamSchema = z.object({
  id: z.string().min(1, 'Model ID is required'),
  metricId: z.string().min(1, 'Metric ID is required'),
});

const listModelsQuerySchema = z.object({
  dataSourceId: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(25),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const dimensionSchema = z.object({
  name: z.string().min(1).max(255),
  column: z.string().min(1).max(255),
  type: z.enum(['string', 'number', 'date', 'boolean', 'timestamp']),
  label: z.string().max(255).optional(),
  description: z.string().max(2000).optional(),
  primaryKey: z.boolean().optional().default(false),
  hidden: z.boolean().optional().default(false),
});

const measureSchema = z.object({
  name: z.string().min(1).max(255),
  expression: z.string().min(1).max(2000),
  type: z.enum(['sum', 'count', 'avg', 'min', 'max', 'count_distinct', 'custom']),
  label: z.string().max(255).optional(),
  description: z.string().max(2000).optional(),
  format: z.string().max(100).optional(),
  hidden: z.boolean().optional().default(false),
});

const joinSchema = z.object({
  modelName: z.string().min(1).max(255),
  type: z.enum(['inner', 'left', 'right', 'full']).default('left'),
  condition: z.string().min(1).max(2000),
  label: z.string().max(255).optional(),
});

const createModelBodySchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().max(2000).optional(),
  dataSourceId: z.string().min(1, 'Data source ID is required'),
  tableName: z.string().min(1).max(255).optional(),
  sqlTable: z.string().max(2000).optional(),
  dimensions: z.array(dimensionSchema).optional().default([]),
  measures: z.array(measureSchema).optional().default([]),
  joins: z.array(joinSchema).optional().default([]),
  tags: z.array(z.string().max(100)).optional().default([]),
  hidden: z.boolean().optional().default(false),
});

const updateModelBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  tableName: z.string().max(255).optional(),
  sqlTable: z.string().max(2000).optional(),
  dimensions: z.array(dimensionSchema).optional(),
  measures: z.array(measureSchema).optional(),
  joins: z.array(joinSchema).optional(),
  tags: z.array(z.string().max(100)).optional(),
  hidden: z.boolean().optional(),
});

const createMetricBodySchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().max(2000).optional(),
  expression: z.string().min(1, 'Expression is required').max(2000),
  type: z.enum(['sum', 'count', 'avg', 'min', 'max', 'count_distinct', 'ratio', 'custom']),
  label: z.string().max(255).optional(),
  format: z.string().max(100).optional(),
  filters: z.array(z.object({
    column: z.string().min(1),
    operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'like', 'is_null', 'is_not_null']),
    value: z.unknown().optional(),
  })).optional().default([]),
  tags: z.array(z.string().max(100)).optional().default([]),
  hidden: z.boolean().optional().default(false),
});

const updateMetricBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  expression: z.string().min(1).max(2000).optional(),
  type: z.enum(['sum', 'count', 'avg', 'min', 'max', 'count_distinct', 'ratio', 'custom']).optional(),
  label: z.string().max(255).optional(),
  format: z.string().max(100).optional(),
  filters: z.array(z.object({
    column: z.string().min(1),
    operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'like', 'is_null', 'is_not_null']),
    value: z.unknown().optional(),
  })).optional(),
  tags: z.array(z.string().max(100)).optional(),
  hidden: z.boolean().optional(),
});

// ── Domain Types ────────────────────────────────────────────────────

interface Dimension {
  name: string;
  column: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'timestamp';
  label?: string;
  description?: string;
  primaryKey: boolean;
  hidden: boolean;
}

interface Measure {
  name: string;
  expression: string;
  type: 'sum' | 'count' | 'avg' | 'min' | 'max' | 'count_distinct' | 'custom';
  label?: string;
  description?: string;
  format?: string;
  hidden: boolean;
}

interface Join {
  modelName: string;
  type: 'inner' | 'left' | 'right' | 'full';
  condition: string;
  label?: string;
}

interface SemanticModel {
  id: string;
  name: string;
  description?: string;
  dataSourceId: string;
  organizationId: string;
  createdBy: string;
  tableName?: string;
  sqlTable?: string;
  dimensions: Dimension[];
  measures: Measure[];
  joins: Join[];
  tags: string[];
  hidden: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface SemanticMetric {
  id: string;
  modelId: string;
  organizationId: string;
  createdBy: string;
  name: string;
  description?: string;
  expression: string;
  type: string;
  label?: string;
  format?: string;
  filters: Array<{
    column: string;
    operator: string;
    value?: unknown;
  }>;
  tags: string[];
  hidden: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ── In-Memory Stores ─────────────────────────────────────────────────

const semanticModelStore = new Map<string, SemanticModel>();
const semanticMetricStore = new Map<string, SemanticMetric>();

// ── Response Helpers ─────────────────────────────────────────────────

function toModelResponse(model: SemanticModel) {
  return {
    id: model.id,
    name: model.name,
    description: model.description,
    dataSourceId: model.dataSourceId,
    organizationId: model.organizationId,
    createdBy: model.createdBy,
    tableName: model.tableName,
    sqlTable: model.sqlTable,
    dimensions: model.dimensions,
    measures: model.measures,
    joins: model.joins,
    tags: model.tags,
    hidden: model.hidden,
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt.toISOString(),
  };
}

function toMetricResponse(metric: SemanticMetric) {
  return {
    id: metric.id,
    modelId: metric.modelId,
    organizationId: metric.organizationId,
    createdBy: metric.createdBy,
    name: metric.name,
    description: metric.description,
    expression: metric.expression,
    type: metric.type,
    label: metric.label,
    format: metric.format,
    filters: metric.filters,
    tags: metric.tags,
    hidden: metric.hidden,
    createdAt: metric.createdAt.toISOString(),
    updatedAt: metric.updatedAt.toISOString(),
  };
}

// ── Route Registration ──────────────────────────────────────────────

/**
 * Semantic layer routes — CRUD for semantic models and their metrics.
 * Semantic models define a business-friendly layer over raw database tables.
 */
export async function semanticRoutes(
  app: FastifyInstance,
  container: ServiceContainer,
): Promise<void> {
  const { logger } = container;

  // ── GET /api/semantic-models — List semantic models ──────────────

  app.get('/api/semantic-models', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const query = listModelsQuerySchema.parse(request.query);

    let models = Array.from(semanticModelStore.values()).filter(
      (m) => m.organizationId === user.orgId,
    );

    if (query.dataSourceId) {
      models = models.filter((m) => m.dataSourceId === query.dataSourceId);
    }
    if (query.search) {
      const s = query.search.toLowerCase();
      models = models.filter(
        (m) => m.name.toLowerCase().includes(s)
          || m.description?.toLowerCase().includes(s),
      );
    }

    models.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = models.length;
    const page = models.slice(query.offset, query.offset + query.limit);

    return reply.status(200).send({
      data: page.map(toModelResponse),
      meta: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + query.limit < total,
      },
    });
  });

  // ── POST /api/semantic-models — Create semantic model ────────────

  app.post('/api/semantic-models', {
    preHandler: [app.requireAuth, app.requirePermission('datasource:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = createModelBodySchema.parse(request.body);

    // Ensure unique name within the org
    const duplicate = Array.from(semanticModelStore.values()).find(
      (m) => m.organizationId === user.orgId && m.name === body.name,
    );
    if (duplicate) {
      throw new ConflictError(`Semantic model '${body.name}' already exists`);
    }

    const now = new Date();
    const model: SemanticModel = {
      id: generateId(),
      name: body.name,
      description: body.description,
      dataSourceId: body.dataSourceId,
      organizationId: user.orgId,
      createdBy: user.sub,
      tableName: body.tableName,
      sqlTable: body.sqlTable,
      dimensions: body.dimensions as Dimension[],
      measures: body.measures as Measure[],
      joins: body.joins as Join[],
      tags: body.tags,
      hidden: body.hidden,
      createdAt: now,
      updatedAt: now,
    };

    semanticModelStore.set(model.id, model);

    logger.info('Semantic model created', {
      id: model.id,
      name: model.name,
      dataSourceId: model.dataSourceId,
      userId: user.sub,
    });

    return reply.status(201).send({ data: toModelResponse(model) });
  });

  // ── GET /api/semantic-models/:id — Get semantic model ────────────

  app.get('/api/semantic-models/:id', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);

    const model = semanticModelStore.get(id);
    if (!model) throw new NotFoundError('SemanticModel', id);
    if (model.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this semantic model');
    }

    return reply.status(200).send({ data: toModelResponse(model) });
  });

  // ── PUT /api/semantic-models/:id — Update semantic model ─────────

  app.put('/api/semantic-models/:id', {
    preHandler: [app.requireAuth, app.requirePermission('datasource:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);
    const body = updateModelBodySchema.parse(request.body);

    const model = semanticModelStore.get(id);
    if (!model) throw new NotFoundError('SemanticModel', id);
    if (model.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this semantic model');
    }

    // Check name uniqueness if changing the name
    if (body.name && body.name !== model.name) {
      const duplicate = Array.from(semanticModelStore.values()).find(
        (m) => m.id !== id && m.organizationId === user.orgId && m.name === body.name,
      );
      if (duplicate) {
        throw new ConflictError(`Semantic model '${body.name}' already exists`);
      }
    }

    const updated: SemanticModel = {
      ...model,
      name: body.name ?? model.name,
      description: body.description !== undefined ? body.description : model.description,
      tableName: body.tableName !== undefined ? body.tableName : model.tableName,
      sqlTable: body.sqlTable !== undefined ? body.sqlTable : model.sqlTable,
      dimensions: (body.dimensions as Dimension[] | undefined) ?? model.dimensions,
      measures: (body.measures as Measure[] | undefined) ?? model.measures,
      joins: (body.joins as Join[] | undefined) ?? model.joins,
      tags: body.tags ?? model.tags,
      hidden: body.hidden !== undefined ? body.hidden : model.hidden,
      updatedAt: new Date(),
    };

    semanticModelStore.set(id, updated);

    logger.info('Semantic model updated', { id, userId: user.sub });

    return reply.status(200).send({ data: toModelResponse(updated) });
  });

  // ── DELETE /api/semantic-models/:id — Delete semantic model ──────

  app.delete('/api/semantic-models/:id', {
    preHandler: [app.requireAuth, app.requirePermission('datasource:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);

    const model = semanticModelStore.get(id);
    if (!model) throw new NotFoundError('SemanticModel', id);
    if (model.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this semantic model');
    }

    // Also delete all metrics belonging to this model
    for (const [metricId, metric] of semanticMetricStore) {
      if (metric.modelId === id) {
        semanticMetricStore.delete(metricId);
      }
    }

    semanticModelStore.delete(id);

    logger.info('Semantic model deleted', { id, userId: user.sub });

    return reply.status(204).send();
  });

  // ── GET /api/semantic-models/:id/metrics — List metrics ──────────

  app.get('/api/semantic-models/:id/metrics', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);

    const model = semanticModelStore.get(id);
    if (!model) throw new NotFoundError('SemanticModel', id);
    if (model.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this semantic model');
    }

    const metrics = Array.from(semanticMetricStore.values()).filter(
      (m) => m.modelId === id,
    );

    metrics.sort((a, b) => a.name.localeCompare(b.name));

    return reply.status(200).send({
      data: metrics.map(toMetricResponse),
      meta: { total: metrics.length },
    });
  });

  // ── POST /api/semantic-models/:id/metrics — Create metric ────────

  app.post('/api/semantic-models/:id/metrics', {
    preHandler: [app.requireAuth, app.requirePermission('datasource:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);
    const body = createMetricBodySchema.parse(request.body);

    const model = semanticModelStore.get(id);
    if (!model) throw new NotFoundError('SemanticModel', id);
    if (model.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this semantic model');
    }

    // Ensure unique metric name within the model
    const duplicate = Array.from(semanticMetricStore.values()).find(
      (m) => m.modelId === id && m.name === body.name,
    );
    if (duplicate) {
      throw new ConflictError(`Metric '${body.name}' already exists in this model`);
    }

    const now = new Date();
    const metric: SemanticMetric = {
      id: generateId(),
      modelId: id,
      organizationId: user.orgId,
      createdBy: user.sub,
      name: body.name,
      description: body.description,
      expression: body.expression,
      type: body.type,
      label: body.label,
      format: body.format,
      filters: body.filters as SemanticMetric['filters'],
      tags: body.tags,
      hidden: body.hidden,
      createdAt: now,
      updatedAt: now,
    };

    semanticMetricStore.set(metric.id, metric);

    logger.info('Semantic metric created', {
      id: metric.id,
      name: metric.name,
      modelId: id,
      userId: user.sub,
    });

    return reply.status(201).send({ data: toMetricResponse(metric) });
  });

  // ── GET /api/semantic-models/:id/metrics/:metricId — Get metric ──

  app.get('/api/semantic-models/:id/metrics/:metricId', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id, metricId } = metricIdParamSchema.parse(request.params);

    const model = semanticModelStore.get(id);
    if (!model) throw new NotFoundError('SemanticModel', id);
    if (model.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this semantic model');
    }

    const metric = semanticMetricStore.get(metricId);
    if (!metric || metric.modelId !== id) {
      throw new NotFoundError('SemanticMetric', metricId);
    }

    return reply.status(200).send({ data: toMetricResponse(metric) });
  });

  // ── PUT /api/semantic-models/:id/metrics/:metricId — Update metric

  app.put('/api/semantic-models/:id/metrics/:metricId', {
    preHandler: [app.requireAuth, app.requirePermission('datasource:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id, metricId } = metricIdParamSchema.parse(request.params);
    const body = updateMetricBodySchema.parse(request.body);

    const model = semanticModelStore.get(id);
    if (!model) throw new NotFoundError('SemanticModel', id);
    if (model.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this semantic model');
    }

    const metric = semanticMetricStore.get(metricId);
    if (!metric || metric.modelId !== id) {
      throw new NotFoundError('SemanticMetric', metricId);
    }

    // Enforce name uniqueness if changing name
    if (body.name && body.name !== metric.name) {
      const dup = Array.from(semanticMetricStore.values()).find(
        (m) => m.id !== metricId && m.modelId === id && m.name === body.name,
      );
      if (dup) {
        throw new ConflictError(`Metric '${body.name}' already exists in this model`);
      }
    }

    const updated: SemanticMetric = {
      ...metric,
      name: body.name ?? metric.name,
      description: body.description !== undefined ? body.description : metric.description,
      expression: body.expression ?? metric.expression,
      type: body.type ?? metric.type,
      label: body.label !== undefined ? body.label : metric.label,
      format: body.format !== undefined ? body.format : metric.format,
      filters: (body.filters as SemanticMetric['filters'] | undefined) ?? metric.filters,
      tags: body.tags ?? metric.tags,
      hidden: body.hidden !== undefined ? body.hidden : metric.hidden,
      updatedAt: new Date(),
    };

    semanticMetricStore.set(metricId, updated);

    logger.info('Semantic metric updated', { metricId, modelId: id, userId: user.sub });

    return reply.status(200).send({ data: toMetricResponse(updated) });
  });

  // ── DELETE /api/semantic-models/:id/metrics/:metricId — Delete ───

  app.delete('/api/semantic-models/:id/metrics/:metricId', {
    preHandler: [app.requireAuth, app.requirePermission('datasource:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id, metricId } = metricIdParamSchema.parse(request.params);

    const model = semanticModelStore.get(id);
    if (!model) throw new NotFoundError('SemanticModel', id);
    if (model.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this semantic model');
    }

    const metric = semanticMetricStore.get(metricId);
    if (!metric || metric.modelId !== id) {
      throw new NotFoundError('SemanticMetric', metricId);
    }

    semanticMetricStore.delete(metricId);

    logger.info('Semantic metric deleted', { metricId, modelId: id, userId: user.sub });

    return reply.status(204).send();
  });
}
