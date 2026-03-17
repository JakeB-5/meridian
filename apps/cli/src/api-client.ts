// HTTP client for the Meridian CLI — wraps fetch with config-based base URL and auth token.

import type { CliConfig } from './config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiError {
  message: string;
  code?: string;
  statusCode: number;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface RequestOptions {
  /** Additional headers */
  headers?: Record<string, string>;
  /** Request body (will be JSON-serialized) */
  body?: unknown;
  /** Query string parameters */
  params?: Record<string, string | number | boolean | undefined>;
  /** Override timeout in ms */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class ApiClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;

  constructor(config: CliConfig) {
    this.baseUrl = config.serverUrl.replace(/\/$/, '');
    this.token = config.apiToken;
    this.timeoutMs = config.timeoutMs;
  }

  // ── GET ──────────────────────────────────────────────────────────

  async get<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('GET', endpoint, options);
  }

  // ── POST ─────────────────────────────────────────────────────────

  async post<T>(endpoint: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('POST', endpoint, { ...options, body });
  }

  // ── PUT ──────────────────────────────────────────────────────────

  async put<T>(endpoint: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('PUT', endpoint, { ...options, body });
  }

  // ── PATCH ────────────────────────────────────────────────────────

  async patch<T>(endpoint: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('PATCH', endpoint, { ...options, body });
  }

  // ── DELETE ───────────────────────────────────────────────────────

  async delete<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('DELETE', endpoint, options);
  }

  // ── Core request ─────────────────────────────────────────────────

  private async request<T>(
    method: string,
    endpoint: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const { headers = {}, body, params, timeoutMs } = options;

    // Build URL with query params
    const url = this.buildUrl(endpoint, params);

    // Build headers
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    };

    if (this.token) {
      reqHeaders['Authorization'] = `Bearer ${this.token}`;
    }

    // Abort controller for timeout
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      timeoutMs ?? this.timeoutMs,
    );

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: reqHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new ApiClientError(
          `Request timed out after ${timeoutMs ?? this.timeoutMs}ms`,
          408,
          'TIMEOUT',
        );
      }
      throw new ApiClientError(
        `Network error: ${(error as Error).message}`,
        0,
        'NETWORK_ERROR',
      );
    } finally {
      clearTimeout(timeout);
    }

    // Parse response
    const responseText = await response.text();
    let responseData: unknown;
    try {
      responseData = responseText.length > 0 ? JSON.parse(responseText) : null;
    } catch {
      responseData = responseText;
    }

    if (!response.ok) {
      const errorData = responseData as Partial<ApiError>;
      const message =
        typeof errorData?.message === 'string'
          ? errorData.message
          : `Request failed with status ${response.status}`;
      throw new ApiClientError(message, response.status, errorData?.code);
    }

    return responseData as T;
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private buildUrl(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): string {
    const base = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    if (!params || Object.keys(params).length === 0) {
      return base;
    }

    const url = new URL(base);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createApiClient(config: CliConfig): ApiClient {
  return new ApiClient(config);
}

/**
 * Format an API error for terminal display.
 */
export function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    const parts = [`Error (${error.statusCode}): ${error.message}`];
    if (error.code) parts.push(`Code: ${error.code}`);
    return parts.join('\n');
  }
  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }
  return `Unknown error: ${String(error)}`;
}
