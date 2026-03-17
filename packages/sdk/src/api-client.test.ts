// Tests for ApiClient — mock fetch, retry, error handling, cancellation

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient, ApiError, NetworkError, TimeoutError } from './api-client.js';
import type { Dashboard, Question } from './api-client.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeClient(overrides?: {
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}): ApiClient {
  return new ApiClient({
    baseUrl: 'https://analytics.example.com',
    token: 'test-token',
    maxRetries: overrides?.maxRetries ?? 0, // default 0 retries so tests are fast
    retryDelayMs: overrides?.retryDelayMs ?? 1,
    timeoutMs: overrides?.timeoutMs ?? 5000,
  });
}

function mockFetch(
  response: { status?: number; body?: unknown; headers?: Record<string, string> } | Error,
): void {
  if (response instanceof Error) {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(response));
    return;
  }

  const { status = 200, body = {}, headers = {} } = response;
  const responseHeaders = new Headers({
    'content-type': 'application/json',
    ...headers,
  });

  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(body), { status, headers: responseHeaders }),
      ),
    ),
  );
}

function mockFetchSequence(
  responses: Array<
    { status?: number; body?: unknown; headers?: Record<string, string> } | Error
  >,
): void {
  let callIndex = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => {
      const resp = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;

      if (resp instanceof Error) {
        return Promise.reject(resp);
      }

      const { status = 200, body = {}, headers = {} } = resp;
      const responseHeaders = new Headers({
        'content-type': 'application/json',
        ...headers,
      });
      return Promise.resolve(
        new Response(JSON.stringify(body), { status, headers: responseHeaders }),
      );
    }),
  );
}

const MOCK_DASHBOARD: Dashboard = {
  id: 'dash-1',
  name: 'Sales Dashboard',
  description: 'Monthly sales overview',
  cards: [
    { id: 'card-1', questionId: 'q-1', title: 'Revenue', position: { x: 0, y: 0, w: 4, h: 2 } },
  ],
  filters: [],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-15T00:00:00Z',
};

const MOCK_QUESTION: Question = {
  id: 'q-1',
  name: 'Monthly Revenue',
  queryType: 'sql',
  sql: 'SELECT month, sum(revenue) FROM sales GROUP BY month',
  dataSourceId: 'ds-1',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-15T00:00:00Z',
};

const MOCK_QUERY_RESULT = {
  columns: [
    { name: 'month', type: 'text', nullable: false },
    { name: 'sum', type: 'number', nullable: true },
  ],
  rows: [{ month: 'Jan', sum: 10000 }],
  rowCount: 1,
  executionTimeMs: 42,
  truncated: false,
};

// ── Setup / teardown ──────────────────────────────────────────────────────────

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── getDashboard ──────────────────────────────────────────────────────────────

describe('ApiClient.getDashboard', () => {
  it('makes a GET request to the correct URL with auth header', async () => {
    mockFetch({ body: MOCK_DASHBOARD });
    const client = makeClient();

    const result = await client.getDashboard('dash-1');

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://analytics.example.com/api/embed/dashboards/dash-1');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token');
    expect(result).toEqual(MOCK_DASHBOARD);
  });

  it('URL-encodes special characters in the ID', async () => {
    mockFetch({ body: MOCK_DASHBOARD });
    const client = makeClient();

    await client.getDashboard('dash/with spaces');

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain('dash%2Fwith%20spaces');
  });

  it('throws ApiError on 404', async () => {
    mockFetch({
      status: 404,
      body: { message: 'Dashboard not found', code: 'NOT_FOUND' },
    });
    const client = makeClient();

    await expect(client.getDashboard('missing')).rejects.toThrow(ApiError);
    await expect(client.getDashboard('missing')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('throws ApiError on 401', async () => {
    mockFetch({
      status: 401,
      body: { message: 'Unauthorized', code: 'ERR_AUTHENTICATION' },
    });
    const client = makeClient();

    await expect(client.getDashboard('dash-1')).rejects.toThrow(ApiError);
    await expect(client.getDashboard('dash-1')).rejects.toMatchObject({ status: 401 });
  });

  it('throws NetworkError on fetch failure', async () => {
    mockFetch(new TypeError('Failed to fetch'));
    const client = makeClient();

    await expect(client.getDashboard('dash-1')).rejects.toThrow(NetworkError);
  });
});

// ── getQuestion ───────────────────────────────────────────────────────────────

describe('ApiClient.getQuestion', () => {
  it('makes a GET request to the correct question URL', async () => {
    mockFetch({ body: MOCK_QUESTION });
    const client = makeClient();

    const result = await client.getQuestion('q-1');

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe('https://analytics.example.com/api/embed/questions/q-1');
    expect(result).toEqual(MOCK_QUESTION);
  });

  it('throws ApiError with correct status on server error', async () => {
    mockFetch({ status: 500, body: { message: 'Internal error', code: 'ERR_UNEXPECTED' } });
    const client = makeClient();

    await expect(client.getQuestion('q-1')).rejects.toMatchObject({
      status: 500,
      code: 'ERR_UNEXPECTED',
    });
  });
});

// ── executeQuestion ───────────────────────────────────────────────────────────

describe('ApiClient.executeQuestion', () => {
  it('makes a POST request with parameters in the body', async () => {
    mockFetch({ body: MOCK_QUERY_RESULT });
    const client = makeClient();
    const params = { date_from: '2024-01-01', limit: 100 };

    await client.executeQuestion('q-1', params);

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/embed/questions/q-1/execute');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(params);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('sends an empty object when no params are provided', async () => {
    mockFetch({ body: MOCK_QUERY_RESULT });
    const client = makeClient();

    await client.executeQuestion('q-1');

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({});
  });

  it('returns query result', async () => {
    mockFetch({ body: MOCK_QUERY_RESULT });
    const client = makeClient();

    const result = await client.executeQuestion('q-1');
    expect(result).toEqual(MOCK_QUERY_RESULT);
  });
});

// ── getEmbedToken ─────────────────────────────────────────────────────────────

describe('ApiClient.getEmbedToken', () => {
  it('POSTs to /api/embed/tokens and returns the token string', async () => {
    mockFetch({ body: { token: 'new-embed-token-xyz' } });
    const client = makeClient();

    const token = await client.getEmbedToken('dashboard', 'dash-1');

    expect(token).toBe('new-embed-token-xyz');
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://analytics.example.com/api/embed/tokens');
    expect(JSON.parse(init.body as string)).toEqual({
      entityType: 'dashboard',
      entityId: 'dash-1',
    });
  });
});

// ── Retry logic ───────────────────────────────────────────────────────────────

describe('ApiClient retry logic', () => {
  it('retries on 503 and succeeds on second attempt', async () => {
    mockFetchSequence([
      { status: 503, body: { message: 'Service unavailable', code: 'HTTP_503' } },
      { body: MOCK_DASHBOARD },
    ]);
    const client = makeClient({ maxRetries: 2, retryDelayMs: 1 });

    const result = await client.getDashboard('dash-1');

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual(MOCK_DASHBOARD);
  });

  it('retries on 500 up to maxRetries times then throws', async () => {
    mockFetchSequence([
      { status: 500, body: { message: 'Server error', code: 'HTTP_500' } },
      { status: 500, body: { message: 'Server error', code: 'HTTP_500' } },
      { status: 500, body: { message: 'Server error', code: 'HTTP_500' } },
    ]);
    const client = makeClient({ maxRetries: 2, retryDelayMs: 1 });

    await expect(client.getDashboard('dash-1')).rejects.toMatchObject({ status: 500 });
    expect(fetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('does not retry on 404 (non-retryable)', async () => {
    mockFetch({ status: 404, body: { message: 'Not found', code: 'NOT_FOUND' } });
    const client = makeClient({ maxRetries: 3, retryDelayMs: 1 });

    await expect(client.getDashboard('missing')).rejects.toMatchObject({ status: 404 });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('does not retry on 401 (non-retryable)', async () => {
    mockFetch({ status: 401, body: { message: 'Unauthorized' } });
    const client = makeClient({ maxRetries: 3, retryDelayMs: 1 });

    await expect(client.getDashboard('dash-1')).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('retries on network errors', async () => {
    mockFetchSequence([new TypeError('Failed to fetch'), { body: MOCK_DASHBOARD }]);
    const client = makeClient({ maxRetries: 2, retryDelayMs: 1 });

    const result = await client.getDashboard('dash-1');

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual(MOCK_DASHBOARD);
  });
});

// ── Request cancellation ──────────────────────────────────────────────────────

describe('ApiClient cancellation', () => {
  it('cancelAll() aborts in-flight requests', async () => {
    // Use a never-resolving fetch to simulate an in-flight request
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }),
      ),
    );

    const client = makeClient();
    const promise = client.getDashboard('dash-1');
    client.cancelAll();

    await expect(promise).rejects.toThrow(DOMException);
  });

  it('respects a caller-provided AbortSignal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }),
      ),
    );

    const client = makeClient();
    const controller = new AbortController();
    const promise = client.getDashboard('dash-1', { signal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('immediately rejects if signal is already aborted', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const client = makeClient();
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.getDashboard('dash-1', { signal: controller.signal }),
    ).rejects.toThrow();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ── Error classes ─────────────────────────────────────────────────────────────

describe('Error classes', () => {
  it('ApiError has correct name, status and code', () => {
    const err = new ApiError('Not found', 404, 'NOT_FOUND', { id: '1' });
    expect(err.name).toBe('ApiError');
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.details).toEqual({ id: '1' });
    expect(err instanceof Error).toBe(true);
  });

  it('NetworkError has correct name', () => {
    const cause = new TypeError('failed');
    const err = new NetworkError('Network request failed: failed', cause);
    expect(err.name).toBe('NetworkError');
    expect(err.cause).toBe(cause);
    expect(err instanceof Error).toBe(true);
  });

  it('TimeoutError has correct name and includes timeout ms', () => {
    const err = new TimeoutError(5000);
    expect(err.name).toBe('TimeoutError');
    expect(err.message).toContain('5000');
    expect(err instanceof Error).toBe(true);
  });
});

// ── Base URL normalisation ────────────────────────────────────────────────────

describe('ApiClient baseUrl normalisation', () => {
  it('strips trailing slash from baseUrl', async () => {
    mockFetch({ body: MOCK_DASHBOARD });
    const client = new ApiClient({
      baseUrl: 'https://analytics.example.com/',
      token: 'tok',
      maxRetries: 0,
    });

    await client.getDashboard('dash-1');

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).not.toContain('//api');
    expect(url).toBe('https://analytics.example.com/api/embed/dashboards/dash-1');
  });
});

// ── getDashboardCardResult ────────────────────────────────────────────────────

describe('ApiClient.getDashboardCardResult', () => {
  it('POSTs filters to the card query endpoint', async () => {
    mockFetch({ body: MOCK_QUERY_RESULT });
    const client = makeClient();
    const filters = { region: 'US', year: 2024 };

    const result = await client.getDashboardCardResult('dash-1', 'card-1', filters);

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/embed/dashboards/dash-1/cards/card-1/query');
    expect(JSON.parse(init.body as string)).toEqual(filters);
    expect(result).toEqual(MOCK_QUERY_RESULT);
  });
});
