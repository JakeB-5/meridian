import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';
import { useAuthStore } from '@/stores/auth.store';
import { STALE_TIMES } from '@/lib/constants';
import type {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  UserResponse,
} from '../types';

// ── Query keys ───────────────────────────────────────────────────────

export const authKeys = {
  all: ['auth'] as const,
  currentUser: () => [...authKeys.all, 'me'] as const,
};

// ── Hooks ────────────────────────────────────────────────────────────

/** Fetch the current authenticated user */
export function useCurrentUser() {
  const { isAuthenticated, setUser, setLoading, logout } = useAuthStore();

  return useQuery({
    queryKey: authKeys.currentUser(),
    queryFn: async () => {
      const user = await apiClient.get<UserResponse>('/auth/me');
      setUser({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
        avatarUrl: user.avatarUrl,
        status: user.status,
      });
      setLoading(false);
      return user;
    },
    enabled: isAuthenticated,
    staleTime: STALE_TIMES.USER,
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (error && 'statusCode' in error && (error as { statusCode: number }).statusCode === 401) {
        logout();
        return false;
      }
      return failureCount < 2;
    },
  });
}

/** Login mutation */
export function useLogin() {
  const queryClient = useQueryClient();
  const { login } = useAuthStore();

  return useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      return apiClient.post<AuthResponse>('/auth/login', credentials, {
        skipAuth: true,
      });
    },
    onSuccess: (data) => {
      login(
        {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role,
          organizationId: data.user.organizationId,
          avatarUrl: data.user.avatarUrl,
          status: data.user.status,
        },
        data.tokens,
      );
      queryClient.invalidateQueries({ queryKey: authKeys.currentUser() });
    },
  });
}

/** Register mutation */
export function useRegister() {
  const queryClient = useQueryClient();
  const { login } = useAuthStore();

  return useMutation({
    mutationFn: async (data: RegisterRequest) => {
      return apiClient.post<AuthResponse>('/auth/register', data, {
        skipAuth: true,
      });
    },
    onSuccess: (data) => {
      login(
        {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role,
          organizationId: data.user.organizationId,
          avatarUrl: data.user.avatarUrl,
          status: data.user.status,
        },
        data.tokens,
      );
      queryClient.invalidateQueries({ queryKey: authKeys.currentUser() });
    },
  });
}

/** Logout mutation */
export function useLogout() {
  const queryClient = useQueryClient();
  const { logout, tokens } = useAuthStore();

  return useMutation({
    mutationFn: async () => {
      try {
        await apiClient.post('/auth/logout', {
          refreshToken: tokens?.refreshToken,
        });
      } catch {
        // Ignore errors — we clear local state regardless
      }
    },
    onSettled: () => {
      logout();
      queryClient.clear();
    },
  });
}

/** Update current user profile */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { updateUser } = useAuthStore();

  return useMutation({
    mutationFn: async (data: { name?: string; email?: string }) => {
      return apiClient.patch<UserResponse>('/auth/me', data);
    },
    onSuccess: (data) => {
      updateUser({
        name: data.name,
        email: data.email,
      });
      queryClient.invalidateQueries({ queryKey: authKeys.currentUser() });
    },
  });
}

/** Change password */
export function useChangePassword() {
  return useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      return apiClient.post('/auth/change-password', data);
    },
  });
}
