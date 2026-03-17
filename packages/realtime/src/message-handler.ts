import { z } from 'zod';
import type { WSMessage } from '@meridian/shared';
import type { Logger } from '@meridian/shared';
import { createNoopLogger } from '@meridian/shared';
import { deserialize, createMessage, createErrorMessage, createPongMessage } from './message-serializer.js';
import { isValidChannel } from './channel-manager.js';
import { WSMessageValidationError } from './errors.js';
import type { ChannelManager } from './channel-manager.js';
import type { ClientRegistry } from './client-registry.js';

// ── Zod Schemas ───────────────────────────────────────────────────────

const WSMessageTypeSchema = z.enum([
  'subscribe',
  'unsubscribe',
  'data_update',
  'error',
  'ping',
  'pong',
  'auth',
]);

const BaseMessageSchema = z.object({
  type: WSMessageTypeSchema,
  id: z.string().min(1),
  timestamp: z.number().int().positive(),
  channel: z.string().optional(),
  payload: z.unknown().optional(),
});

const SubscribeMessageSchema = BaseMessageSchema.extend({
  type: z.literal('subscribe'),
  channel: z.string().min(1, 'Channel is required for subscribe'),
});

const UnsubscribeMessageSchema = BaseMessageSchema.extend({
  type: z.literal('unsubscribe'),
  channel: z.string().min(1, 'Channel is required for unsubscribe'),
});

const PingMessageSchema = BaseMessageSchema.extend({
  type: z.literal('ping'),
});

const AuthMessageSchema = BaseMessageSchema.extend({
  type: z.literal('auth'),
  payload: z.object({
    token: z.string().min(1, 'Token is required for auth'),
  }),
});

// ── Handler Result ────────────────────────────────────────────────────

export type MessageHandlerResult =
  | { handled: true; reply?: WSMessage }
  | { handled: false; error: WSMessageValidationError };

// ── Handler Context ───────────────────────────────────────────────────

export interface MessageHandlerContext {
  clientId: string;
  channelManager: ChannelManager;
  clientRegistry: ClientRegistry;
  logger?: Logger;
  /** Optional callback for auth token refresh */
  onAuthRefresh?: (clientId: string, token: string) => Promise<{ userId: string } | null>;
}

// ── MessageHandler ────────────────────────────────────────────────────

/**
 * Validates and routes incoming WebSocket messages to the appropriate handler.
 *
 * Responsibilities:
 *   - Deserialize raw data
 *   - Validate message shape with Zod
 *   - Dispatch to specific handler by message type
 *   - Return optional reply messages
 */
export class MessageHandler {
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? createNoopLogger();
  }

  /**
   * Handle a raw incoming WebSocket message.
   * Deserializes, validates, and dispatches to the appropriate sub-handler.
   */
  async handle(rawData: unknown, ctx: MessageHandlerContext): Promise<MessageHandlerResult> {
    // Step 1: deserialize
    const deserializeResult = deserialize(rawData);
    if (!deserializeResult.ok) {
      this.logger.warn('Failed to deserialize WS message', {
        clientId: ctx.clientId,
        error: deserializeResult.error.message,
      });
      return {
        handled: false,
        error: new WSMessageValidationError(deserializeResult.error.message),
      };
    }

    const msg = deserializeResult.value;

    // Step 2: base schema validation
    const baseValidation = BaseMessageSchema.safeParse(msg);
    if (!baseValidation.success) {
      const issues = baseValidation.error.issues.map((i) => i.message).join(', ');
      this.logger.warn('WS message failed base validation', {
        clientId: ctx.clientId,
        issues,
      });
      return {
        handled: false,
        error: new WSMessageValidationError(`Message validation failed: ${issues}`, {
          issues: baseValidation.error.issues,
        }),
      };
    }

    // Step 3: dispatch by type
    ctx.clientRegistry.touch(ctx.clientId);

    switch (msg.type) {
      case 'subscribe':
        return this.handleSubscribe(msg, ctx);
      case 'unsubscribe':
        return this.handleUnsubscribe(msg, ctx);
      case 'ping':
        return this.handlePing(msg, ctx);
      case 'pong':
        return this.handlePong(msg, ctx);
      case 'auth':
        return this.handleAuth(msg, ctx);
      case 'data_update':
        // data_update is server-to-client only; clients should not send it
        this.logger.warn('Client sent data_update message (ignored)', { clientId: ctx.clientId });
        return {
          handled: false,
          error: new WSMessageValidationError(
            "Message type 'data_update' is reserved for server use",
          ),
        };
      case 'error':
        // error is server-to-client only
        this.logger.warn('Client sent error message (ignored)', { clientId: ctx.clientId });
        return {
          handled: false,
          error: new WSMessageValidationError("Message type 'error' is reserved for server use"),
        };
      default:
        this.logger.warn('Unknown WS message type', { clientId: ctx.clientId, type: msg.type });
        return {
          handled: false,
          error: new WSMessageValidationError(`Unknown message type: '${String(msg.type)}'`),
        };
    }
  }

  // ── Subscribe ─────────────────────────────────────────────────────

  private handleSubscribe(msg: WSMessage, ctx: MessageHandlerContext): MessageHandlerResult {
    const validation = SubscribeMessageSchema.safeParse(msg);
    if (!validation.success) {
      const issues = validation.error.issues.map((i) => i.message).join(', ');
      return {
        handled: false,
        error: new WSMessageValidationError(`Subscribe message invalid: ${issues}`),
      };
    }

    const channel = validation.data.channel;

    if (!isValidChannel(channel)) {
      return {
        handled: false,
        error: new WSMessageValidationError(
          `Invalid channel name: '${channel}'. Expected format: prefix:id`,
          { channel },
        ),
      };
    }

    try {
      ctx.channelManager.subscribe(ctx.clientId, channel);
      this.logger.debug('Client subscribed to channel', {
        clientId: ctx.clientId,
        channel,
      });

      const reply = createMessage<{ channel: string; subscribed: true }>('data_update', {
        channel,
        payload: { channel, subscribed: true },
      });

      return { handled: true, reply };
    } catch (error) {
      return {
        handled: false,
        error: new WSMessageValidationError(
          error instanceof Error ? error.message : 'Subscribe failed',
        ),
      };
    }
  }

  // ── Unsubscribe ───────────────────────────────────────────────────

  private handleUnsubscribe(msg: WSMessage, ctx: MessageHandlerContext): MessageHandlerResult {
    const validation = UnsubscribeMessageSchema.safeParse(msg);
    if (!validation.success) {
      const issues = validation.error.issues.map((i) => i.message).join(', ');
      return {
        handled: false,
        error: new WSMessageValidationError(`Unsubscribe message invalid: ${issues}`),
      };
    }

    const channel = validation.data.channel;

    ctx.channelManager.unsubscribe(ctx.clientId, channel);
    this.logger.debug('Client unsubscribed from channel', {
      clientId: ctx.clientId,
      channel,
    });

    const reply = createMessage<{ channel: string; subscribed: false }>('data_update', {
      channel,
      payload: { channel, subscribed: false },
    });

    return { handled: true, reply };
  }

  // ── Ping ──────────────────────────────────────────────────────────

  private handlePing(msg: WSMessage, ctx: MessageHandlerContext): MessageHandlerResult {
    const validation = PingMessageSchema.safeParse(msg);
    if (!validation.success) {
      return {
        handled: false,
        error: new WSMessageValidationError('Ping message invalid'),
      };
    }

    ctx.clientRegistry.markAlive(ctx.clientId);
    this.logger.debug('Received ping from client', { clientId: ctx.clientId });

    const reply = createPongMessage(msg.id);
    return { handled: true, reply };
  }

  // ── Pong ──────────────────────────────────────────────────────────

  private handlePong(_msg: WSMessage, ctx: MessageHandlerContext): MessageHandlerResult {
    ctx.clientRegistry.markAlive(ctx.clientId);
    this.logger.debug('Received pong from client', { clientId: ctx.clientId });
    return { handled: true };
  }

  // ── Auth (token refresh) ──────────────────────────────────────────

  private async handleAuth(msg: WSMessage, ctx: MessageHandlerContext): Promise<MessageHandlerResult> {
    const validation = AuthMessageSchema.safeParse(msg);
    if (!validation.success) {
      const issues = validation.error.issues.map((i) => i.message).join(', ');
      return {
        handled: false,
        error: new WSMessageValidationError(`Auth message invalid: ${issues}`),
      };
    }

    const { token } = validation.data.payload;

    if (!ctx.onAuthRefresh) {
      this.logger.warn('Auth refresh received but no handler registered', {
        clientId: ctx.clientId,
      });
      return {
        handled: false,
        error: new WSMessageValidationError('Token refresh not supported'),
      };
    }

    try {
      const result = await ctx.onAuthRefresh(ctx.clientId, token);
      if (!result) {
        this.logger.warn('Auth token refresh failed', { clientId: ctx.clientId });
        const reply = createErrorMessage('ERR_WS_AUTHENTICATION', 'Token refresh failed');
        return { handled: true, reply };
      }

      this.logger.info('Auth token refreshed for client', {
        clientId: ctx.clientId,
        userId: result.userId,
      });

      const reply = createMessage<{ refreshed: true; userId: string }>('auth', {
        payload: { refreshed: true, userId: result.userId },
      });
      return { handled: true, reply };
    } catch (error) {
      this.logger.error('Auth token refresh threw an error', {
        clientId: ctx.clientId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        handled: false,
        error: new WSMessageValidationError('Token refresh failed unexpectedly'),
      };
    }
  }
}

// ── Validation Helpers (exported for testing) ─────────────────────────

export { SubscribeMessageSchema, UnsubscribeMessageSchema, PingMessageSchema, AuthMessageSchema };
