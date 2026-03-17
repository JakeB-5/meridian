import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage, Server as HTTPServer } from 'node:http';
import type { Logger } from '@meridian/shared';
import { createNoopLogger } from '@meridian/shared';
import { ClientRegistry } from './client-registry.js';
import { ChannelManager } from './channel-manager.js';
import { MessageHandler } from './message-handler.js';
import { serialize, createMessage, createErrorMessage } from './message-serializer.js';
import { WSAuthenticationError } from './errors.js';

// ── Configuration ─────────────────────────────────────────────────────

export interface WSServerConfig {
  /** Path to mount the WebSocket server on (default: '/ws') */
  path?: string;
  /** Heartbeat interval in milliseconds (default: 30_000) */
  heartbeatIntervalMs?: number;
  /** Maximum number of concurrent connections (default: 10_000) */
  maxConnections?: number;
  /** Maximum message size in bytes (default: 64KB) */
  maxMessageSizeBytes?: number;
}

const DEFAULT_CONFIG: Required<WSServerConfig> = {
  path: '/ws',
  heartbeatIntervalMs: 30_000,
  maxConnections: 10_000,
  maxMessageSizeBytes: 64 * 1024, // 64KB
};

// ── Token Verifier ────────────────────────────────────────────────────

/**
 * Callback used to verify a JWT token on connection.
 * Returns the authenticated user's id and display name, or throws/returns null
 * to reject the connection.
 */
export type TokenVerifier = (token: string) => Promise<{ userId: string; userName?: string } | null>;

/**
 * Optional callback invoked when a client requests a token refresh.
 * Returns the new userId on success, or null to terminate the session.
 */
export type TokenRefresher = (clientId: string, token: string) => Promise<{ userId: string } | null>;

// ── Extract Token from Request ────────────────────────────────────────

/**
 * Extract the JWT token from an upgrade request.
 * Checks the Authorization header first, then the `token` query parameter.
 */
function extractToken(req: IncomingMessage): string | null {
  // Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  // ?token=<token>
  const url = req.url ?? '';
  const idx = url.indexOf('?');
  if (idx !== -1) {
    const params = new URLSearchParams(url.slice(idx + 1));
    const t = params.get('token');
    if (t) return t;
  }

  return null;
}

/**
 * Extract the client's IP address from the upgrade request.
 */
function extractIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]!.trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

// ── WSServer ──────────────────────────────────────────────────────────

/**
 * WebSocket server for Meridian real-time updates.
 *
 * Lifecycle:
 *   1. Attach to an existing HTTP server (Fastify integration).
 *   2. Authenticate clients via JWT on connect.
 *   3. Route incoming messages through MessageHandler.
 *   4. Broadcast events via ChannelManager + ClientRegistry.
 *   5. Heartbeat every 30s to cull stale connections.
 */
export class WSServer {
  private readonly config: Required<WSServerConfig>;
  private readonly logger: Logger;

  readonly clientRegistry: ClientRegistry;
  readonly channelManager: ChannelManager;
  private readonly messageHandler: MessageHandler;

  private wss: WebSocketServer | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly verifyToken: TokenVerifier,
    options: {
      config?: WSServerConfig;
      logger?: Logger;
      clientRegistry?: ClientRegistry;
      channelManager?: ChannelManager;
      messageHandler?: MessageHandler;
    } = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.logger = options.logger ?? createNoopLogger();
    this.clientRegistry = options.clientRegistry ?? new ClientRegistry();
    this.channelManager = options.channelManager ?? new ChannelManager();
    this.messageHandler = options.messageHandler ?? new MessageHandler(this.logger);
  }

  // ── Startup ───────────────────────────────────────────────────────

  /**
   * Attach the WebSocket server to an existing HTTP server.
   * After calling start(), the server is ready to accept connections.
   */
  start(httpServer: HTTPServer): void {
    if (this.wss) {
      throw new Error('WSServer is already started');
    }

    this.wss = new WebSocketServer({
      server: httpServer,
      path: this.config.path,
      maxPayload: this.config.maxMessageSizeBytes,
    });

    this.wss.on('connection', (ws, req) => {
      void this.handleConnection(ws, req);
    });

    this.wss.on('error', (err) => {
      this.logger.error('WebSocket server error', { error: err.message });
    });

    this.heartbeatTimer = setInterval(() => {
      this.runHeartbeat();
    }, this.config.heartbeatIntervalMs);

    this.logger.info('WebSocket server started', {
      path: this.config.path,
      heartbeatIntervalMs: this.config.heartbeatIntervalMs,
    });
  }

  // ── Shutdown ──────────────────────────────────────────────────────

  /**
   * Gracefully shut down the WebSocket server.
   * Closes all active connections and stops the heartbeat timer.
   */
  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (!this.wss) return;

    // Close all client connections gracefully
    for (const clientId of this.clientRegistry.allClientIds()) {
      const ws = this.clientRegistry.getSocketOrUndefined(clientId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close(1001, 'Server shutting down');
      }
    }

    await new Promise<void>((resolve, reject) => {
      this.wss!.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    this.wss = null;
    this.logger.info('WebSocket server stopped');
  }

  // ── Connection Handling ───────────────────────────────────────────

  /**
   * Handle a new WebSocket upgrade connection.
   * Authenticates via JWT, registers the client, and wires event listeners.
   */
  private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    // Check connection cap
    if (this.clientRegistry.size >= this.config.maxConnections) {
      this.logger.warn('Connection rejected: max connections reached', {
        current: this.clientRegistry.size,
        max: this.config.maxConnections,
      });
      ws.close(1008, 'Server at capacity');
      return;
    }

    // Extract and verify token
    const token = extractToken(req);
    if (!token) {
      this.logger.warn('Connection rejected: no token provided', {
        ip: extractIp(req),
      });
      this.sendAndClose(ws, createErrorMessage('ERR_WS_AUTHENTICATION', 'Token required'), 1008);
      return;
    }

    let userId: string;
    try {
      const result = await this.verifyToken(token);
      if (!result) {
        this.logger.warn('Connection rejected: token verification returned null', {
          ip: extractIp(req),
        });
        this.sendAndClose(
          ws,
          createErrorMessage('ERR_WS_AUTHENTICATION', 'Invalid or expired token'),
          1008,
        );
        return;
      }
      userId = result.userId;
    } catch (error) {
      const msg = error instanceof WSAuthenticationError ? error.message : 'Authentication failed';
      this.logger.warn('Connection rejected: token verification failed', {
        ip: extractIp(req),
        error: error instanceof Error ? error.message : String(error),
      });
      this.sendAndClose(ws, createErrorMessage('ERR_WS_AUTHENTICATION', msg), 1008);
      return;
    }

    // Register the client
    const ip = extractIp(req);
    const userAgent = String(req.headers['user-agent'] ?? 'unknown');
    const clientId = this.clientRegistry.register(ws, { userId, ip, userAgent });

    this.logger.info('WebSocket client connected', {
      clientId,
      userId,
      ip,
      totalConnections: this.clientRegistry.size,
    });

    // Send a welcome/ack message
    this.send(ws, createMessage('auth', { payload: { authenticated: true, clientId } }));

    // Wire event listeners
    ws.on('message', (data) => {
      void this.handleMessage(clientId, data);
    });

    ws.on('close', (code, reason) => {
      this.handleDisconnect(clientId, code, reason.toString());
    });

    ws.on('error', (error) => {
      this.logger.error('WebSocket client error', {
        clientId,
        userId,
        error: error.message,
      });
    });

    ws.on('pong', () => {
      this.clientRegistry.markAlive(clientId);
    });
  }

  // ── Message Handling ──────────────────────────────────────────────

  /**
   * Route an incoming message from a client through the message handler.
   */
  private async handleMessage(clientId: string, rawData: unknown): Promise<void> {
    const result = await this.messageHandler.handle(rawData, {
      clientId,
      channelManager: this.channelManager,
      clientRegistry: this.clientRegistry,
      logger: this.logger,
    });

    if (!result.handled) {
      // Send error reply back to the originating client
      const ws = this.clientRegistry.getSocketOrUndefined(clientId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        this.send(
          ws,
          createErrorMessage(result.error.code, result.error.message),
        );
      }
      return;
    }

    if (result.reply) {
      const ws = this.clientRegistry.getSocketOrUndefined(clientId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        this.send(ws, result.reply);
      }
    }
  }

  // ── Disconnect ────────────────────────────────────────────────────

  /**
   * Clean up all state for a disconnected client.
   */
  private handleDisconnect(clientId: string, code: number, reason: string): void {
    this.channelManager.unsubscribeAll(clientId);
    this.clientRegistry.unregister(clientId);

    this.logger.info('WebSocket client disconnected', {
      clientId,
      code,
      reason,
      totalConnections: this.clientRegistry.size,
    });
  }

  // ── Heartbeat ─────────────────────────────────────────────────────

  /**
   * Ping all connected clients and terminate any that have not responded
   * since the last heartbeat cycle.
   *
   * Uses the ws library's native ping() + pong event pattern.
   */
  private runHeartbeat(): void {
    const stats = this.clientRegistry.getStats();
    this.logger.debug('Running WebSocket heartbeat', stats);

    // Terminate clients that missed the last ping
    const dead = this.clientRegistry.getDeadClients();
    for (const clientId of dead) {
      const ws = this.clientRegistry.getSocketOrUndefined(clientId);
      this.logger.warn('Terminating dead WebSocket client', { clientId });
      ws?.terminate();
      this.channelManager.unsubscribeAll(clientId);
      this.clientRegistry.unregister(clientId);
    }

    // Mark all remaining clients as potentially dead, then ping
    for (const clientId of this.clientRegistry.allClientIds()) {
      const ws = this.clientRegistry.getSocketOrUndefined(clientId);
      if (!ws || ws.readyState !== WebSocket.OPEN) continue;

      this.clientRegistry.markDead(clientId);
      ws.ping();
    }
  }

  // ── Broadcast Helpers ─────────────────────────────────────────────

  /**
   * Send a message to a specific client by clientId.
   * No-op if the client is not connected or the socket is not OPEN.
   */
  sendToClient(clientId: string, message: Parameters<typeof serialize>[0]): boolean {
    const ws = this.clientRegistry.getSocketOrUndefined(clientId);
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    this.send(ws, message);
    return true;
  }

  /**
   * Broadcast a message to all clients of a given userId.
   * Supports multi-tab scenarios.
   *
   * @returns Number of tabs/connections the message was sent to.
   */
  sendToUser(userId: string, message: Parameters<typeof serialize>[0]): number {
    const clientIds = this.clientRegistry.getClientsByUser(userId);
    let sent = 0;
    for (const clientId of clientIds) {
      if (this.sendToClient(clientId, message)) sent++;
    }
    return sent;
  }

  // ── Internal Send ────────────────────────────────────────────────

  private send(ws: WebSocket, message: Parameters<typeof serialize>[0]): void {
    try {
      ws.send(serialize(message));
    } catch (error) {
      this.logger.error('Failed to send WebSocket message', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private sendAndClose(ws: WebSocket, message: Parameters<typeof serialize>[0], code: number): void {
    try {
      ws.send(serialize(message), () => {
        ws.close(code);
      });
    } catch {
      ws.close(code);
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────

  /**
   * Return a combined stats snapshot for monitoring/health checks.
   */
  getStats(): {
    connections: ReturnType<ClientRegistry['getStats']>;
    channels: ReturnType<ChannelManager['getStats']>;
  } {
    return {
      connections: this.clientRegistry.getStats(),
      channels: this.channelManager.getStats(),
    };
  }

  /**
   * Whether the server is currently running.
   */
  get isRunning(): boolean {
    return this.wss !== null;
  }
}
