import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import { apiClient } from '../client';
import { STALE_TIMES } from '@/lib/constants';
import type {
  UserResponse,
  UpdateUserRequest,
  InviteUserRequest,
  PaginatedRequest,
  PaginatedResponse,
} from '../types';

// ── Query keys ───────────────────────────────────────────────────────

export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (params: PaginatedRequest) => [...userKeys.lists(), params] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
  roles: () => [...userKeys.all, 'roles'] as const,
};

// ── List hooks ───────────────────────────────────────────────────────

/** Fetch paginated list of users */
export function useUsers(params: PaginatedRequest = {}) {
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: () =>
      apiClient.get<PaginatedResponse<UserResponse>>('/users', {
        params: {
          page: params.page,
          pageSize: params.pageSize,
          search: params.search,
          sortBy: params.sortBy,
          sortDirection: params.sortDirection,
        },
      }),
    staleTime: STALE_TIMES.LIST,
    placeholderData: keepPreviousData,
  });
}

// ── Detail hooks ─────────────────────────────────────────────────────

/** Fetch a single user */
export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => apiClient.get<UserResponse>(`/users/${id}`),
    staleTime: STALE_TIMES.DETAIL,
    enabled: !!id,
  });
}

/** Fetch available roles */
export function useRoles() {
  return useQuery({
    queryKey: userKeys.roles(),
    queryFn: () =>
      apiClient.get<Array<{ id: string; name: string; permissions: string[] }>>(
        '/roles',
      ),
    staleTime: STALE_TIMES.SCHEMA,
  });
}

// ── Mutation hooks ───────────────────────────────────────────────────

/** Update a user */
export function useUpdateUser(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateUserRequest) =>
      apiClient.patch<UserResponse>(`/users/${id}`, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(userKeys.detail(id), updated);
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

/** Delete a user */
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete(`/users/${id}`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      queryClient.removeQueries({ queryKey: userKeys.detail(id) });
    },
  });
}

/** Invite a new user */
export function useInviteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InviteUserRequest) =>
      apiClient.post<UserResponse>('/users/invite', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

/** Resend invitation email */
export function useResendInvitation() {
  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.post(`/users/${userId}/resend-invite`),
  });
}

/** Deactivate a user */
export function useDeactivateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<UserResponse>(`/users/${id}/deactivate`),
    onSuccess: (updated, id) => {
      queryClient.setQueryData(userKeys.detail(id), updated);
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

/** Reactivate a user */
export function useReactivateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<UserResponse>(`/users/${id}/reactivate`),
    onSuccess: (updated, id) => {
      queryClient.setQueryData(userKeys.detail(id), updated);
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}
