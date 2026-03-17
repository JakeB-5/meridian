import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  AuthorizationError,
} from '@meridian/shared';
import type { Permission, UserStatus } from '@meridian/shared';
import type { ServiceContainer } from '../services/container.js';

// ── Request Schemas ─────────────────────────────────────────────────

const idParamSchema = z.object({
  id: z.string().min(1, 'User ID is required'),
});

const listQuerySchema = z.object({
  status: z.enum(['active', 'inactive', 'pending']).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(25),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const createBodySchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().min(1, 'Name is required').max(255),
  roleId: z.string().min(1, 'Role ID is required'),
  avatarUrl: z.string().url().optional(),
  sendInvite: z.boolean().optional().default(true),
});

const updateBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  avatarUrl: z.string().url().optional().nullable(),
});

const assignRoleBodySchema = z.object({
  roleId: z.string().min(1, 'Role ID is required'),
});

// ── Response Types ──────────────────────────────────────────────────

interface UserResponse {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  organizationId: string;
  role: {
    id: string;
    name: string;
    permissions: string[];
  };
  status: UserStatus;
  isActive: boolean;
  isAdmin: boolean;
  lastLoginAt?: string;
  deactivatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

function toUserResponse(u: {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  organizationId: string;
  role: {
    id: string;
    name: string;
    permissions: ReadonlyArray<Permission>;
  };
  status: UserStatus;
  isActive: boolean;
  isAdmin: boolean;
  lastLoginAt?: Date;
  deactivatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}): UserResponse {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    organizationId: u.organizationId,
    role: {
      id: u.role.id,
      name: u.role.name,
      permissions: [...u.role.permissions],
    },
    status: u.status,
    isActive: u.isActive,
    isAdmin: u.isAdmin,
    lastLoginAt: u.lastLoginAt?.toISOString(),
    deactivatedAt: u.deactivatedAt?.toISOString(),
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

// ── Route Registration ──────────────────────────────────────────────

export async function userRoutes(app: FastifyInstance, container: ServiceContainer): Promise<void> {
  const { userService, logger } = container;

  // ── GET /api/users — List users in org ──────────────────────────

  app.get('/api/users', {
    preHandler: [app.requireAuth, app.requirePermission('user:read')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const query = listQuerySchema.parse(request.query);

    const result = await userService.list({
      organizationId: user.orgId,
      status: query.status,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
    });
    if (!result.ok) throw result.error;

    const users = result.value;

    return reply.status(200).send({
      data: users.map(toUserResponse),
      meta: {
        total: users.length,
        limit: query.limit,
        offset: query.offset,
        hasMore: users.length === query.limit,
      },
    });
  });

  // ── POST /api/users — Create/invite user ────────────────────────

  app.post('/api/users', {
    preHandler: [app.requireAuth, app.requirePermission('user:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const currentUser = request.user!;
    const body = createBodySchema.parse(request.body);

    const result = await userService.create({
      email: body.email,
      name: body.name,
      organizationId: currentUser.orgId,
      roleId: body.roleId,
      avatarUrl: body.avatarUrl,
    });
    if (!result.ok) throw result.error;

    // In a real implementation, if sendInvite is true, we would
    // send an invitation email with a setup link

    logger.info('User created/invited', {
      userId: result.value.id,
      email: body.email,
      invitedBy: currentUser.sub,
    });

    return reply.status(201).send({ data: toUserResponse(result.value) });
  });

  // ── GET /api/users/:id — Get user ──────────────────────────────

  app.get('/api/users/:id', {
    preHandler: [app.requireAuth, app.requirePermission('user:read')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const currentUser = request.user!;
    const { id } = idParamSchema.parse(request.params);

    const result = await userService.getById(id);
    if (!result.ok) throw result.error;

    // Verify same org
    if (result.value.organizationId !== currentUser.orgId) {
      throw new AuthorizationError('Access denied to this user');
    }

    return reply.status(200).send({ data: toUserResponse(result.value) });
  });

  // ── PUT /api/users/:id — Update user ───────────────────────────

  app.put('/api/users/:id', {
    preHandler: [app.requireAuth, app.requirePermission('user:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const currentUser = request.user!;
    const { id } = idParamSchema.parse(request.params);
    const body = updateBodySchema.parse(request.body);

    // Check org access
    const existing = await userService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== currentUser.orgId) {
      throw new AuthorizationError('Access denied to this user');
    }

    const updateData: { name?: string; avatarUrl?: string } = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.avatarUrl !== undefined) updateData.avatarUrl = body.avatarUrl ?? undefined;

    const result = await userService.update(id, updateData);
    if (!result.ok) throw result.error;

    logger.info('User updated', { userId: id, updatedBy: currentUser.sub });

    return reply.status(200).send({ data: toUserResponse(result.value) });
  });

  // ── DELETE /api/users/:id — Deactivate user ────────────────────

  app.delete('/api/users/:id', {
    preHandler: [app.requireAuth, app.requirePermission('user:delete')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const currentUser = request.user!;
    const { id } = idParamSchema.parse(request.params);

    // Cannot deactivate yourself
    if (id === currentUser.sub) {
      throw new AuthorizationError('Cannot deactivate your own account');
    }

    // Check org access
    const existing = await userService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== currentUser.orgId) {
      throw new AuthorizationError('Access denied to this user');
    }

    const result = await userService.deactivate(id);
    if (!result.ok) throw result.error;

    logger.info('User deactivated', { userId: id, deactivatedBy: currentUser.sub });

    return reply.status(200).send({ data: toUserResponse(result.value) });
  });

  // ── PUT /api/users/:id/role — Assign role ──────────────────────

  app.put('/api/users/:id/role', {
    preHandler: [app.requireAuth, app.requirePermission('role:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const currentUser = request.user!;
    const { id } = idParamSchema.parse(request.params);
    const body = assignRoleBodySchema.parse(request.body);

    // Check org access
    const existing = await userService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== currentUser.orgId) {
      throw new AuthorizationError('Access denied to this user');
    }

    const result = await userService.assignRole(id, body.roleId);
    if (!result.ok) throw result.error;

    logger.info('Role assigned to user', {
      userId: id,
      roleId: body.roleId,
      assignedBy: currentUser.sub,
    });

    return reply.status(200).send({ data: toUserResponse(result.value) });
  });

  // ── PUT /api/users/:id/activate — Activate user ────────────────

  app.put('/api/users/:id/activate', {
    preHandler: [app.requireAuth, app.requirePermission('user:write')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const currentUser = request.user!;
    const { id } = idParamSchema.parse(request.params);

    // Check org access
    const existing = await userService.getById(id);
    if (!existing.ok) throw existing.error;
    if (existing.value.organizationId !== currentUser.orgId) {
      throw new AuthorizationError('Access denied to this user');
    }

    const result = await userService.activate(id);
    if (!result.ok) throw result.error;

    logger.info('User activated', { userId: id, activatedBy: currentUser.sub });

    return reply.status(200).send({ data: toUserResponse(result.value) });
  });
}
