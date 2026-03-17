import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import { apiClient } from '../client';
import { STALE_TIMES } from '@/lib/constants';
import type {
  DataSourceResponse,
  CreateDataSourceRequest,
  UpdateDataSourceRequest,
  TestConnectionRequest,
  ConnectionTestResult,
  SchemaInfo,
  PaginatedRequest,
  PaginatedResponse,
} from '../types';

// ── Query keys ───────────────────────────────────────────────────────

export const datasourceKeys = {
  all: ['datasources'] as const,
  lists: () => [...datasourceKeys.all, 'list'] as const,
  list: (params: PaginatedRequest) => [...datasourceKeys.lists(), params] as const,
  details: () => [...datasourceKeys.all, 'detail'] as const,
  detail: (id: string) => [...datasourceKeys.details(), id] as const,
  schema: (id: string) => [...datasourceKeys.detail(id), 'schema'] as const,
  tables: (id: string) => [...datasourceKeys.detail(id), 'tables'] as const,
};

// ── List hooks ───────────────────────────────────────────────────────

/** Fetch paginated list of data sources */
export function useDatasources(params: PaginatedRequest = {}) {
  return useQuery({
    queryKey: datasourceKeys.list(params),
    queryFn: () =>
      apiClient.get<PaginatedResponse<DataSourceResponse>>('/datasources', {
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

/** Fetch all data sources (no pagination, for selects) */
export function useAllDatasources() {
  return useQuery({
    queryKey: [...datasourceKeys.all, 'all'],
    queryFn: () =>
      apiClient.get<DataSourceResponse[]>('/datasources/all'),
    staleTime: STALE_TIMES.LIST,
  });
}

// ── Detail hooks ─────────────────────────────────────────────────────

/** Fetch a single data source */
export function useDatasource(id: string) {
  return useQuery({
    queryKey: datasourceKeys.detail(id),
    queryFn: () => apiClient.get<DataSourceResponse>(`/datasources/${id}`),
    staleTime: STALE_TIMES.DETAIL,
    enabled: !!id,
  });
}

/** Fetch schema for a data source */
export function useDatasourceSchema(id: string) {
  return useQuery({
    queryKey: datasourceKeys.schema(id),
    queryFn: () => apiClient.get<SchemaInfo[]>(`/datasources/${id}/schema`),
    staleTime: STALE_TIMES.SCHEMA,
    enabled: !!id,
  });
}

/** Fetch tables for a data source (lighter than full schema) */
export function useDatasourceTables(id: string) {
  return useQuery({
    queryKey: datasourceKeys.tables(id),
    queryFn: () =>
      apiClient.get<Array<{ name: string; schema: string; rowCount?: number }>>(
        `/datasources/${id}/tables`,
      ),
    staleTime: STALE_TIMES.SCHEMA,
    enabled: !!id,
  });
}

// ── Mutation hooks ───────────────────────────────────────────────────

/** Create a new data source */
export function useCreateDatasource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDataSourceRequest) =>
      apiClient.post<DataSourceResponse>('/datasources', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datasourceKeys.lists() });
    },
  });
}

/** Update a data source */
export function useUpdateDatasource(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateDataSourceRequest) =>
      apiClient.patch<DataSourceResponse>(`/datasources/${id}`, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(datasourceKeys.detail(id), updated);
      queryClient.invalidateQueries({ queryKey: datasourceKeys.lists() });
    },
  });
}

/** Delete a data source */
export function useDeleteDatasource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete(`/datasources/${id}`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: datasourceKeys.lists() });
      queryClient.removeQueries({ queryKey: datasourceKeys.detail(id) });
    },
  });
}

/** Test a data source connection */
export function useTestConnection() {
  return useMutation({
    mutationFn: (data: TestConnectionRequest) =>
      apiClient.post<ConnectionTestResult>('/datasources/test-connection', data),
  });
}

/** Sync schema for a data source */
export function useSyncSchema(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient.post(`/datasources/${id}/sync`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datasourceKeys.schema(id) });
      queryClient.invalidateQueries({ queryKey: datasourceKeys.tables(id) });
    },
  });
}
