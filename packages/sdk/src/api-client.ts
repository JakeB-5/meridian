// Fetch-based HTTP client for the Meridian embed SDK

import type { QueryResult } from '@meridian/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  cards: DashboardCard[];
  filters: DashboardFilterDef[];
  createdAt: string;
  updatedAt: string;
}

export interface DashboardCard {
  id: string;
  questionId?: string;
  title?: string;
  position: { x: number; y: number; w: number; h: number };
}

export interface DashboardFilterDef {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'select';
  defaultValue?: unknown;
}

export interface Question {
  id: string;
  name: string;
  description?: string;
  queryType: 'sql' | 'visual';
  sql?: string;
  visualQuery?: Record<string, unknown>;
  visualization?: Record<string, unknown>;
  dataSourceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiClientOptions {
  /** Base URL of the Meridian API server (no trailing slash) */
  baseUrl: string;
  /** Embed token used to authenticate requests */
  token: string;
  /** Maximum number of retry attempts for transient errors (default: 3) */
  maxRetries?: number;
  /** Initial retry backoff in ms (default: 300, doubled on each attempt) */
  retryDelayMs?: number;
  /** Request timeout in ms (default: 30_000) */
  timeoutMs?: number;
}

export interface RequestOptions {
  signal?: AbortSignal;
  params?: Record<string, unknown>;
}

// ── Error types ───────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

// ── Retry helpers ─────────────────────────────────────────────────────────────

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) {
    return RETRYABLE_STATUS_CODES.has(error.status);
  }
  if (error instanceof NetworkError) return true;
  if (error instanceof TimeoutError) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── ApiClient ─────────────────────────────────────────────────────────────────

/**
 * Fetch-based HTTP client for the Meridian embed API.
 * Supports retry with exponential backoff and per-request AbortController.
 */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly timeoutMs: number;

  // Tracks in-flight AbortControllers for cleanup
  private readonly activeControllers = new Set<AbortController>();

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.token = options.token;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 300;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Fetch dashboard metadata by ID.
   */
  async getDashboard(id: string, opts?: RequestOptions): Promise<Dashboard> {
    return this.get<Dashboard>(`/api/embed/dashboards/${encodeURIComponent(id)}`, opts);
  }

  /**
   * Fetch question metadata by ID.
   */
  async getQuestion(id: string, opts?: RequestOptions): Promise<Question> {
    return this.get<Question>(`/api/embed/questions/${encodeURIComponent(id)}`, opts);
  }

  /**
   * Execute a question and return the result set.
   */
  async executeQuestion(
    id: string,
    params?: Record<string, unknown>,
    opts?: RequestOptions,
  ): Promise<QueryResult> {
    return this.post<QueryResult>(
      `/api/embed/questions/${encodeURIComponent(id)}/execute`,
      params ?? {},
      opts,
    );
  }

  /**
   * Request a short-lived embed token for a specific entity.
   */
  async getEmbedToken(
    entityType: 'dashboard' | 'question',
    entityId: string,
    opts?: RequestOptions,
  ): Promise<string> {
    const response = await this.post<{ token: string }>(
      `/api/embed/tokens`,
      { entityType, entityId },
      opts,
    );
    return response.token;
  }

  /**
   * Execute a dashboard filter query — applies filters and returns per-card results.
   */
  async getDashboardCardResult(
    dashboardId: string,
    cardId: string,
    filters?: Record<string, unknown>,
    opts?: RequestOptions,
  ): Promise<QueryResult> {
    return this.post<QueryResult>(
      `/api/embed/dashboards/${encodeURIComponent(dashboardId)}/cards/${encodeURIComponent(cardId)}/query`,
      filters ?? {},
      opts,
    );
  }

  /**
   * Cancel all pending requests managed by this client.
   */
  cancelAll(): void {
    for (const controller of this.activeControllers) {
      controller.abort();
    }
    this.activeControllers.clear();
  }

  // ── Private request helpers ────────────────────────────────────────────────

  private async get<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, undefined, opts);
  }

  private async post<T>(path: string, body: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, body, opts);
  }

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    opts?: RequestOptions,
  ): Promise<T> {
    let attempt = 0;
    let delay = this.retryDelayMs;

    while (true) {
      try {
        return await this.doRequest<T>(method, path, body, opts);
      } catch (error) {
        attempt += 1;
        if (attempt > this.maxRetries || !isRetryable(error)) {
          throw error;
        }
        await sleep(delay);
        delay *= 2; // Exponential backoff
      }
    }
  }

  private async doRequest<T>(
    method: string,
    path: string,
    body: unknown,
    opts?: RequestOptions,
  ): Promise<T> {
    // Create a combined AbortController that merges the caller's signal + timeout
    const controller = new AbortController();
    this.activeControllers.add(controller);

    const timeoutId = setTimeout(() => {
      controller.abort(new TimeoutError(this.timeoutMs));
    }, this.timeoutMs);

    // If the caller supplied a signal, propagate abort to our controller
    const callerSignal = opts?.signal;
    const onCallerAbort = (): void => controller.abort(callerSignal?.reason);
    if (callerSignal) {
      if (callerSignal.aborted) {
        clearTimeout(timeoutId);
        this.activeControllers.delete(controller);
        throw new DOMException('Request was aborted', 'AbortError');
      }
      callerSignal.addEventListener('abort', onCallerAbort);
    }

    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      return await this.handleResponse<T>(response);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // Check if timeout was the cause
        if (controller.signal.reason instanceof TimeoutError) {
          throw new TimeoutError(this.timeoutMs);
        }
        throw error;
      }
      if (error instanceof ApiError || error instanceof TimeoutError) {
        throw error;
      }
      throw new NetworkError(
        `Network request failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    } finally {
      clearTimeout(timeoutId);
      callerSignal?.removeEventListener('abort', onCallerAbort);
      this.activeControllers.delete(controller);
    }
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (response.ok) {
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        return response.json() as Promise<T>;
      }
      // Non-JSON 2xx — return empty object (shouldn't normally happen)
      return {} as T;
    }

    // Parse error body when available
    let errorBody: { message?: string; code?: string; details?: unknown } = {};
    try {
      const ct = response.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        errorBody = (await response.json()) as typeof errorBody;
      }
    } catch {
      // Ignore parse failures
    }

    const message =
      errorBody.message ?? `Request failed with status ${response.status}`;
    const code = errorBody.code ?? `HTTP_${response.status}`;

    throw new ApiError(message, response.status, code, errorBody.details);
  }
}
