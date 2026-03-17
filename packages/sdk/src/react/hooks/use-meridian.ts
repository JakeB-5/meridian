// React hooks for Meridian SDK — useMeridian and useQuestion

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import type { QueryResult } from '@meridian/shared';
import { MeridianEmbed } from '../../meridian-embed.js';
import type { MeridianEmbedOptions } from '../../meridian-embed.js';
import { ApiClient } from '../../api-client.js';
import type { ApiClientOptions } from '../../api-client.js';

// ── useMeridian ───────────────────────────────────────────────────────────────

/**
 * Returns a stable MeridianEmbed instance tied to the component lifecycle.
 * The instance is recreated only when baseUrl or token change.
 *
 * @example
 * ```tsx
 * const sdk = useMeridian({ baseUrl: 'https://analytics.example.com', token });
 * const containerRef = useRef<HTMLDivElement>(null);
 *
 * useEffect(() => {
 *   if (!containerRef.current) return;
 *   const dash = sdk.dashboard('dash-123', containerRef.current);
 *   return () => dash.destroy();
 * }, [sdk]);
 * ```
 */
export function useMeridian(options: MeridianEmbedOptions): MeridianEmbed {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Stable SDK instance — only recreated when identity keys change
  const sdkRef = useRef<MeridianEmbed | null>(null);
  const prevBaseUrl = useRef(options.baseUrl);
  const prevToken = useRef(options.token);

  if (
    !sdkRef.current ||
    prevBaseUrl.current !== options.baseUrl ||
    prevToken.current !== options.token
  ) {
    // Destroy the previous instance if credentials changed
    sdkRef.current?.destroy();
    sdkRef.current = new MeridianEmbed(options);
    prevBaseUrl.current = options.baseUrl;
    prevToken.current = options.token;
  }

  // Destroy on unmount
  useEffect(() => {
    return () => {
      sdkRef.current?.destroy();
    };
  }, []);

  return sdkRef.current;
}

// ── useQuestion ───────────────────────────────────────────────────────────────

export interface UseQuestionOptions {
  /** Whether to skip the initial fetch (useful for conditional fetching) */
  enabled?: boolean;
  /** Polling interval in ms. If set, the question is re-fetched at this interval. */
  pollInterval?: number;
  /** Called when data is successfully fetched */
  onSuccess?: (result: QueryResult) => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
}

export interface UseQuestionResult {
  data: QueryResult | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

/**
 * Fetches and manages the execution result of a Meridian question.
 *
 * @example
 * ```tsx
 * const { data, loading, error, refresh } = useQuestion(
 *   questionId,
 *   { baseUrl, token },
 *   params,
 * );
 * ```
 */
export function useQuestion(
  questionId: string,
  clientOptions: Pick<ApiClientOptions, 'baseUrl' | 'token'> & Partial<ApiClientOptions>,
  params?: Record<string, unknown>,
  options?: UseQuestionOptions,
): UseQuestionResult {
  const [data, setData] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const enabled = options?.enabled ?? true;
  const pollInterval = options?.pollInterval;

  // Stable ref for callbacks so they don't trigger re-runs
  const onSuccessRef = useRef(options?.onSuccess);
  const onErrorRef = useRef(options?.onError);
  onSuccessRef.current = options?.onSuccess;
  onErrorRef.current = options?.onError;

  // Stable client instance
  const client = useMemo(
    () =>
      new ApiClient({
        baseUrl: clientOptions.baseUrl,
        token: clientOptions.token,
        maxRetries: clientOptions.maxRetries,
        timeoutMs: clientOptions.timeoutMs,
      }),
    // Only recreate when identity params change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientOptions.baseUrl, clientOptions.token],
  );

  // Stable params serialization to detect changes
  const paramsKey = useMemo(
    () => (params ? JSON.stringify(params) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(params)],
  );

  const fetchData = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const result = await client.executeQuestion(
          questionId,
          params ?? {},
          { signal },
        );
        if (!signal.aborted) {
          setData(result);
          setLoading(false);
          onSuccessRef.current?.(result);
        }
      } catch (err) {
        if (signal.aborted) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setLoading(false);
        onErrorRef.current?.(error);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, questionId, paramsKey],
  );

  // Refresh counter — incremented to trigger a manual refresh
  const [refreshCount, setRefreshCount] = useState(0);

  const refresh = useCallback(() => {
    setRefreshCount((c) => c + 1);
  }, []);

  // Main fetch effect
  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    void fetchData(controller.signal);

    return () => {
      controller.abort();
    };
  }, [enabled, fetchData, refreshCount]);

  // Polling effect
  useEffect(() => {
    if (!enabled || !pollInterval || pollInterval <= 0) return;

    const id = setInterval(() => {
      setRefreshCount((c) => c + 1);
    }, pollInterval);

    return () => clearInterval(id);
  }, [enabled, pollInterval]);

  // Cleanup client on unmount
  useEffect(() => {
    return () => {
      client.cancelAll();
    };
  }, [client]);

  return { data, loading, error, refresh };
}

// ── useDashboardFilters ───────────────────────────────────────────────────────

export interface UseDashboardFiltersResult {
  filters: Record<string, unknown>;
  setFilter: (key: string, value: unknown) => void;
  setFilters: (filters: Record<string, unknown>) => void;
  clearFilter: (key: string) => void;
  clearAllFilters: () => void;
  resetToDefaults: () => void;
}

/**
 * Manages filter state for embedded dashboards.
 * Provides helpers for setting, clearing, and resetting filters.
 */
export function useDashboardFilters(
  initialFilters?: Record<string, unknown>,
): UseDashboardFiltersResult {
  const defaultsRef = useRef(initialFilters ?? {});
  const [filters, setFiltersState] = useState<Record<string, unknown>>(
    () => ({ ...(initialFilters ?? {}) }),
  );

  const setFilter = useCallback((key: string, value: unknown) => {
    setFiltersState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setFilters = useCallback((newFilters: Record<string, unknown>) => {
    setFiltersState((prev) => ({ ...prev, ...newFilters }));
  }, []);

  const clearFilter = useCallback((key: string) => {
    setFiltersState((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setFiltersState({});
  }, []);

  const resetToDefaults = useCallback(() => {
    setFiltersState({ ...defaultsRef.current });
  }, []);

  return { filters, setFilter, setFilters, clearFilter, clearAllFilters, resetToDefaults };
}
