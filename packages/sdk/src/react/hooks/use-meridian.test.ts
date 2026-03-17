// Tests for useMeridian, useQuestion, and useDashboardFilters hooks

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMeridian, useQuestion, useDashboardFilters } from './use-meridian.js';
import type { MeridianEmbedOptions } from '../../meridian-embed.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_RESULT = {
  columns: [
    { name: 'month', type: 'text', nullable: false },
    { name: 'revenue', type: 'number', nullable: true },
  ],
  rows: [
    { month: 'Jan', revenue: 10000 },
    { month: 'Feb', revenue: 12000 },
  ],
  rowCount: 2,
  executionTimeMs: 35,
  truncated: false,
};

function mockFetchOk(body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

function mockFetchError(status: number, message: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message, code: `HTTP_${status}` }), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

const defaultClientOptions = {
  baseUrl: 'https://analytics.example.com',
  token: 'embed-token',
  maxRetries: 0,
  timeoutMs: 5000,
};

const defaultEmbedOptions: MeridianEmbedOptions = {
  ...defaultClientOptions,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── useMeridian ───────────────────────────────────────────────────────────────

describe('useMeridian', () => {
  it('returns a MeridianEmbed instance', () => {
    const { result } = renderHook(() => useMeridian(defaultEmbedOptions));
    expect(result.current).toBeDefined();
    expect(typeof result.current.dashboard).toBe('function');
    expect(typeof result.current.question).toBe('function');
    expect(typeof result.current.destroy).toBe('function');
  });

  it('returns the same instance on re-renders with the same options', () => {
    const { result, rerender } = renderHook(() => useMeridian(defaultEmbedOptions));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('returns a new instance when baseUrl changes', () => {
    let baseUrl = 'https://analytics.example.com';
    const { result, rerender } = renderHook(() =>
      useMeridian({ ...defaultEmbedOptions, baseUrl }),
    );
    const first = result.current;

    baseUrl = 'https://other.example.com';
    rerender();

    expect(result.current).not.toBe(first);
  });

  it('returns a new instance when token changes', () => {
    let token = 'token-a';
    const { result, rerender } = renderHook(() =>
      useMeridian({ ...defaultEmbedOptions, token }),
    );
    const first = result.current;

    token = 'token-b';
    rerender();

    expect(result.current).not.toBe(first);
  });

  it('destroys the instance on unmount', () => {
    const { result, unmount } = renderHook(() => useMeridian(defaultEmbedOptions));
    const sdk = result.current;
    const destroySpy = vi.spyOn(sdk, 'destroy');

    unmount();

    expect(destroySpy).toHaveBeenCalledOnce();
  });

  it('resolves light theme by default', () => {
    const { result } = renderHook(() => useMeridian(defaultEmbedOptions));
    expect(result.current.getTheme().name).toBe('light');
  });

  it('resolves dark theme when specified', () => {
    const { result } = renderHook(() =>
      useMeridian({ ...defaultEmbedOptions, theme: 'dark' }),
    );
    expect(result.current.getTheme().name).toBe('dark');
  });
});

// ── useQuestion ───────────────────────────────────────────────────────────────

describe('useQuestion', () => {
  it('starts in loading state', () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})));

    const { result } = renderHook(() =>
      useQuestion('q-1', defaultClientOptions),
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('transitions to loaded state with data on success', async () => {
    mockFetchOk(MOCK_RESULT);

    const { result } = renderHook(() =>
      useQuestion('q-1', defaultClientOptions),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(MOCK_RESULT);
    expect(result.current.error).toBeNull();
  });

  it('transitions to error state on fetch failure', async () => {
    mockFetchError(500, 'Internal server error');

    const { result } = renderHook(() =>
      useQuestion('q-1', defaultClientOptions),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.data).toBeNull();
  });

  it('calls onSuccess when data loads successfully', async () => {
    mockFetchOk(MOCK_RESULT);
    const onSuccess = vi.fn();

    renderHook(() =>
      useQuestion('q-1', defaultClientOptions, {}, { onSuccess }),
    );

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });

    expect(onSuccess).toHaveBeenCalledWith(MOCK_RESULT);
  });

  it('calls onError when fetch fails', async () => {
    mockFetchError(404, 'Not found');
    const onError = vi.fn();

    renderHook(() =>
      useQuestion('q-1', defaultClientOptions, {}, { onError }),
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
    });

    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('does not fetch when enabled=false', () => {
    vi.stubGlobal('fetch', vi.fn());

    renderHook(() =>
      useQuestion('q-1', defaultClientOptions, {}, { enabled: false }),
    );

    expect(fetch).not.toHaveBeenCalled();
  });

  it('refresh() triggers a re-fetch', async () => {
    mockFetchOk(MOCK_RESULT);

    const { result } = renderHook(() =>
      useQuestion('q-1', defaultClientOptions),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const callsBefore = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
        callsBefore,
      );
    });
  });

  it('passes query parameters to the API call', async () => {
    mockFetchOk(MOCK_RESULT);
    const params = { date_from: '2024-01-01', limit: 50 };

    renderHook(() =>
      useQuestion('q-1', defaultClientOptions, params),
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledOnce();
    });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject(params);
  });

  it('re-fetches when questionId changes', async () => {
    mockFetchOk(MOCK_RESULT);
    let questionId = 'q-1';

    const { rerender } = renderHook(() =>
      useQuestion(questionId, defaultClientOptions),
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledOnce();
    });

    questionId = 'q-2';
    rerender();

    await waitFor(() => {
      expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('re-fetches when params change', async () => {
    mockFetchOk(MOCK_RESULT);
    let params = { year: 2023 };

    const { rerender } = renderHook(() =>
      useQuestion('q-1', defaultClientOptions, params),
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledOnce();
    });

    params = { year: 2024 };
    rerender();

    await waitFor(() => {
      expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('polling: re-fetches at the specified interval', async () => {
    vi.useFakeTimers();
    mockFetchOk(MOCK_RESULT);

    renderHook(() =>
      useQuestion('q-1', defaultClientOptions, {}, { pollInterval: 5000 }),
    );

    // Initial fetch
    await act(async () => {
      await Promise.resolve();
    });

    const countAfterInit = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    // Advance timers past the interval
    await act(async () => {
      vi.advanceTimersByTime(5001);
      await Promise.resolve();
    });

    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
      countAfterInit,
    );

    vi.useRealTimers();
  });

  it('returns refresh function that is stable across renders', async () => {
    mockFetchOk(MOCK_RESULT);

    const { result, rerender } = renderHook(() =>
      useQuestion('q-1', defaultClientOptions),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const refreshBefore = result.current.refresh;
    rerender();
    expect(result.current.refresh).toBe(refreshBefore);
  });
});

// ── useDashboardFilters ───────────────────────────────────────────────────────

describe('useDashboardFilters', () => {
  it('initializes with provided default filters', () => {
    const { result } = renderHook(() =>
      useDashboardFilters({ region: 'US', year: 2024 }),
    );

    expect(result.current.filters).toEqual({ region: 'US', year: 2024 });
  });

  it('initializes with empty filters when no defaults provided', () => {
    const { result } = renderHook(() => useDashboardFilters());
    expect(result.current.filters).toEqual({});
  });

  it('setFilter updates a single filter', () => {
    const { result } = renderHook(() =>
      useDashboardFilters({ region: 'US' }),
    );

    act(() => {
      result.current.setFilter('region', 'EU');
    });

    expect(result.current.filters.region).toBe('EU');
  });

  it('setFilter preserves other filters', () => {
    const { result } = renderHook(() =>
      useDashboardFilters({ region: 'US', year: 2024 }),
    );

    act(() => {
      result.current.setFilter('region', 'EU');
    });

    expect(result.current.filters.year).toBe(2024);
  });

  it('setFilters merges multiple filter updates', () => {
    const { result } = renderHook(() =>
      useDashboardFilters({ region: 'US' }),
    );

    act(() => {
      result.current.setFilters({ year: 2025, quarter: 'Q1' });
    });

    expect(result.current.filters).toMatchObject({
      region: 'US',
      year: 2025,
      quarter: 'Q1',
    });
  });

  it('clearFilter removes a specific key', () => {
    const { result } = renderHook(() =>
      useDashboardFilters({ region: 'US', year: 2024 }),
    );

    act(() => {
      result.current.clearFilter('region');
    });

    expect(result.current.filters).not.toHaveProperty('region');
    expect(result.current.filters.year).toBe(2024);
  });

  it('clearAllFilters removes all filters', () => {
    const { result } = renderHook(() =>
      useDashboardFilters({ region: 'US', year: 2024, quarter: 'Q2' }),
    );

    act(() => {
      result.current.clearAllFilters();
    });

    expect(result.current.filters).toEqual({});
  });

  it('resetToDefaults restores the initial filter values', () => {
    const { result } = renderHook(() =>
      useDashboardFilters({ region: 'US', year: 2024 }),
    );

    act(() => {
      result.current.setFilters({ region: 'EU', year: 2025 });
    });

    expect(result.current.filters).toMatchObject({ region: 'EU', year: 2025 });

    act(() => {
      result.current.resetToDefaults();
    });

    expect(result.current.filters).toEqual({ region: 'US', year: 2024 });
  });

  it('setFilter, setFilters, clearFilter, clearAllFilters, resetToDefaults are stable', () => {
    const { result, rerender } = renderHook(() =>
      useDashboardFilters({ region: 'US' }),
    );

    const { setFilter, setFilters, clearFilter, clearAllFilters, resetToDefaults } =
      result.current;

    rerender();

    expect(result.current.setFilter).toBe(setFilter);
    expect(result.current.setFilters).toBe(setFilters);
    expect(result.current.clearFilter).toBe(clearFilter);
    expect(result.current.clearAllFilters).toBe(clearAllFilters);
    expect(result.current.resetToDefaults).toBe(resetToDefaults);
  });

  it('filter state update is reflected in subsequent reads', () => {
    const { result } = renderHook(() => useDashboardFilters());

    act(() => {
      result.current.setFilter('a', 1);
    });
    act(() => {
      result.current.setFilter('b', 2);
    });
    act(() => {
      result.current.setFilter('c', 3);
    });

    expect(result.current.filters).toEqual({ a: 1, b: 2, c: 3 });
  });
});
