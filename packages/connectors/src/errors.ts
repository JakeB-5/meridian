// ── Connector Error Classes ─────────────────────────────────────────
// Specialized error classes for connector operations, all extending MeridianError.

import { MeridianError, ConnectionError, QueryExecutionError } from '@meridian/shared';
import { CONNECTOR_ERROR_CODES } from './types.js';
import type { ConnectorErrorCode, DatabaseType } from './types.js';

// ── Base Connector Error ────────────────────────────────────────────

/**
 * Base error for all connector-related failures.
 * Includes connector type and optional original error for debugging.
 */
export class ConnectorError extends MeridianError {
  public readonly connectorType?: DatabaseType;
  public readonly originalError?: Error;

  constructor(
    message: string,
    code: ConnectorErrorCode,
    statusCode: number = 500,
    options?: {
      connectorType?: DatabaseType;
      originalError?: Error;
      details?: Record<string, unknown>;
    },
  ) {
    super(message, code, statusCode, {
      ...options?.details,
      connectorType: options?.connectorType,
      originalErrorMessage: options?.originalError?.message,
    });
    this.name = 'ConnectorError';
    this.connectorType = options?.connectorType;
    this.originalError = options?.originalError;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── Connection Errors ───────────────────────────────────────────────

/**
 * Failed to establish a database connection.
 */
export class ConnectorConnectionError extends ConnectionError {
  public readonly connectorType?: DatabaseType;
  public readonly originalError?: Error;

  constructor(
    message: string,
    options?: {
      connectorType?: DatabaseType;
      originalError?: Error;
      details?: Record<string, unknown>;
    },
  ) {
    super(`Connection failed: ${message}`, {
      ...options?.details,
      connectorType: options?.connectorType,
      originalErrorMessage: options?.originalError?.message,
      connectorErrorCode: CONNECTOR_ERROR_CODES.CONNECTION_FAILED,
    });
    this.name = 'ConnectorConnectionError';
    this.connectorType = options?.connectorType;
    this.originalError = options?.originalError;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Connection timed out.
 */
export class ConnectorConnectionTimeoutError extends ConnectionError {
  public readonly connectorType?: DatabaseType;
  public readonly timeoutMs: number;

  constructor(
    timeoutMs: number,
    options?: {
      connectorType?: DatabaseType;
      details?: Record<string, unknown>;
    },
  ) {
    super(`Connection timed out after ${timeoutMs}ms`, {
      ...options?.details,
      connectorType: options?.connectorType,
      timeoutMs,
      connectorErrorCode: CONNECTOR_ERROR_CODES.CONNECTION_TIMEOUT,
    });
    this.name = 'ConnectorConnectionTimeoutError';
    this.connectorType = options?.connectorType;
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── Query Errors ────────────────────────────────────────────────────

/**
 * Query execution failed.
 */
export class ConnectorQueryError extends QueryExecutionError {
  public readonly connectorType?: DatabaseType;
  public readonly originalError?: Error;
  public readonly sql?: string;

  constructor(
    message: string,
    options?: {
      connectorType?: DatabaseType;
      originalError?: Error;
      sql?: string;
      details?: Record<string, unknown>;
    },
  ) {
    super(`Query execution failed: ${message}`, {
      ...options?.details,
      connectorType: options?.connectorType,
      originalErrorMessage: options?.originalError?.message,
      connectorErrorCode: CONNECTOR_ERROR_CODES.QUERY_FAILED,
    });
    this.name = 'ConnectorQueryError';
    this.connectorType = options?.connectorType;
    this.originalError = options?.originalError;
    this.sql = options?.sql;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Query timed out.
 */
export class ConnectorQueryTimeoutError extends QueryExecutionError {
  public readonly connectorType?: DatabaseType;
  public readonly timeoutMs: number;
  public readonly sql?: string;

  constructor(
    timeoutMs: number,
    options?: {
      connectorType?: DatabaseType;
      sql?: string;
      details?: Record<string, unknown>;
    },
  ) {
    super(`Query timed out after ${timeoutMs}ms`, {
      ...options?.details,
      connectorType: options?.connectorType,
      timeoutMs,
      connectorErrorCode: CONNECTOR_ERROR_CODES.QUERY_TIMEOUT,
    });
    this.name = 'ConnectorQueryTimeoutError';
    this.connectorType = options?.connectorType;
    this.timeoutMs = timeoutMs;
    this.sql = options?.sql;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Query was explicitly cancelled.
 */
export class ConnectorQueryCancelledError extends QueryExecutionError {
  public readonly connectorType?: DatabaseType;
  public readonly queryId: string;

  constructor(
    queryId: string,
    options?: {
      connectorType?: DatabaseType;
      details?: Record<string, unknown>;
    },
  ) {
    super(`Query '${queryId}' was cancelled`, {
      ...options?.details,
      connectorType: options?.connectorType,
      queryId,
      connectorErrorCode: CONNECTOR_ERROR_CODES.QUERY_CANCELLED,
    });
    this.name = 'ConnectorQueryCancelledError';
    this.connectorType = options?.connectorType;
    this.queryId = queryId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── Schema Errors ───────────────────────────────────────────────────

/**
 * Failed to fetch schema metadata.
 */
export class ConnectorSchemaError extends ConnectorError {
  constructor(
    message: string,
    options?: {
      connectorType?: DatabaseType;
      originalError?: Error;
      details?: Record<string, unknown>;
    },
  ) {
    super(
      `Schema introspection failed: ${message}`,
      CONNECTOR_ERROR_CODES.SCHEMA_FETCH_FAILED,
      500,
      options,
    );
    this.name = 'ConnectorSchemaError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── State Errors ────────────────────────────────────────────────────

/**
 * Connector is not connected when an operation requires a connection.
 */
export class ConnectorNotConnectedError extends ConnectorError {
  constructor(
    connectorType?: DatabaseType,
    details?: Record<string, unknown>,
  ) {
    super(
      'Connector is not connected. Call connect() first.',
      CONNECTOR_ERROR_CODES.NOT_CONNECTED,
      503,
      { connectorType, details },
    );
    this.name = 'ConnectorNotConnectedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Connector is already connected.
 */
export class ConnectorAlreadyConnectedError extends ConnectorError {
  constructor(
    connectorType?: DatabaseType,
    details?: Record<string, unknown>,
  ) {
    super(
      'Connector is already connected. Call disconnect() first to reconnect.',
      CONNECTOR_ERROR_CODES.ALREADY_CONNECTED,
      409,
      { connectorType, details },
    );
    this.name = 'ConnectorAlreadyConnectedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── Not Implemented ─────────────────────────────────────────────────

/**
 * Feature is not implemented (for stub connectors).
 */
export class ConnectorNotImplementedError extends ConnectorError {
  constructor(
    feature: string,
    connectorType?: DatabaseType,
  ) {
    super(
      `${feature} is not implemented for ${connectorType ?? 'this connector'}`,
      CONNECTOR_ERROR_CODES.NOT_IMPLEMENTED,
      501,
      { connectorType },
    );
    this.name = 'ConnectorNotImplementedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── Configuration Errors ────────────────────────────────────────────

/**
 * Invalid connector configuration.
 */
export class ConnectorConfigError extends ConnectorError {
  constructor(
    message: string,
    connectorType?: DatabaseType,
    details?: Record<string, unknown>,
  ) {
    super(
      `Invalid configuration: ${message}`,
      CONNECTOR_ERROR_CODES.INVALID_CONFIG,
      400,
      { connectorType, details },
    );
    this.name = 'ConnectorConfigError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── Pool Errors ─────────────────────────────────────────────────────

/**
 * Connection pool is exhausted (all connections busy, none available).
 */
export class ConnectorPoolExhaustedError extends ConnectorError {
  constructor(
    connectorType?: DatabaseType,
    details?: Record<string, unknown>,
  ) {
    super(
      'Connection pool exhausted — all connections are in use',
      CONNECTOR_ERROR_CODES.POOL_EXHAUSTED,
      503,
      { connectorType, details },
    );
    this.name = 'ConnectorPoolExhaustedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Timed out waiting for a connection from the pool.
 */
export class ConnectorPoolTimeoutError extends ConnectorError {
  public readonly timeoutMs: number;

  constructor(
    timeoutMs: number,
    connectorType?: DatabaseType,
    details?: Record<string, unknown>,
  ) {
    super(
      `Timed out waiting for pool connection after ${timeoutMs}ms`,
      CONNECTOR_ERROR_CODES.POOL_TIMEOUT,
      503,
      { connectorType, details: { ...details, timeoutMs } },
    );
    this.name = 'ConnectorPoolTimeoutError';
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── Error Normalization Helper ──────────────────────────────────────

/**
 * Normalize an unknown error into a ConnectorError.
 * If the error is already a MeridianError, it is returned as-is.
 * Otherwise it's wrapped in a ConnectorError with the original attached.
 */
export function normalizeConnectorError(
  error: unknown,
  connectorType?: DatabaseType,
  context?: string,
): MeridianError {
  if (error instanceof MeridianError) {
    return error;
  }

  const originalError = error instanceof Error ? error : new Error(String(error));
  const prefix = context ? `${context}: ` : '';

  return new ConnectorError(
    `${prefix}${originalError.message}`,
    CONNECTOR_ERROR_CODES.DRIVER_ERROR,
    500,
    {
      connectorType,
      originalError,
      details: {
        stack: originalError.stack,
      },
    },
  );
}
