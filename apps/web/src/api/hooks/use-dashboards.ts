import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import { apiClient } from '../client';
import { STALE_TIMES } from '@/lib/constants';
import type {
  DashboardResponse,
  CreateDashboardRequest,
  UpdateDashboardRequest,
  QueryResult,
  PaginatedRequest,
  PaginatedResponse,
} from '../types';

// ── Query keys ───────────────────────────────────────────────────────

export const dashboardKeys = {
  all: ['dashboards'] as const,
  lists: () => [...dashboardKeys.all, 'list'] as const,
  list: (params: PaginatedRequest) => [...dashboardKeys.lists(), params] as const,
  details: () => [...dashboardKeys.all, 'detail'] as const,
  detail: (id: string) => [...dashboardKeys.details(), id] as const,
  cardResults: (dashboardId: string) =>
    [...dashboardKeys.detail(dashboardId), 'card-results'] as const,
  cardResult: (dashboardId: string, cardId: string) =>
    [...dashboardKeys.cardResults(dashboardId), cardId] as const,
};

// ── List hooks ───────────────────────────────────────────────────────

/** Fetch paginated list of dashboards */
export function useDashboards(params: PaginatedRequest = {}) {
  return useQuery({
    queryKey: dashboardKeys.list(params),
    queryFn: () =>
      apiClient.get<PaginatedResponse<DashboardResponse>>('/dashboards', {
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

/** Fetch a single dashboard with all cards */
export function useDashboard(id: string) {
  return useQuery({
    queryKey: dashboardKeys.detail(id),
    queryFn: () => apiClient.get<DashboardResponse>(`/dashboards/${id}`),
    staleTime: STALE_TIMES.DETAIL,
    enabled: !!id,
  });
}

/** Fetch results for all cards in a dashboard */
export function useDashboardCardResults(dashboardId: string, enabled = true) {
  return useQuery({
    queryKey: dashboardKeys.cardResults(dashboardId),
    queryFn: () =>
      apiClient.get<Record<string, QueryResult>>(
        `/dashboards/${dashboardId}/results`,
      ),
    staleTime: STALE_TIMES.QUERY_RESULT,
    enabled: !!dashboardId && enabled,
  });
}

// ── Mutation hooks ───────────────────────────────────────────────────

/** Create a new dashboard */
export function useCreateDashboard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDashboardRequest) =>
      apiClient.post<DashboardResponse>('/dashboards', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.lists() });
    },
  });
}

/** Update a dashboard */
export function useUpdateDashboard(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateDashboardRequest) =>
      apiClient.patch<DashboardResponse>(`/dashboards/${id}`, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(dashboardKeys.detail(id), updated);
      queryClient.invalidateQueries({ queryKey: dashboardKeys.lists() });
    },
  });
}

/** Delete a dashboard */
export function useDeleteDashboard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete(`/dashboards/${id}`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.lists() });
      queryClient.removeQueries({ queryKey: dashboardKeys.detail(id) });
    },
  });
}

/** Duplicate a dashboard */
export function useDuplicateDashboard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<DashboardResponse>(`/dashboards/${id}/duplicate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.lists() });
    },
  });
}

/** Toggle dashboard favorite */
export function useToggleDashboardFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      apiClient.post(`/dashboards/${id}/favorite`, { isFavorite }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.lists() });
    },
  });
}

/** Refresh all cards in a dashboard */
export function useRefreshDashboard(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient.post<Record<string, QueryResult>>(
        `/dashboards/${id}/refresh`,
      ),
    onSuccess: (results) => {
      queryClient.setQueryData(dashboardKeys.cardResults(id), results);
    },
  });
}

/** Add a card to a dashboard */
export function useAddDashboardCard(dashboardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      questionId: string;
      position: { x: number; y: number };
      size: { width: number; height: number };
    }) =>
      apiClient.post<DashboardResponse>(
        `/dashboards/${dashboardId}/cards`,
        data,
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(dashboardKeys.detail(dashboardId), updated);
    },
  });
}

/** Remove a card from a dashboard */
export function useRemoveDashboardCard(dashboardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cardId: string) =>
      apiClient.delete(`/dashboards/${dashboardId}/cards/${cardId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.detail(dashboardId),
      });
    },
  });
}
