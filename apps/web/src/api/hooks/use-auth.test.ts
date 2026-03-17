import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test the query key structure
import { authKeys } from './use-auth';

describe('authKeys', () => {
  it('should generate correct query keys', () => {
    expect(authKeys.all).toEqual(['auth']);
    expect(authKeys.currentUser()).toEqual(['auth', 'me']);
  });

  it('should maintain referential equality for static keys', () => {
    expect(authKeys.all).toBe(authKeys.all);
  });
});

// Test that the hooks are properly exported
describe('auth hooks exports', () => {
  it('should export all hooks', async () => {
    const mod = await import('./use-auth');
    expect(typeof mod.useCurrentUser).toBe('function');
    expect(typeof mod.useLogin).toBe('function');
    expect(typeof mod.useRegister).toBe('function');
    expect(typeof mod.useLogout).toBe('function');
    expect(typeof mod.useUpdateProfile).toBe('function');
    expect(typeof mod.useChangePassword).toBe('function');
  });
});
