import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from './auth.store';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('auth.store', () => {
  beforeEach(() => {
    localStorageMock.clear();
    useAuthStore.setState({
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: true,
    });
  });

  it('should start with unauthenticated state', () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.tokens).toBeNull();
  });

  it('should login and set user + tokens', () => {
    const { login } = useAuthStore.getState();

    login(
      {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
        organizationId: 'org-1',
        status: 'active',
      },
      { accessToken: 'access-123', refreshToken: 'refresh-456' },
    );

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.email).toBe('test@example.com');
    expect(state.tokens?.accessToken).toBe('access-123');
    expect(state.isLoading).toBe(false);
  });

  it('should logout and clear state', () => {
    const { login, logout } = useAuthStore.getState();

    login(
      {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
        organizationId: 'org-1',
        status: 'active',
      },
      { accessToken: 'access-123', refreshToken: 'refresh-456' },
    );

    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.tokens).toBeNull();
  });

  it('should update user fields', () => {
    const { login, updateUser } = useAuthStore.getState();

    login(
      {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
        organizationId: 'org-1',
        status: 'active',
      },
      { accessToken: 'access-123', refreshToken: 'refresh-456' },
    );

    updateUser({ name: 'Updated Name', email: 'updated@example.com' });

    const state = useAuthStore.getState();
    expect(state.user?.name).toBe('Updated Name');
    expect(state.user?.email).toBe('updated@example.com');
    expect(state.user?.role).toBe('admin'); // unchanged
  });

  it('should set loading state', () => {
    const { setLoading } = useAuthStore.getState();

    setLoading(true);
    expect(useAuthStore.getState().isLoading).toBe(true);

    setLoading(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('should not update user if not authenticated', () => {
    const { updateUser } = useAuthStore.getState();
    updateUser({ name: 'Ghost' });
    expect(useAuthStore.getState().user).toBeNull();
  });
});
