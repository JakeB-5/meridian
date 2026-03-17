import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import { apiClient } from '../client';
import { STALE_TIMES } from '@/lib/constants';
import type {
  QuestionResponse,
  CreateQuestionRequest,
  UpdateQuestionRequest,
  ExecuteQuestionRequest,
  QueryResult,
  PaginatedRequest,
  PaginatedResponse,
} from '../types';

// ── Query keys ───────────────────────────────────────────────────────

export const questionKeys = {
  all: ['questions'] as const,
  lists: () => [...questionKeys.all, 'list'] as const,
  list: (params: PaginatedRequest) => [...questionKeys.lists(), params] as const,
  details: () => [...questionKeys.all, 'detail'] as const,
  detail: (id: string) => [...questionKeys.details(), id] as const,
  result: (id: string) => [...questionKeys.detail(id), 'result'] as const,
};

// ── List hooks ───────────────────────────────────────────────────────

/** Fetch paginated list of questions */
export function useQuestions(params: PaginatedRequest = {}) {
  return useQuery({
    queryKey: questionKeys.list(params),
    queryFn: () =>
      apiClient.get<PaginatedResponse<QuestionResponse>>('/questions', {
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

/** Fetch a single question */
export function useQuestion(id: string) {
  return useQuery({
    queryKey: questionKeys.detail(id),
    queryFn: () => apiClient.get<QuestionResponse>(`/questions/${id}`),
    staleTime: STALE_TIMES.DETAIL,
    enabled: !!id,
  });
}

/** Fetch cached result for a question */
export function useQuestionResult(id: string, enabled = true) {
  return useQuery({
    queryKey: questionKeys.result(id),
    queryFn: () => apiClient.get<QueryResult>(`/questions/${id}/result`),
    staleTime: STALE_TIMES.QUERY_RESULT,
    enabled: !!id && enabled,
  });
}

// ── Mutation hooks ───────────────────────────────────────────────────

/** Create a new question */
export function useCreateQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateQuestionRequest) =>
      apiClient.post<QuestionResponse>('/questions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: questionKeys.lists() });
    },
  });
}

/** Update a question */
export function useUpdateQuestion(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateQuestionRequest) =>
      apiClient.patch<QuestionResponse>(`/questions/${id}`, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(questionKeys.detail(id), updated);
      queryClient.invalidateQueries({ queryKey: questionKeys.lists() });
    },
  });
}

/** Delete a question */
export function useDeleteQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete(`/questions/${id}`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: questionKeys.lists() });
      queryClient.removeQueries({ queryKey: questionKeys.detail(id) });
    },
  });
}

/** Execute a question (run the query) */
export function useExecuteQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ExecuteQuestionRequest) =>
      apiClient.post<QueryResult>('/questions/execute', data),
    onSuccess: (result, variables) => {
      if (variables.questionId) {
        queryClient.setQueryData(
          questionKeys.result(variables.questionId),
          result,
        );
      }
    },
  });
}

/** Execute ad-hoc SQL query (not saved) */
export function useExecuteAdHocQuery() {
  return useMutation({
    mutationFn: (data: { dataSourceId: string; sql: string; limit?: number }) =>
      apiClient.post<QueryResult>('/questions/execute-sql', data),
  });
}

/** Duplicate a question */
export function useDuplicateQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<QuestionResponse>(`/questions/${id}/duplicate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: questionKeys.lists() });
    },
  });
}

/** Toggle question favorite status */
export function useToggleQuestionFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      apiClient.post(`/questions/${id}/favorite`, { isFavorite }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: questionKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: questionKeys.lists() });
    },
  });
}
