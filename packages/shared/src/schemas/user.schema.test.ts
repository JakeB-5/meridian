import { describe, it, expect } from 'vitest';
import {
  registerUserSchema,
  loginSchema,
  updateUserSchema,
  changePasswordSchema,
  createRoleSchema,
  permissionSchema,
} from './user.schema.js';

describe('registerUserSchema', () => {
  const validInput = {
    email: 'user@example.com',
    name: 'John Doe',
    password: 'secure123',
  };

  it('validates correct input', () => {
    expect(registerUserSchema.safeParse(validInput).success).toBe(true);
  });

  it('requires valid email', () => {
    expect(registerUserSchema.safeParse({ ...validInput, email: 'not-email' }).success).toBe(false);
  });

  it('requires name', () => {
    expect(registerUserSchema.safeParse({ ...validInput, name: '' }).success).toBe(false);
  });

  it('enforces minimum password length', () => {
    expect(registerUserSchema.safeParse({ ...validInput, password: 'short' }).success).toBe(false);
  });

  it('enforces maximum password length', () => {
    expect(registerUserSchema.safeParse({ ...validInput, password: 'x'.repeat(129) }).success).toBe(false);
  });

  it('allows optional organizationId', () => {
    expect(registerUserSchema.safeParse({ ...validInput, organizationId: 'org-1' }).success).toBe(true);
  });

  it('allows optional organizationName', () => {
    expect(registerUserSchema.safeParse({ ...validInput, organizationName: 'My Org' }).success).toBe(true);
  });
});

describe('loginSchema', () => {
  it('validates correct credentials', () => {
    expect(loginSchema.safeParse({ email: 'user@example.com', password: 'pass123' }).success).toBe(true);
  });

  it('requires valid email', () => {
    expect(loginSchema.safeParse({ email: 'bad', password: 'pass' }).success).toBe(false);
  });

  it('requires non-empty password', () => {
    expect(loginSchema.safeParse({ email: 'user@example.com', password: '' }).success).toBe(false);
  });
});

describe('updateUserSchema', () => {
  it('allows partial updates', () => {
    expect(updateUserSchema.safeParse({ name: 'New Name' }).success).toBe(true);
    expect(updateUserSchema.safeParse({ email: 'new@example.com' }).success).toBe(true);
    expect(updateUserSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(updateUserSchema.safeParse({}).success).toBe(true);
  });

  it('validates email format when provided', () => {
    expect(updateUserSchema.safeParse({ email: 'bad-email' }).success).toBe(false);
  });

  it('validates avatarUrl format when provided', () => {
    expect(updateUserSchema.safeParse({ avatarUrl: 'not-a-url' }).success).toBe(false);
    expect(updateUserSchema.safeParse({ avatarUrl: 'https://example.com/avatar.png' }).success).toBe(true);
  });
});

describe('changePasswordSchema', () => {
  it('validates correct input', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'old-pass',
      newPassword: 'new-secure-pass',
    });
    expect(result.success).toBe(true);
  });

  it('enforces new password minimum length', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'old',
      newPassword: 'short',
    });
    expect(result.success).toBe(false);
  });
});

describe('createRoleSchema', () => {
  it('validates correct role', () => {
    const result = createRoleSchema.safeParse({
      name: 'Editor',
      permissions: ['dashboard:read', 'dashboard:write', 'question:read'],
      organizationId: 'org-1',
    });
    expect(result.success).toBe(true);
  });

  it('requires at least one permission', () => {
    const result = createRoleSchema.safeParse({
      name: 'Empty',
      permissions: [],
      organizationId: 'org-1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid permissions', () => {
    const result = createRoleSchema.safeParse({
      name: 'Bad',
      permissions: ['invalid:permission'],
      organizationId: 'org-1',
    });
    expect(result.success).toBe(false);
  });
});

describe('permissionSchema', () => {
  it('accepts all valid permissions', () => {
    const allPerms = [
      'datasource:read', 'datasource:write', 'datasource:delete',
      'question:read', 'question:write', 'question:delete',
      'dashboard:read', 'dashboard:write', 'dashboard:delete',
      'user:read', 'user:write', 'user:delete',
      'role:read', 'role:write', 'role:delete',
      'organization:read', 'organization:write',
      'plugin:read', 'plugin:write',
      'admin',
    ];
    for (const perm of allPerms) {
      expect(permissionSchema.safeParse(perm).success).toBe(true);
    }
  });
});
