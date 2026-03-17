import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WSServer } from './ws-server.js';
import { ClientRegistry } from './client-registry.js';
import { ChannelManager } from './channel-manager.js';
import { MessageHandler } from './message-handler.js';
import type { WebSocket } from 'ws';
import type { Server as HTTPServer } from 'node:http';

// ── Mock WebSocketServer ──────────────────────────────────────────────

// We mock the 'ws' module so tests don't need a real HTTP server.
vi.mock('ws', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ws')>();

  class MockWebSocketServer {
    private handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    public closed = false;

    constructor(public readonly options: unknown) {}

    on(event: string, handler: (...args: unknown[]) => void) {
      if (!this.handlers[event]) this.handlers[event] = [];
      this.handlers[event]!.push(handler);
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      for (const h of this.handlers[event] ?? []) h(...args);
    }

    close(cb?: (err?: Error) => void) {
      this.closed = true;
      cb?.();
    }
  }

  return {
    ...actual,
    WebSocketServer: MockWebSocketServer,
  };
});

// ── Mock WebSocket Client ─────────────────────────────────────────────

function makeMockWS(readyState = 1 /* OPEN */): WebSocket & {
  _handlers: Record<string, ((...args: unknown[]) => void)[]>;
  emit(event: string, ...args: unknown[]): void;
} {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
    terminate: vi.fn(),
    ping: vi.fn(),
    on(event: string, handler: (...args: unknown[]) => void) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event]!.push(handler);
      return this;
    },
    emit(event: string, ...args: unknown[]) {
      for (const h of handlers[event] ?? []) h(...args);
    },
    _handlers: handlers,
  } as unknown as WebSocket & {
    _handlers: Record<string, ((...args: unknown[]) => void)[]>;
    emit(event: string, ...args: unknown[]): void;
  };
}

function makeMockRequest(
  token?: string,
  overrides: Partial<{ url: string; headers: Record<string, string>; socket: { remoteAddress: string } }> = {},
) {
  return {
    url: token ? `/ws?token=${token}` : '/ws',
    headers: {
      'user-agent': 'Test/1.0',
      ...overrides.headers,
    },
    socket: { remoteAddress: '127.0.0.1', ...overrides.socket },
    ...overrides,
  } as unknown as import('node:http').IncomingMessage;
}

// ── Helpers ───────────────────────────────────────────────────────────

function makeVerifier(userId = 'user-1'): import('./ws-server.js').TokenVerifier {
  return vi.fn().mockResolvedValue({ userId });
}

function makeRejectingVerifier(): import('./ws-server.js').TokenVerifier {
  return vi.fn().mockResolvedValue(null);
}

function makeThrowingVerifier(): import('./ws-server.js').TokenVerifier {
  return vi.fn().mockRejectedValue(new Error('JWT decode failed'));
}

function makeServer(verifier = makeVerifier()) {
  return new WSServer(verifier, {
    clientRegistry: new ClientRegistry(),
    channelManager: new ChannelManager(),
    messageHandler: new MessageHandler(),
  });
}

const MOCK_HTTP_SERVER = {} as HTTPServer;

// ── WSServer ──────────────────────────────────────────────────────────

describe('WSServer', () => {
  let server: WSServer;

  beforeEach(() => {
    server = makeServer();
  });

  afterEach(async () => {
    if (server.isRunning) await server.stop();
    vi.clearAllMocks();
  });

  // ── start / stop ──────────────────────────────────────────────────

  describe('start()', () => {
    it('sets isRunning to true after start', () => {
      server.start(MOCK_HTTP_SERVER);
      expect(server.isRunning).toBe(true);
    });

    it('throws if called twice', () => {
      server.start(MOCK_HTTP_SERVER);
      expect(() => server.start(MOCK_HTTP_SERVER)).toThrow('already started');
    });
  });

  describe('stop()', () => {
    it('sets isRunning to false after stop', async () => {
      server.start(MOCK_HTTP_SERVER);
      await server.stop();
      expect(server.isRunning).toBe(false);
    });

    it('is safe to call when not started', async () => {
      await expect(server.stop()).resolves.not.toThrow();
    });
  });

  // ── Connection: authentication ────────────────────────────────────

  describe('connection authentication', () => {
    it('closes with 1008 when no token provided', async () => {
      const verifier = makeVerifier();
      server = makeServer(verifier);
      server.start(MOCK_HTTP_SERVER);

      const ws = makeMockWS();
      const req = makeMockRequest(undefined); // no token

      // Trigger the connection event on the internal WSS
      const wss = (server as unknown as { wss: { emit: (e: string, ...a: unknown[]) => void } }).wss;
      wss.emit('connection', ws, req);

      // Allow async to complete
      await new Promise((r) => setTimeout(r, 10));

      expect(verifier).not.toHaveBeenCalled();
      expect(ws.send).toHaveBeenCalled();
      const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string);
      expect(msg.type).toBe('error');
    });

    it('closes with 1008 when verifier returns null', async () => {
      server = makeServer(makeRejectingVerifier());
      server.start(MOCK_HTTP_SERVER);

      const ws = makeMockWS();
      const req = makeMockRequest('bad-token');

      const wss = (server as unknown as { wss: { emit: (e: string, ...a: unknown[]) => void } }).wss;
      wss.emit('connection', ws, req);

      await new Promise((r) => setTimeout(r, 10));

      expect(ws.send).toHaveBeenCalled();
      const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string);
      expect(msg.type).toBe('error');
    });

    it('closes with 1008 when verifier throws', async () => {
      server = makeServer(makeThrowingVerifier());
      server.start(MOCK_HTTP_SERVER);

      const ws = makeMockWS();
      const req = makeMockRequest('bad-token');

      const wss = (server as unknown as { wss: { emit: (e: string, ...a: unknown[]) => void } }).wss;
      wss.emit('connection', ws, req);

      await new Promise((r) => setTimeout(r, 10));

      expect(ws.send).toHaveBeenCalled();
    });

    it('registers the client after successful auth', async () => {
      server = makeServer(makeVerifier('user-42'));
      server.start(MOCK_HTTP_SERVER);

      const ws = makeMockWS();
      const req = makeMockRequest('good-token');

      const wss = (server as unknown as { wss: { emit: (e: string, ...a: unknown[]) => void } }).wss;
      wss.emit('connection', ws, req);

      await new Promise((r) => setTimeout(r, 10));

      expect(server.clientRegistry.size).toBe(1);
      expect(server.clientRegistry.getClientsByUser('user-42').size).toBe(1);
    });

    it('sends a welcome auth message on successful connection', async () => {
      server = makeServer(makeVerifier('user-1'));
      server.start(MOCK_HTTP_SERVER);

      const ws = makeMockWS();
      const req = makeMockRequest('good-token');

      const wss = (server as unknown as { wss: { emit: (e: string, ...a: unknown[]) => void } }).wss;
      wss.emit('connection', ws, req);

      await new Promise((r) => setTimeout(r, 10));

      expect(ws.send).toHaveBeenCalled();
      const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string);
      expect(msg.type).toBe('auth');
      expect(msg.payload.authenticated).toBe(true);
    });

    it('extracts token from Authorization header', async () => {
      const verifier = makeVerifier('user-1');
      server = makeServer(verifier);
      server.start(MOCK_HTTP_SERVER);

      const ws = makeMockWS();
      const req = makeMockRequest(undefined, {
        url: '/ws',
        headers: { authorization: 'Bearer header-token', 'user-agent': 'Test/1.0' },
      });

      const wss = (server as unknown as { wss: { emit: (e: string, ...a: unknown[]) => void } }).wss;
      wss.emit('connection', ws, req);

      await new Promise((r) => setTimeout(r, 10));

      expect(verifier).toHaveBeenCalledWith('header-token');
    });
  });

  // ── Connection capacity ───────────────────────────────────────────

  describe('connection capacity', () => {
    it('rejects connections when maxConnections is reached', async () => {
      server = new WSServer(makeVerifier(), {
        config: { maxConnections: 1 },
        clientRegistry: new ClientRegistry(),
        channelManager: new ChannelManager(),
      });
      server.start(MOCK_HTTP_SERVER);

      // Fill the one allowed slot
      const ws1 = makeMockWS();
      const wss = (server as unknown as { wss: { emit: (e: string, ...a: unknown[]) => void } }).wss;
      wss.emit('connection', ws1, makeMockRequest('tok1'));
      await new Promise((r) => setTimeout(r, 10));
      expect(server.clientRegistry.size).toBe(1);

      // Next connection should be rejected
      const ws2 = makeMockWS();
      wss.emit('connection', ws2, makeMockRequest('tok2'));
      await new Promise((r) => setTimeout(r, 10));

      expect(server.clientRegistry.size).toBe(1); // still 1
      expect(ws2.close).toHaveBeenCalledWith(1008, 'Server at capacity');
    });
  });

  // ── Disconnect ────────────────────────────────────────────────────

  describe('disconnect', () => {
    it('removes client from registry on close', async () => {
      server = makeServer(makeVerifier('user-1'));
      server.start(MOCK_HTTP_SERVER);

      const ws = makeMockWS();
      const wss = (server as unknown as { wss: { emit: (e: string, ...a: unknown[]) => void } }).wss;
      wss.emit('connection', ws, makeMockRequest('tok'));
      await new Promise((r) => setTimeout(r, 10));

      expect(server.clientRegistry.size).toBe(1);

      // Simulate client closing
      ws.emit('close', 1000, Buffer.from('Normal'));
      expect(server.clientRegistry.size).toBe(0);
    });

    it('removes channel subscriptions on disconnect', async () => {
      server = makeServer(makeVerifier('user-1'));
      server.start(MOCK_HTTP_SERVER);

      const ws = makeMockWS();
      const wss = (server as unknown as { wss: { emit: (e: string, ...a: unknown[]) => void } }).wss;
      wss.emit('connection', ws, makeMockRequest('tok'));
      await new Promise((r) => setTimeout(r, 10));

      // Manually subscribe the registered client
      const [clientId] = [...server.clientRegistry.allClientIds()];
      server.channelManager.subscribe(clientId!, 'dashboard:d1');
      expect(server.channelManager.getSubscribers('dashboard:d1').size).toBe(1);

      ws.emit('close', 1000, Buffer.from('Normal'));
      expect(server.channelManager.getSubscribers('dashboard:d1').size).toBe(0);
    });
  });

  // ── Heartbeat ─────────────────────────────────────────────────────

  describe('heartbeat', () => {
    it('terminates dead clients on heartbeat cycle', async () => {
      server = new WSServer(makeVerifier('user-1'), {
        config: { heartbeatIntervalMs: 50 },
        clientRegistry: new ClientRegistry(),
        channelManager: new ChannelManager(),
      });
      server.start(MOCK_HTTP_SERVER);

      const ws = makeMockWS();
      const wss = (server as unknown as { wss: { emit: (e: string, ...a: unknown[]) => void } }).wss;
      wss.emit('connection', ws, makeMockRequest('tok'));
      await new Promise((r) => setTimeout(r, 10));

      expect(server.clientRegistry.size).toBe(1);
      const [clientId] = [...server.clientRegistry.allClientIds()];

      // Mark as dead manually to simulate missed pong
      server.clientRegistry.markDead(clientId!);

      // Trigger heartbeat directly
      (server as unknown as { runHeartbeat(): void }).runHeartbeat();

      expect(ws.terminate).toHaveBeenCalled();
      expect(server.clientRegistry.size).toBe(0);
    });

    it('pings alive clients during heartbeat', async () => {
      server = new WSServer(makeVerifier('user-1'), {
        config: { heartbeatIntervalMs: 200 },
        clientRegistry: new ClientRegistry(),
        channelManager: new ChannelManager(),
      });
      server.start(MOCK_HTTP_SERVER);

      const ws = makeMockWS();
      const wss = (server as unknown as { wss: { emit: (e: string, ...a: unknown[]) => void } }).wss;
      wss.emit('connection', ws, makeMockRequest('tok'));
      await new Promise((r) => setTimeout(r, 10));

      // Trigger heartbeat
      (server as unknown as { runHeartbeat(): void }).runHeartbeat();

      expect(ws.ping).toHaveBeenCalled();
    });

    it('marks clients as potentially dead before pinging', async () => {
      server = new WSServer(makeVerifier('user-1'), {
        config: { heartbeatIntervalMs: 200 },
        clientRegistry: new ClientRegistry(),
        channelManager: new ChannelManager(),
      });
      server.start(MOCK_HTTP_SERVER);

      const ws = makeMockWS();
      const wss = (server as unknown as { wss: { emit: (e: string, ...a: unknown[]) => void } }).wss;
      wss.emit('connection', ws, makeMockRequest('tok'));
      await new Promise((r) => setTimeout(r, 10));

      const [clientId] = [...server.clientRegistry.allClientIds()];
      expect(server.clientRegistry.getMetadata(clientId!).isAlive).toBe(true);

      // Trigger heartbeat — should mark dead then ping
      (server as unknown as { runHeartbeat(): void }).runHeartbeat();

      expect(server.clientRegistry.getMetadata(clientId!).isAlive).toBe(false);
    });

    it('restores alive status when pong is received', async () => {
      server = makeServer(makeVerifier('user-1'));
      server.start(MOCK_HTTP_SERVER);

      const ws = makeMockWS();
      const wss = (server as unknown as { wss: { emit: (e: string, ...a: unknown[]) => void } }).wss;
      wss.emit('connection', ws, makeMockRequest('tok'));
      await new Promise((r) => setTimeout(r, 10));

      const [clientId] = [...server.clientRegistry.allClientIds()];
      server.clientRegistry.markDead(clientId!);

      // Simulate pong event from ws client
      ws.emit('pong');

      expect(server.clientRegistry.getMetadata(clientId!).isAlive).toBe(true);
    });
  });

  // ── sendToClient / sendToUser ─────────────────────────────────────

  describe('sendToClient()', () => {
    it('sends a message to a connected client', async () => {
      server = makeServer(makeVerifier('user-1'));
      server.start(MOCK_HTTP_SERVER);

      const ws = makeMockWS();
      const wss = (server as unknown as { wss: { emit: (e: string, ...a: unknown[]) => void } }).wss;
      wss.emit('connection', ws, makeMockRequest('tok'));
      await new Promise((r) => setTimeout(r, 10));

      const [clientId] = [...server.clientRegistry.allClientIds()];
      const msg = { type: 'data_update' as const, id: 'msg-1', timestamp: Date.now() };

      // Clear the welcome send
      (ws.send as ReturnType<typeof vi.fn>).mockClear();

      const sent = server.sendToClient(clientId!, msg);
      expect(sent).toBe(true);
      expect(ws.send).toHaveBeenCalledOnce();
    });

    it('returns false for unknown clientId', () => {
      server.start(MOCK_HTTP_SERVER);
      const sent = server.sendToClient('ghost', {
        type: 'data_update',
        id: 'x',
        timestamp: Date.now(),
      });
      expect(sent).toBe(false);
    });
  });

  describe('sendToUser()', () => {
    it('sends to all connections of a user', async () => {
      server = makeServer(makeVerifier('user-multi'));
      server.start(MOCK_HTTP_SERVER);

      const ws1 = makeMockWS();
      const ws2 = makeMockWS();
      const wss = (server as unknown as { wss: { emit: (e: string, ...a: unknown[]) => void } }).wss;
      wss.emit('connection', ws1, makeMockRequest('tok1'));
      wss.emit('connection', ws2, makeMockRequest('tok2'));
      await new Promise((r) => setTimeout(r, 10));

      expect(server.clientRegistry.size).toBe(2);

      // Clear welcome sends
      (ws1.send as ReturnType<typeof vi.fn>).mockClear();
      (ws2.send as ReturnType<typeof vi.fn>).mockClear();

      const sent = server.sendToUser('user-multi', {
        type: 'data_update',
        id: 'x',
        timestamp: Date.now(),
      });

      expect(sent).toBe(2);
      expect(ws1.send).toHaveBeenCalledOnce();
      expect(ws2.send).toHaveBeenCalledOnce();
    });

    it('returns 0 for a user with no connections', () => {
      server.start(MOCK_HTTP_SERVER);
      const sent = server.sendToUser('nobody', {
        type: 'data_update',
        id: 'x',
        timestamp: Date.now(),
      });
      expect(sent).toBe(0);
    });
  });

  // ── getStats ──────────────────────────────────────────────────────

  describe('getStats()', () => {
    it('returns combined connection and channel stats', async () => {
      server = makeServer(makeVerifier('user-1'));
      server.start(MOCK_HTTP_SERVER);

      const ws = makeMockWS();
      const wss = (server as unknown as { wss: { emit: (e: string, ...a: unknown[]) => void } }).wss;
      wss.emit('connection', ws, makeMockRequest('tok'));
      await new Promise((r) => setTimeout(r, 10));

      const [clientId] = [...server.clientRegistry.allClientIds()];
      server.channelManager.subscribe(clientId!, 'dashboard:d1');

      const stats = server.getStats();
      expect(stats.connections.totalConnections).toBe(1);
      expect(stats.channels.channels).toBe(1);
    });
  });
});
