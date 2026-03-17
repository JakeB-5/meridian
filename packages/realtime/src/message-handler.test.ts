import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageHandler } from './message-handler.js';
import { ChannelManager } from './channel-manager.js';
import { ClientRegistry } from './client-registry.js';
import { WSMessageValidationError } from './errors.js';
import type { WebSocket } from 'ws';
import type { MessageHandlerContext } from './message-handler.js';

// ── Helpers ───────────────────────────────────────────────────────────

function makeMockSocket(): WebSocket {
  return { readyState: 1, send: vi.fn() } as unknown as WebSocket;
}

function makeContext(overrides: Partial<MessageHandlerContext> = {}): MessageHandlerContext {
  const clientRegistry = new ClientRegistry();
  const ws = makeMockSocket();
  const clientId = clientRegistry.register(ws, {
    userId: 'user-1',
    ip: '127.0.0.1',
    userAgent: 'Test/1.0',
  });
  return {
    clientId,
    channelManager: new ChannelManager(),
    clientRegistry,
    ...overrides,
  };
}

function rawMessage(msg: Record<string, unknown>): string {
  return JSON.stringify(msg);
}

function validMessage(type: string, extra: Record<string, unknown> = {}): string {
  return rawMessage({
    type,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    ...extra,
  });
}

// ── MessageHandler ────────────────────────────────────────────────────

describe('MessageHandler', () => {
  let handler: MessageHandler;

  beforeEach(() => {
    handler = new MessageHandler();
  });

  // ── Bad / Malformed input ─────────────────────────────────────────

  describe('malformed input', () => {
    it('returns error result for non-JSON string', async () => {
      const ctx = makeContext();
      const result = await handler.handle('not-json!!!', ctx);
      expect(result.handled).toBe(false);
      expect((result as { handled: false; error: WSMessageValidationError }).error).toBeInstanceOf(
        WSMessageValidationError,
      );
    });

    it('returns error result for empty string', async () => {
      const ctx = makeContext();
      const result = await handler.handle('', ctx);
      expect(result.handled).toBe(false);
    });

    it('returns error result for JSON array (not object)', async () => {
      const ctx = makeContext();
      const result = await handler.handle(JSON.stringify([1, 2, 3]), ctx);
      expect(result.handled).toBe(false);
    });

    it('returns error result when type field is missing', async () => {
      const ctx = makeContext();
      const result = await handler.handle(
        rawMessage({ id: 'x', timestamp: Date.now() }),
        ctx,
      );
      expect(result.handled).toBe(false);
    });

    it('returns error result when id field is missing', async () => {
      const ctx = makeContext();
      const result = await handler.handle(
        rawMessage({ type: 'ping', timestamp: Date.now() }),
        ctx,
      );
      expect(result.handled).toBe(false);
    });

    it('returns error result when timestamp is missing', async () => {
      const ctx = makeContext();
      const result = await handler.handle(
        rawMessage({ type: 'ping', id: 'x' }),
        ctx,
      );
      expect(result.handled).toBe(false);
    });

    it('returns error result for unknown message type', async () => {
      const ctx = makeContext();
      const result = await handler.handle(
        validMessage('totally_unknown_type'),
        ctx,
      );
      expect(result.handled).toBe(false);
    });
  });

  // ── ping ──────────────────────────────────────────────────────────

  describe('ping', () => {
    it('handles ping and returns pong reply', async () => {
      const ctx = makeContext();
      const msg = validMessage('ping');
      const result = await handler.handle(msg, ctx);

      expect(result.handled).toBe(true);
      const reply = (result as { handled: true; reply?: unknown }).reply as Record<string, unknown>;
      expect(reply).toBeDefined();
      expect(reply['type']).toBe('pong');
    });

    it('marks client as alive on ping', async () => {
      const ctx = makeContext();
      ctx.clientRegistry.markDead(ctx.clientId);

      await handler.handle(validMessage('ping'), ctx);
      expect(ctx.clientRegistry.getMetadata(ctx.clientId).isAlive).toBe(true);
    });
  });

  // ── pong ──────────────────────────────────────────────────────────

  describe('pong', () => {
    it('handles pong without sending a reply', async () => {
      const ctx = makeContext();
      ctx.clientRegistry.markDead(ctx.clientId);

      const result = await handler.handle(validMessage('pong'), ctx);
      expect(result.handled).toBe(true);
      expect((result as { handled: true; reply?: unknown }).reply).toBeUndefined();
    });

    it('marks client alive on pong', async () => {
      const ctx = makeContext();
      ctx.clientRegistry.markDead(ctx.clientId);

      await handler.handle(validMessage('pong'), ctx);
      expect(ctx.clientRegistry.getMetadata(ctx.clientId).isAlive).toBe(true);
    });
  });

  // ── subscribe ─────────────────────────────────────────────────────

  describe('subscribe', () => {
    it('subscribes client to channel and returns ack reply', async () => {
      const ctx = makeContext();
      const result = await handler.handle(
        validMessage('subscribe', { channel: 'dashboard:d1' }),
        ctx,
      );

      expect(result.handled).toBe(true);
      expect(ctx.channelManager.isSubscribed(ctx.clientId, 'dashboard:d1')).toBe(true);
    });

    it('returns error for subscribe without channel', async () => {
      const ctx = makeContext();
      const result = await handler.handle(validMessage('subscribe'), ctx);
      expect(result.handled).toBe(false);
    });

    it('returns error for subscribe with invalid channel name', async () => {
      const ctx = makeContext();
      const result = await handler.handle(
        validMessage('subscribe', { channel: 'invalid-channel' }),
        ctx,
      );
      expect(result.handled).toBe(false);
    });

    it('returns error for subscribe with unknown prefix', async () => {
      const ctx = makeContext();
      const result = await handler.handle(
        validMessage('subscribe', { channel: 'badprefix:id123' }),
        ctx,
      );
      expect(result.handled).toBe(false);
    });

    it('reply payload contains channel and subscribed:true', async () => {
      const ctx = makeContext();
      const result = await handler.handle(
        validMessage('subscribe', { channel: 'question:q1' }),
        ctx,
      );

      expect(result.handled).toBe(true);
      const reply = (result as { handled: true; reply?: { payload?: unknown } }).reply;
      expect(reply).toBeDefined();
      const payload = reply!.payload as Record<string, unknown>;
      expect(payload['subscribed']).toBe(true);
      expect(payload['channel']).toBe('question:q1');
    });
  });

  // ── unsubscribe ───────────────────────────────────────────────────

  describe('unsubscribe', () => {
    it('unsubscribes client from channel', async () => {
      const ctx = makeContext();
      ctx.channelManager.subscribe(ctx.clientId, 'dashboard:d1');

      const result = await handler.handle(
        validMessage('unsubscribe', { channel: 'dashboard:d1' }),
        ctx,
      );

      expect(result.handled).toBe(true);
      expect(ctx.channelManager.isSubscribed(ctx.clientId, 'dashboard:d1')).toBe(false);
    });

    it('returns error for unsubscribe without channel', async () => {
      const ctx = makeContext();
      const result = await handler.handle(validMessage('unsubscribe'), ctx);
      expect(result.handled).toBe(false);
    });

    it('reply payload contains channel and subscribed:false', async () => {
      const ctx = makeContext();
      const result = await handler.handle(
        validMessage('unsubscribe', { channel: 'dashboard:d1' }),
        ctx,
      );

      expect(result.handled).toBe(true);
      const reply = (result as { handled: true; reply?: { payload?: unknown } }).reply;
      const payload = reply!.payload as Record<string, unknown>;
      expect(payload['subscribed']).toBe(false);
    });
  });

  // ── auth ──────────────────────────────────────────────────────────

  describe('auth', () => {
    it('returns error when no onAuthRefresh handler is set', async () => {
      const ctx = makeContext(); // no onAuthRefresh
      const result = await handler.handle(
        validMessage('auth', { payload: { token: 'tok123' } }),
        ctx,
      );
      expect(result.handled).toBe(false);
    });

    it('calls onAuthRefresh with clientId and token', async () => {
      const onAuthRefresh = vi.fn().mockResolvedValue({ userId: 'user-1' });
      const ctx = makeContext({ onAuthRefresh });

      await handler.handle(
        validMessage('auth', { payload: { token: 'fresh-token' } }),
        ctx,
      );

      expect(onAuthRefresh).toHaveBeenCalledWith(ctx.clientId, 'fresh-token');
    });

    it('returns success reply when token refresh succeeds', async () => {
      const onAuthRefresh = vi.fn().mockResolvedValue({ userId: 'user-1' });
      const ctx = makeContext({ onAuthRefresh });

      const result = await handler.handle(
        validMessage('auth', { payload: { token: 'fresh-token' } }),
        ctx,
      );

      expect(result.handled).toBe(true);
    });

    it('returns error reply (handled:true) when token refresh returns null', async () => {
      const onAuthRefresh = vi.fn().mockResolvedValue(null);
      const ctx = makeContext({ onAuthRefresh });

      const result = await handler.handle(
        validMessage('auth', { payload: { token: 'bad-token' } }),
        ctx,
      );

      expect(result.handled).toBe(true);
      const reply = (result as { handled: true; reply?: { type?: string } }).reply;
      expect(reply?.type).toBe('error');
    });

    it('returns error when payload is missing token', async () => {
      const onAuthRefresh = vi.fn();
      const ctx = makeContext({ onAuthRefresh });

      const result = await handler.handle(
        validMessage('auth', { payload: {} }),
        ctx,
      );
      expect(result.handled).toBe(false);
      expect(onAuthRefresh).not.toHaveBeenCalled();
    });

    it('returns error when payload is missing entirely', async () => {
      const onAuthRefresh = vi.fn();
      const ctx = makeContext({ onAuthRefresh });

      const result = await handler.handle(validMessage('auth'), ctx);
      expect(result.handled).toBe(false);
    });
  });

  // ── reserved server-to-client types ──────────────────────────────

  describe('reserved message types', () => {
    it('rejects data_update from client', async () => {
      const ctx = makeContext();
      const result = await handler.handle(validMessage('data_update'), ctx);
      expect(result.handled).toBe(false);
    });

    it('rejects error from client', async () => {
      const ctx = makeContext();
      const result = await handler.handle(validMessage('error'), ctx);
      expect(result.handled).toBe(false);
    });
  });

  // ── touch on valid message ────────────────────────────────────────

  describe('activity tracking', () => {
    it('updates lastSeenAt on any valid message', async () => {
      const ctx = makeContext();
      const before = ctx.clientRegistry.getMetadata(ctx.clientId).lastSeenAt;

      await new Promise((r) => setTimeout(r, 5));
      await handler.handle(validMessage('ping'), ctx);

      const after = ctx.clientRegistry.getMetadata(ctx.clientId).lastSeenAt;
      expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });
});
