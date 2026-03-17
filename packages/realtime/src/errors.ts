import { MeridianError } from '@meridian/shared';

/**
 * WebSocket authentication failure
 */
export class WSAuthenticationError extends MeridianError {
  constructor(message: string = 'WebSocket authentication failed', details?: Record<string, unknown>) {
    super(message, 'ERR_WS_AUTHENTICATION', 401, details);
    this.name = 'WSAuthenticationError';
  }
}

/**
 * WebSocket message validation failure
 */
export class WSMessageValidationError extends MeridianError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'ERR_WS_MESSAGE_VALIDATION', 400, details);
    this.name = 'WSMessageValidationError';
  }
}

/**
 * WebSocket channel not found
 */
export class WSChannelError extends MeridianError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'ERR_WS_CHANNEL', 400, details);
    this.name = 'WSChannelError';
  }
}

/**
 * Client not found in registry
 */
export class WSClientNotFoundError extends MeridianError {
  constructor(clientId: string) {
    super(`WebSocket client '${clientId}' not found`, 'ERR_WS_CLIENT_NOT_FOUND', 404);
    this.name = 'WSClientNotFoundError';
  }
}

/**
 * WebSocket serialization failure
 */
export class WSSerializationError extends MeridianError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'ERR_WS_SERIALIZATION', 500, details);
    this.name = 'WSSerializationError';
  }
}
