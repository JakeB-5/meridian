import { API_BASE_URL, STORAGE_KEYS } from '@/lib/constants';
import type { ApiError } from './types';

// ── API Error class ──────────────────────────────────────────────────

export class ApiRequestError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'ApiRequestError';
    this.code = error.code;
    this.statusCode = error.statusCode;
    this.details = error.details;
  }
}

// ── Request configuration ────────────────────────────────────────────

interface RequestConfig extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
  skipAuth?: boolean;
}

// ── Token refresh state ──────────────────────────────────────────────

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const newAccessToken = data.data?.tokens?.accessToken ?? data.tokens?.accessToken;
    const newRefreshToken = data.data?.tokens?.refreshToken ?? data.tokens?.refreshToken;

    if (newAccessToken) {
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, newAccessToken);
      if (newRefreshToken) {
        localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, newRefreshToken);
      }
      return newAccessToken;
    }
    return null;
  } catch {
    return null;
  }
}

async function getValidToken(): Promise<string | null> {
  const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  return token;
}

// ── Core request function ────────────────────────────────────────────

async function request<T>(
  path: string,
  config: RequestConfig = {},
): Promise<T> {
  const { body, params, skipAuth, ...init } = config;

  // Build URL with query params
  let url = `${API_BASE_URL}${path}`;
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value));
      }
    }
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  // Build headers
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  // Inject auth token
  if (!skipAuth) {
    const token = await getValidToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const response = await fetch(url, {
    ...init,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Handle 401 with token refresh
  if (response.status === 401 && !skipAuth) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }

    const newToken = await refreshPromise;
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      const retryResponse = await fetch(url, {
        ...init,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (!retryResponse.ok) {
        return handleErrorResponse(retryResponse);
      }

      if (retryResponse.status === 204) return undefined as T;
      const retryData = await retryResponse.json();
      return (retryData.data !== undefined ? retryData.data : retryData) as T;
    }

    // Refresh failed — clear auth state and redirect to login
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    window.location.href = '/login';
    throw new ApiRequestError({
      code: 'UNAUTHORIZED',
      message: 'Session expired. Please log in again.',
      statusCode: 401,
    });
  }

  if (!response.ok) {
    return handleErrorResponse(response);
  }

  // 204 No Content
  if (response.status === 204) return undefined as T;

  const data = await response.json();
  return (data.data !== undefined ? data.data : data) as T;
}

async function handleErrorResponse(response: Response): Promise<never> {
  let errorBody: ApiError;
  try {
    const json = await response.json();
    errorBody = {
      code: json.code ?? json.error ?? 'UNKNOWN_ERROR',
      message: json.message ?? json.error ?? `Request failed with status ${response.status}`,
      details: json.details,
      statusCode: response.status,
    };
  } catch {
    errorBody = {
      code: 'UNKNOWN_ERROR',
      message: `Request failed with status ${response.status}`,
      statusCode: response.status,
    };
  }
  throw new ApiRequestError(errorBody);
}

// ── Public API client ────────────────────────────────────────────────

export const apiClient = {
  get: <T>(path: string, config?: RequestConfig) =>
    request<T>(path, { ...config, method: 'GET' }),

  post: <T>(path: string, body?: unknown, config?: RequestConfig) =>
    request<T>(path, { ...config, method: 'POST', body }),

  put: <T>(path: string, body?: unknown, config?: RequestConfig) =>
    request<T>(path, { ...config, method: 'PUT', body }),

  patch: <T>(path: string, body?: unknown, config?: RequestConfig) =>
    request<T>(path, { ...config, method: 'PATCH', body }),

  delete: <T = void>(path: string, config?: RequestConfig) =>
    request<T>(path, { ...config, method: 'DELETE' }),
};
