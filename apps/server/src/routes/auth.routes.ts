import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  AuthenticationError,
  ValidationError,
  ConflictError,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from '@meridian/shared';
import type { ServiceContainer } from '../services/container.js';

// ── Request Schemas ─────────────────────────────────────────────────

const registerBodySchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().min(1, 'Name is required').max(255),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
  organizationName: z.string().min(1).max(255).optional(),
  organizationId: z.string().min(1).optional(),
});

const loginBodySchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const refreshBodySchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const logoutBodySchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required').optional(),
});

// ── Response Types ──────────────────────────────────────────────────

interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  user: {
    id: string;
    email: string;
    name: string;
    organizationId: string;
    role: string;
    status: string;
  };
}

interface UserProfileResponse {
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
  status: string;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Route Registration ──────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance, container: ServiceContainer): Promise<void> {
  const { tokenService, passwordService, userService, userRepository, logger } = container;

  // Lazy-load domain models for user/org creation
  const coreModels = await import('@meridian/core/models/user.model.js');
  const orgModels = await import('@meridian/core/models/organization.model.js');
  const { User, Role } = coreModels;
  const { Organization } = orgModels;

  // ── POST /api/auth/register ─────────────────────────────────────

  app.post('/api/auth/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = registerBodySchema.parse(request.body);

    // Validate password strength
    const strengthResult = passwordService.validateStrength(body.password);
    if (!strengthResult.valid) {
      throw new ValidationError('Password does not meet strength requirements', {
        violations: strengthResult.violations,
      });
    }

    // Check if user already exists
    const existingResult = await userService.getByEmail(body.email);
    if (existingResult.ok) {
      throw new ConflictError(`User with email '${body.email}' already exists`);
    }

    // Create or resolve organization
    let organizationId: string;
    if (body.organizationId) {
      organizationId = body.organizationId;
    } else {
      const orgName = body.organizationName ?? `${body.name}'s Organization`;
      const orgResult = Organization.create({ name: orgName });
      if (!orgResult.ok) throw orgResult.error;
      organizationId = orgResult.value.id;
    }

    // Create admin role for new org
    const adminRole = Role.createAdmin(organizationId);

    // Create user
    const userResult = User.create({
      email: body.email,
      name: body.name,
      organizationId,
      role: adminRole,
    });
    if (!userResult.ok) throw userResult.error;

    // Activate the user immediately on registration
    const activateResult = userResult.value.activate();
    if (!activateResult.ok) throw activateResult.error;

    const user = activateResult.value;

    // Hash and store password
    const passwordHash = await passwordService.hash(body.password);
    await userRepository.save(user as any);
    await userRepository.savePassword(user.id, passwordHash);

    // Generate token pair
    const tokenPair = await tokenService.generateTokenPair({
      sub: user.id,
      email: user.email,
      orgId: user.organizationId,
      roleId: user.role.id,
      permissions: [...user.role.permissions],
    });

    // Record login
    const loginUser = user.recordLogin();
    await userRepository.save(loginUser as any);

    logger.info('User registered', { userId: user.id, email: user.email });

    const response: AuthTokenResponse = {
      ...tokenPair,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organizationId: user.organizationId,
        role: user.role.name,
        status: user.status,
      },
    };

    return reply.status(201).send(response);
  });

  // ── POST /api/auth/login ────────────────────────────────────────

  app.post('/api/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = loginBodySchema.parse(request.body);

    // Find user by email
    const userResult = await userService.getByEmail(body.email);
    if (!userResult.ok) {
      throw new AuthenticationError('Invalid email or password');
    }

    const user = userResult.value;

    // Check user is active
    if (!user.isActive) {
      throw new AuthenticationError('Account is not active');
    }

    // Verify password
    const passwordHash = await userRepository.getPasswordHash(user.id);
    if (!passwordHash) {
      throw new AuthenticationError('Invalid email or password');
    }

    const passwordValid = await passwordService.verify(body.password, passwordHash);
    if (!passwordValid) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Check if password needs rehash
    if (passwordService.needsRehash(passwordHash)) {
      const newHash = await passwordService.hash(body.password);
      await userRepository.savePassword(user.id, newHash);
    }

    // Generate token pair
    const tokenPair = await tokenService.generateTokenPair({
      sub: user.id,
      email: user.email,
      orgId: user.organizationId,
      roleId: user.role.id,
      permissions: [...user.role.permissions],
    });

    // Record login
    await userService.recordLogin(user.id);

    logger.info('User logged in', { userId: user.id, email: user.email });

    const response: AuthTokenResponse = {
      ...tokenPair,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organizationId: user.organizationId,
        role: user.role.name,
        status: user.status,
      },
    };

    return reply.status(200).send(response);
  });

  // ── POST /api/auth/refresh ──────────────────────────────────────

  app.post('/api/auth/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = refreshBodySchema.parse(request.body);

    const result = await tokenService.refreshTokenPair(body.refreshToken);
    if (!result.ok) {
      throw new AuthenticationError('Invalid or expired refresh token');
    }

    logger.debug('Token refreshed');

    return reply.status(200).send(result.value);
  });

  // ── POST /api/auth/logout ───────────────────────────────────────

  app.post('/api/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    logoutBodySchema.parse(request.body ?? {});

    if (request.user) {
      logger.info('User logged out', { userId: request.user.sub });
    }

    return reply.status(200).send({ message: 'Logged out successfully' });
  });

  // ── GET /api/auth/me ────────────────────────────────────────────

  app.get('/api/auth/me', {
    preHandler: [app.requireAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.sub;

    const userResult = await userService.getById(userId);
    if (!userResult.ok) {
      throw new AuthenticationError('User not found');
    }

    const user = userResult.value;
    const response: UserProfileResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      organizationId: user.organizationId,
      role: {
        id: user.role.id,
        name: user.role.name,
        permissions: [...user.role.permissions],
      },
      status: user.status,
      lastLoginAt: user.lastLoginAt?.toISOString(),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };

    return reply.status(200).send(response);
  });
}
