import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  cardPositionSchema,
  cardSizeSchema,
  AuthorizationError,
  NotFoundError,
  generateId,
} from '@meridian/shared';
import type { CardPosition, CardSize, DashboardLayout, DashboardFilter } from '@meridian/shared';
import type { ServiceContainer } from '../services/container.js';

// ── Request Schemas ─────────────────────────────────────────────────

const idParamSchema = z.object({
  id: z.string().min(1, 'Dashboard ID is required'),
});

const cardParamSchema = z.object({
  id: z.string().min(1, 'Dashboard ID is required'),
  cardId: z.string().min(1, 'Card ID is required'),
});

const listQuerySchema = z.object({
  createdBy: z.string().optional(),
  isPublic: z.coerce.boolean().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(25),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const createBodySchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().max(2000).optional(),
  isPublic: z.boolean().optional().default(false),
  layout: z.object({
    columns: z.number().int().min(1).max(48).optional(),
    rowHeight: z.number().int().min(20).max(500).optional(),
  }).optional(),
});

const updateBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  isPublic: z.boolean().optional(),
});

const addCardBodySchema = z.object({
  questionId: z.string().min(1, 'Question ID is required'),
  position: cardPositionSchema,
  size: cardSizeSchema,
  title: z.string().max(255).optional(),
});

const updateCardBodySchema = z.object({
  position: cardPositionSchema.optional(),
  size: cardSizeSchema.optional(),
  title: z.string().max(255).optional(),
});

const shareBodySchema = z.object({
  expiresInHours: z.coerce.number().int().positive().max(8760).optional().default(168), // 7 days
  password: z.string().min(4).max(128).optional(),
  allowedEmails: z.array(z.string().email()).optional(),
});

const reorderCardsBodySchema = z.object({
  cardIds: z.array(z.string().min(1)).min(1),
});

const updateLayoutBodySchema = z.object({
  columns: z.number().int().min(1).max(48).optional(),
  rowHeight: z.number().int().min(20).max(500).optional(),
});

const addFilterBodySchema = z.object({
  type: z.string().min(1, 'Filter type is required'),
  column: z.string().min(1, 'Filter column is required'),
  defaultValue: z.unknown().optional(),
});

const removeFilterParamSchema = z.object({
  id: z.string().min(1),
  filterId: z.string().min(1),
});

const duplicateBodySchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
});

// ── Response Types ──────────────────────────────────────────────────

interface DashboardCardResponse {
  id: string;
  dashboardId: string;
  questionId: string;
  position: CardPosition;
  size: CardSize;
  title?: string;
}

interface DashboardResponse {
  id: string;
  name: string;
  description?: string;
  organizationId: string;
  createdBy: string;
  isPublic: boolean;
  layout: DashboardLayout;
  filters: DashboardFilter[];
  cards: DashboardCardResponse[];
  cardCount: number;
  createdAt: string;
  updatedAt: string;
}

function toDashboardResponse(d: {
  id: string;
  name: string;
  description?: string;
  organizationId: string;
  createdBy: string;
  isPublic: boolean;
  layout: DashboardLayout;
  filters: DashboardFilter[];
  cards: ReadonlyArray<{
    id: string;
    dashboardId: string;
    questionId: string;
    position: CardPosition;
    size: CardSize;
    title?: string;
  }>;
  cardCount: number;
  createdAt: Date;
  updatedAt: Date;
}): DashboardResponse {
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    organizationId: d.organizationId,
    createdBy: d.createdBy,
    isPublic: d.isPublic,
    layout: d.layout,
    filters: d.filters,
    cards: d.cards.map((c) => ({
      id: c.id,
      dashboardId: c.dashboardId,
      questionId: c.questionId,
      position: { ...c.position },
      size: { ...c.size },
      title: c.title,
    })),
    cardCount: d.cardCount,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

// ── Route Registration ──────────────────────────────────────────────

export async function dashboardRoutes(app: FastifyInstance, container: ServiceContainer): Promise<void> {
  const { dashboardService, logger } = container;

  // ── GET /api/dashboards — List dashboards ───────────────────────

  app.get('/api/dashboards', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const query = listQuerySchema.parse(request.query);

    const result = await dashboardService.list({
      organizationId: user.orgId,
      createdBy: query.createdBy,
      isPublic: query.isPublic,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
    });
    if (!result.ok) throw result.error;

    const dashboards = result.value;

    return reply.status(200).send({
      data: dashboards.map(toDashboardResponse),
      meta: {
        total: dashboards.length,
        limit: query.limit,
        offset: query.offset,
        hasMore: dashboards.length === query.limit,
      },
    });
  });

  // ── POST /api/dashboards — Create dashboard ────────────────────

  app.post('/api/dashboards', {
    preHandler: [app.requireAuth, app.requirePermission('dashboard:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = createBodySchema.parse(request.body);

    const result = await dashboardService.create({
      name: body.name,
      description: body.description,
      organizationId: user.orgId,
      createdBy: user.sub,
      isPublic: body.isPublic,
      layout: body.layout,
    });
    if (!result.ok) throw result.error;

    logger.info('Dashboard created', {
      id: result.value.id,
      name: result.value.name,
      userId: user.sub,
    });

    return reply.status(201).send({ data: toDashboardResponse(result.value) });
  });

  // ── GET /api/dashboards/:id — Get dashboard with cards ──────────

  app.get('/api/dashboards/:id', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);

    const result = await dashboardService.getById(id);
    if (!result.ok) throw result.error;

    if (result.value.organizationId !== user.orgId && !result.value.isPublic) {
      throw new AuthorizationError('Access denied to this dashboard');
    }

    return reply.status(200).send({ data: toDashboardResponse(result.value) });
  });

  // ── PUT /api/dashboards/:id — Update dashboard ─────────────────

  app.put('/api/dashboards/:id', {
    preHandler: [app.requireAuth, app.requirePermission('dashboard:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);
    const body = updateBodySchema.parse(request.body);

    // Check org access
    const existing = await dashboardService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this dashboard');
    }

    const result = await dashboardService.update(id, body);
    if (!result.ok) throw result.error;

    logger.info('Dashboard updated', { id, userId: user.sub });

    return reply.status(200).send({ data: toDashboardResponse(result.value) });
  });

  // ── DELETE /api/dashboards/:id — Delete dashboard ───────────────

  app.delete('/api/dashboards/:id', {
    preHandler: [app.requireAuth, app.requirePermission('dashboard:delete')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);

    // Check org access
    const existing = await dashboardService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this dashboard');
    }

    const result = await dashboardService.delete(id);
    if (!result.ok) throw result.error;

    logger.info('Dashboard deleted', { id, userId: user.sub });

    return reply.status(204).send();
  });

  // ── POST /api/dashboards/:id/cards — Add card ──────────────────

  app.post('/api/dashboards/:id/cards', {
    preHandler: [app.requireAuth, app.requirePermission('dashboard:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);
    const body = addCardBodySchema.parse(request.body);

    // Check org access
    const existing = await dashboardService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this dashboard');
    }

    const result = await dashboardService.addCard(id, {
      questionId: body.questionId,
      position: body.position,
      size: body.size,
      title: body.title,
    });
    if (!result.ok) throw result.error;

    logger.info('Card added to dashboard', {
      dashboardId: id,
      questionId: body.questionId,
      userId: user.sub,
    });

    return reply.status(201).send({ data: toDashboardResponse(result.value) });
  });

  // ── PUT /api/dashboards/:id/cards/:cardId — Update card ────────

  app.put('/api/dashboards/:id/cards/:cardId', {
    preHandler: [app.requireAuth, app.requirePermission('dashboard:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id, cardId } = cardParamSchema.parse(request.params);
    const body = updateCardBodySchema.parse(request.body);

    // Check org access
    const existing = await dashboardService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this dashboard');
    }

    // If position or size is being updated, use moveCard
    if (body.position || body.size) {
      const card = existing.value.findCard(cardId);
      if (!card) {
        throw new NotFoundError('Card', cardId);
      }
      const position = body.position ?? card.position;
      const size = body.size ?? card.size;

      const result = await dashboardService.moveCard(id, cardId, position, size);
      if (!result.ok) throw result.error;

      logger.info('Card updated on dashboard', { dashboardId: id, cardId, userId: user.sub });

      return reply.status(200).send({ data: toDashboardResponse(result.value) });
    }

    // No position/size change, return existing
    return reply.status(200).send({ data: toDashboardResponse(existing.value) });
  });

  // ── DELETE /api/dashboards/:id/cards/:cardId — Remove card ─────

  app.delete('/api/dashboards/:id/cards/:cardId', {
    preHandler: [app.requireAuth, app.requirePermission('dashboard:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id, cardId } = cardParamSchema.parse(request.params);

    // Check org access
    const existing = await dashboardService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this dashboard');
    }

    const result = await dashboardService.removeCard(id, cardId);
    if (!result.ok) throw result.error;

    logger.info('Card removed from dashboard', { dashboardId: id, cardId, userId: user.sub });

    return reply.status(200).send({ data: toDashboardResponse(result.value) });
  });

  // ── POST /api/dashboards/:id/share — Generate public share link ─

  app.post('/api/dashboards/:id/share', {
    preHandler: [app.requireAuth, app.requirePermission('dashboard:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);
    const body = shareBodySchema.parse(request.body ?? {});

    // Check org access
    const existing = await dashboardService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this dashboard');
    }

    // Generate share token
    const shareToken = generateId();
    const expiresAt = new Date(Date.now() + body.expiresInHours * 3600_000);

    // In a real implementation, we'd store this share token in the database
    // and associate it with the dashboard ID

    // Make the dashboard public if it isn't already
    if (!existing.value.isPublic) {
      const updateResult = await dashboardService.update(id, { isPublic: true });
      if (!updateResult.ok) throw updateResult.error;
    }

    logger.info('Dashboard shared', {
      dashboardId: id,
      expiresAt: expiresAt.toISOString(),
      userId: user.sub,
    });

    return reply.status(200).send({
      data: {
        shareToken,
        shareUrl: `/shared/dashboard/${shareToken}`,
        expiresAt: expiresAt.toISOString(),
        dashboardId: id,
      },
    });
  });

  // ── PUT /api/dashboards/:id/layout — Update layout ─────────────

  app.put('/api/dashboards/:id/layout', {
    preHandler: [app.requireAuth, app.requirePermission('dashboard:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);
    const body = updateLayoutBodySchema.parse(request.body);

    // Check org access
    const existing = await dashboardService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this dashboard');
    }

    const result = await dashboardService.updateLayout(id, body);
    if (!result.ok) throw result.error;

    logger.info('Dashboard layout updated', { dashboardId: id, userId: user.sub });

    return reply.status(200).send({ data: toDashboardResponse(result.value) });
  });

  // ── PUT /api/dashboards/:id/reorder — Reorder cards ─────────────

  app.put('/api/dashboards/:id/reorder', {
    preHandler: [app.requireAuth, app.requirePermission('dashboard:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);
    const body = reorderCardsBodySchema.parse(request.body);

    // Check org access
    const existing = await dashboardService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this dashboard');
    }

    const result = await dashboardService.reorderCards(id, body.cardIds);
    if (!result.ok) throw result.error;

    logger.info('Dashboard cards reordered', { dashboardId: id, userId: user.sub });

    return reply.status(200).send({ data: toDashboardResponse(result.value) });
  });

  // ── POST /api/dashboards/:id/filters — Add filter ──────────────

  app.post('/api/dashboards/:id/filters', {
    preHandler: [app.requireAuth, app.requirePermission('dashboard:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);
    const body = addFilterBodySchema.parse(request.body);

    // Check org access
    const existing = await dashboardService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this dashboard');
    }

    const result = await dashboardService.addFilter(id, body);
    if (!result.ok) throw result.error;

    logger.info('Filter added to dashboard', { dashboardId: id, userId: user.sub });

    return reply.status(201).send({ data: toDashboardResponse(result.value) });
  });

  // ── DELETE /api/dashboards/:id/filters/:filterId — Remove filter ─

  app.delete('/api/dashboards/:id/filters/:filterId', {
    preHandler: [app.requireAuth, app.requirePermission('dashboard:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id, filterId } = removeFilterParamSchema.parse(request.params);

    // Check org access
    const existing = await dashboardService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this dashboard');
    }

    const result = await dashboardService.removeFilter(id, filterId);
    if (!result.ok) throw result.error;

    logger.info('Filter removed from dashboard', { dashboardId: id, filterId, userId: user.sub });

    return reply.status(200).send({ data: toDashboardResponse(result.value) });
  });

  // ── POST /api/dashboards/:id/duplicate — Duplicate dashboard ────

  app.post('/api/dashboards/:id/duplicate', {
    preHandler: [app.requireAuth, app.requirePermission('dashboard:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = idParamSchema.parse(request.params);
    const body = duplicateBodySchema.parse(request.body);

    // Check org access
    const existing = await dashboardService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== user.orgId) {
      throw new AuthorizationError('Access denied to this dashboard');
    }

    const result = await dashboardService.duplicate(id, body.name, user.sub);
    if (!result.ok) throw result.error;

    logger.info('Dashboard duplicated', {
      originalId: id,
      newId: result.value.id,
      userId: user.sub,
    });

    return reply.status(201).send({ data: toDashboardResponse(result.value) });
  });
}
