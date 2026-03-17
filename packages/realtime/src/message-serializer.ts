import type { WSMessage } from '@meridian/shared';
import type { Result } from '@meridian/shared';
import { ok, err } from '@meridian/shared';
import { WSSerializationError } from './errors.js';

// ── Serialization ────────────────────────────────────────────────────

/**
 * Serialize a WSMessage to a JSON string for transmission over WebSocket.
 * Throws WSSerializationError if the message cannot be serialized.
 */
export function serialize(msg: WSMessage): string {
  try {
    return JSON.stringify(msg);
  } catch (error) {
    throw new WSSerializationError(
      `Failed to serialize WebSocket message of type '${msg.type}'`,
      { originalError: error instanceof Error ? error.message : String(error) },
    );
  }
}

/**
 * Deserialize a raw string/Buffer from WebSocket into a typed WSMessage.
 * Returns a Result to avoid throwing on malformed input.
 */
export function deserialize(data: unknown): Result<WSMessage> {
  // Normalize to string
  let raw: string;
  if (typeof data === 'string') {
    raw = data;
  } else if (Buffer.isBuffer(data)) {
    raw = data.toString('utf-8');
  } else if (data instanceof ArrayBuffer) {
    raw = Buffer.from(data).toString('utf-8');
  } else if (Array.isArray(data)) {
    // ws library may deliver data as Buffer[]
    raw = Buffer.concat(data as Buffer[]).toString('utf-8');
  } else {
    return err(
      new WSSerializationError('Cannot deserialize WebSocket data: unsupported data type', {
        type: typeof data,
      }),
    );
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return err(
      new WSSerializationError('Cannot deserialize WebSocket data: invalid JSON', {
        raw: raw.slice(0, 200),
      }),
    );
  }

  // Basic structural validation
  if (typeof parsed !== 'object' || parsed === null) {
    return err(
      new WSSerializationError('Cannot deserialize WebSocket data: expected JSON object', {
        received: typeof parsed,
      }),
    );
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj['type'] !== 'string') {
    return err(
      new WSSerializationError("WebSocket message missing required field 'type'", {
        received: obj,
      }),
    );
  }

  if (typeof obj['id'] !== 'string') {
    return err(
      new WSSerializationError("WebSocket message missing required field 'id'", {
        received: obj,
      }),
    );
  }

  if (typeof obj['timestamp'] !== 'number') {
    return err(
      new WSSerializationError("WebSocket message missing required field 'timestamp'", {
        received: obj,
      }),
    );
  }

  // Cast to WSMessage — channel and payload are optional
  const msg: WSMessage = {
    type: obj['type'] as WSMessage['type'],
    id: obj['id'] as string,
    timestamp: obj['timestamp'] as number,
    channel: typeof obj['channel'] === 'string' ? obj['channel'] : undefined,
    payload: obj['payload'],
  };

  return ok(msg);
}

/**
 * Create a new WSMessage with the given type and payload.
 * Automatically fills in id and timestamp.
 */
export function createMessage<T = unknown>(
  type: WSMessage['type'],
  options: {
    channel?: string;
    payload?: T;
  } = {},
): WSMessage<T> {
  return {
    type,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    channel: options.channel,
    payload: options.payload,
  };
}

/**
 * Create an error message to send to a client.
 */
export function createErrorMessage(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): WSMessage<{ code: string; message: string; details?: Record<string, unknown> }> {
  return createMessage('error', {
    payload: { code, message, details },
  });
}

/**
 * Create a pong response for a ping message.
 */
export function createPongMessage(pingId: string): WSMessage {
  return createMessage('pong', {
    payload: { pingId },
  });
}
