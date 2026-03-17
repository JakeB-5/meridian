import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  visualQuerySchema,
  visualizationConfigSchema,
  questionTypeSchema,
  AuthorizationError,
  MAX_SQL_LENGTH,
} from '@meridian/shared';
import type { VisualQuery, VisualizationConfig, QuestionType } from '@meridian/shared';
import type { ServiceContainer } from '../services/container.js';

// ── Request Schemas ─────────────────────────────────────────────────

const idParamSchema = z.object({
  id: z.string().min(1, 'Question ID is required'),
});

const listQuerySchema = z.object({
  dataSourceId: z.string().optional(),
  type: questionTypeSchema.optional(),
  createdBy: z.string().optional(),
  collectionId: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(25),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const createBodySchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().max(2000).optional(),
  type: questionTypeSchema,
  dataSourceId: z.string().min(1, 'Data source ID is required'),
  query: z.union([
    visualQuerySchema,
    z.string().min(1).max(MAX_SQL_LENGTH),
  ]),
  visualization: visualizationConfigSchema.optional(),
});

const updateBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  query: z.union([
    visualQuerySchema,
    z.string().min(1).max(MAX_SQL_LENGTH),
  ]).optional(),
  visualization: visualizationConfigSchema.optional(),
});

const executeBodySchema = z.object({
  parameters: z.record(z.unknown()).optional(),
  limit: z.coerce.number().int().positive().max(10_000).optional(),
  useCache: z.boolean().optional().default(true),
});

const previewBodySchema = z.object({
  dataSourceId: z.string().min(1, 'Data source ID is required'),
  type: questionTypeSchema,
  query: z.union([
    visualQuerySchema,
    z.string().min(1).max(MAX_SQL_LENGTH),
  ]),
  limit: z.coerce.number().int().positive().max(10_000).optional().default(100),
});

const duplicateBodySchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
});

// ── Response Types ──────────────────────────────────────────────────

interface QuestionResponse {
  id: string;
  name: string;
  description?: string;
  type: QuestionType;
  dataSourceId: string;
  query: VisualQuery | string;
  visualization: VisualizationConfig;
  organizationId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  collectionId?: string;
  isCacheValid: boolean;
}

function toQuestionResponse(q: {
  id: string;
  name: string;
  description?: string;
  type: QuestionType;
  dataSourceId: string;
  query: VisualQuery | string;
  visualization: VisualizationConfig;
  organizationId: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  collectionId?: string;
  isCacheValid: boolean;
}): QuestionResponse {
  return {
    id: q.id,
    name: q.name,
    description: q.description,
    type: q.type,
    dataSourceId: q.dataSourceId,
    query: q.query,
    visualization: q.visualization,
    organizationId: q.organizationId,
    createdBy: q.createdBy,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
    collectionId: q.collectionId,
    isCacheValid: q.isCacheValid,
  };
}

// ── Route Registration ──────────────────────────────────────────────

export async function questionRoutes(app: FastifyInstance, container: ServiceContainer): Promise<void> {
  const { questionService, logger } = container;

  // ── GET /api/questions — List questions for org ──────────────────

  app.get('/api/questions', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const query = listQuerySchema.parse(request.query);

    const result = await questionService.list({
      organizationId: user.orgId,
      dataSourceId: query.dataSourceId,
      type: query.type,
      createdBy: query.createdBy,
      collectionId: query.collectionId,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
    });
    if (!result.ok) throw result.error;

    const questions = result.value;

    return reply.status(200).send({
      data: questions.map(toQuestionResponse),
      meta: {
        total: questions.length,
        limit: query.limit,
        offset: query.offset,
        hasMore: questions.length === query.limit,
      },
    });
  });

  // ── POST /api/questions — Create question ───────────────────────

  app.post('/api/questions', {
    preHandler: [app.requireAuth, app.requirePermission('question:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = createBodySchema.parse(request.body);

    let result;
    if (body.type === 'visual') {
      if (typeof body.query === 'string') {
        throw new z.ZodError([{
          code: 'custom',
          message: 'Visual question requires a query object, not a string',
          path: ['query'],
        }]);
      }
      result = await questionService.createVisual({
        name: body.name,
        description: body.description,
        dataSourceId: body.dataSourceId,
        query: body.query as VisualQuery,
        visualization: body.visualization,
        organizationId: user.orgId,
        createdBy: user.sub,
      });
    } else {
      if (typeof body.query !== 'string') {
        throw new z.ZodError([{
          code: 'custom',
          message: 'SQL question requires a string query',
          path: ['query'],
        }]);
      }
      result = await questionService.createSQL({
        name: body.name,
        description: body.description,
        dataSourceId: body.dataSourceId,
        sql: body.query,
        visualization: body.visualization,
        organizationId: user.orgId,
        createdBy: user.sub,
      });
    }

    if (!result.ok) throw result.error;

    logger.info('Question created', {
      id: result.value.id,
      name: result.value.name,
      type: result.value.type,
      userId: user.sub,
    });

    return reply.status(201).send({ data: toQuestionResponse(result.value) });
  });

  // ── GET /api/questions/:id — Get question ───────────────────────

  app.get('/api/questions/:id', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);

    const result = await questionService.getById(id);
    if (!result.ok) throw result.error;

    if (result.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this question');
    }

    return reply.status(200).send({ data: toQuestionResponse(result.value) });
  });

  // ── PUT /api/questions/:id — Update question ────────────────────

  app.put('/api/questions/:id', {
    preHandler: [app.requireAuth, app.requirePermission('question:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);
    const body = updateBodySchema.parse(request.body);

    // Check org access
    const existing = await questionService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this question');
    }

    const result = await questionService.update(id, body);
    if (!result.ok) throw result.error;

    logger.info('Question updated', { id, userId: user.sub });

    return reply.status(200).send({ data: toQuestionResponse(result.value) });
  });

  // ── DELETE /api/questions/:id — Delete question ─────────────────

  app.delete('/api/questions/:id', {
    preHandler: [app.requireAuth, app.requirePermission('question:delete')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);

    // Check org access
    const existing = await questionService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this question');
    }

    const result = await questionService.delete(id);
    if (!result.ok) throw result.error;

    logger.info('Question deleted', { id, userId: user.sub });

    return reply.status(204).send();
  });

  // ── POST /api/questions/:id/execute — Execute question query ────

  app.post('/api/questions/:id/execute', {
    preHandler: [app.requireAuth, app.requirePermission('question:read')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);
    const body = executeBodySchema.parse(request.body ?? {});

    // Check org access
    const existing = await questionService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this question');
    }

    const question = existing.value;

    // Check cached result
    if (body.useCache && question.isCacheValid && question.cachedResult) {
      logger.debug('Returning cached result', { questionId: id });
      return reply.status(200).send({
        data: {
          ...question.cachedResult,
          cached: true,
        },
      });
    }

    // In a real implementation, this would:
    // 1. Get the connector for the data source
    // 2. Translate visual query to SQL (if visual)
    // 3. Execute the query via the connector
    // 4. Cache the result
    // For now, return a stub result
    const stubResult = {
      columns: [
        { name: 'id', type: 'integer', nullable: false },
        { name: 'name', type: 'text', nullable: true },
      ],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
      truncated: false,
      cached: false,
    };

    logger.info('Question executed', {
      questionId: id,
      type: question.type,
      executionTimeMs: stubResult.executionTimeMs,
      userId: user.sub,
    });

    return reply.status(200).send({ data: stubResult });
  });

  // ── POST /api/questions/preview — Execute ad-hoc query ──────────

  app.post('/api/questions/preview', {
    preHandler: [app.requireAuth, app.requirePermission('question:read')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = previewBodySchema.parse(request.body);

    // Verify the user has access to the data source
    // In a real implementation, we'd check via dataSourceService

    // Stub preview result
    const stubResult = {
      columns: [
        { name: 'id', type: 'integer', nullable: false },
        { name: 'value', type: 'text', nullable: true },
      ],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
      truncated: false,
    };

    logger.info('Query preview executed', {
      type: body.type,
      dataSourceId: body.dataSourceId,
      userId: user.sub,
    });

    return reply.status(200).send({ data: stubResult });
  });

  // ── POST /api/questions/:id/duplicate — Duplicate question ──────

  app.post('/api/questions/:id/duplicate', {
    preHandler: [app.requireAuth, app.requirePermission('question:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);
    const body = duplicateBodySchema.parse(request.body);

    // Check org access
    const existing = await questionService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this question');
    }

    const result = await questionService.duplicate(id, body.name, user.sub);
    if (!result.ok) throw result.error;

    logger.info('Question duplicated', {
      originalId: id,
      newId: result.value.id,
      userId: user.sub,
    });

    return reply.status(201).send({ data: toQuestionResponse(result.value) });
  });
}
