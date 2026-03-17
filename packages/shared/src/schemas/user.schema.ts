import { z } from 'zod';
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from '../constants/defaults.js';

// ── User Schemas ────────────────────────────────────────────────────

export const permissionSchema = z.enum([
  'datasource:read', 'datasource:write', 'datasource:delete',
  'question:read', 'question:write', 'question:delete',
  'dashboard:read', 'dashboard:write', 'dashboard:delete',
  'user:read', 'user:write', 'user:delete',
  'role:read', 'role:write', 'role:delete',
  'organization:read', 'organization:write',
  'plugin:read', 'plugin:write',
  'admin',
]);

export const registerUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
  organizationId: z.string().min(1).optional(),
  organizationName: z.string().min(1).max(255).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  avatarUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});

export const createRoleSchema = z.object({
  name: z.string().min(1).max(255),
  permissions: z.array(permissionSchema).min(1),
  organizationId: z.string().min(1),
});

export const updateRoleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  permissions: z.array(permissionSchema).min(1).optional(),
});

export type RegisterUserInput = z.infer<typeof registerUserSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
