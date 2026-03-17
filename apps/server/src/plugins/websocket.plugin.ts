import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { Logger } from '@meridian/shared';
import type { TokenServiceLike } from '../services/container.js';

// ── Plugin Options ──────────────────────────────────────────────────

export interface WebSocketPluginOptions {
  tokenService: TokenServiceLike;
  logger: Logger;
}

// ── WebSocket Plugin ────────────────────────────────────────────────

/**
 * WebSocket upgrade handling plugin.
 *
 * Registers the /ws endpoint that upgrades HTTP connections to WebSocket.
 * Authenticates via token query parameter or first auth message.
 */
async function websocketPlugin(app: FastifyInstance, options: WebSocketPluginOptions): Promise<void> {
  const { tokenService, logger } = options;

  const activeConnections = new Set<import('ws').WebSocket>();

  app.get('/ws', { websocket: true }, (socket, request) => {
    activeConnections.add(socket);

    const wsLogger = logger.child({
      component: 'websocket',
      requestId: request.id,
      ip: request.ip,
    });

    wsLogger.info('WebSocket connection opened');

    let authenticated = false;
    let userId: string | null = null;

    // Check for token in query string
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
    const queryToken = url.searchParams.get('token');

    if (queryToken) {
      void tokenService.verifyToken(queryToken).then((result) => {
        if (result.ok) {
          authenticated = true;
          userId = result.value.sub;
          wsLogger.info('WebSocket authenticated via query token', { userId });
          socket.send(JSON.stringify({
            type: 'auth',
            payload: { authenticated: true, userId },
            timestamp: Date.now(),
            id: crypto.randomUUID(),
          }));
        } else {
          socket.send(JSON.stringify({
            type: 'error',
            payload: { message: 'Authentication failed' },
            timestamp: Date.now(),
            id: crypto.randomUUID(),
          }));
        }
      });
    }

    socket.on('message', (data) => {
      try {
        const raw = typeof data === 'string' ? data : data.toString('utf-8');
        const message = JSON.parse(raw) as {
          type: string;
          channel?: string;
          payload?: unknown;
          token?: string;
        };

        if (message.type === 'auth' && message.token) {
          void tokenService.verifyToken(message.token).then((result) => {
            if (result.ok) {
              authenticated = true;
              userId = result.value.sub;
              wsLogger.info('WebSocket authenticated via message', { userId });
              socket.send(JSON.stringify({
                type: 'auth',
                payload: { authenticated: true, userId },
                timestamp: Date.now(),
                id: crypto.randomUUID(),
              }));
            } else {
              socket.send(JSON.stringify({
                type: 'error',
                payload: { message: 'Authentication failed' },
                timestamp: Date.now(),
                id: crypto.randomUUID(),
              }));
            }
          });
          return;
        }

        if (message.type === 'ping') {
          socket.send(JSON.stringify({
            type: 'pong',
            timestamp: Date.now(),
            id: crypto.randomUUID(),
          }));
          return;
        }

        if (!authenticated) {
          socket.send(JSON.stringify({
            type: 'error',
            payload: { message: 'Authentication required. Send an auth message first.' },
            timestamp: Date.now(),
            id: crypto.randomUUID(),
          }));
          return;
        }

        if (message.type === 'subscribe' && message.channel) {
          wsLogger.debug('Client subscribed to channel', { channel: message.channel, userId });
          socket.send(JSON.stringify({
            type: 'subscribe',
            channel: message.channel,
            payload: { subscribed: true },
            timestamp: Date.now(),
            id: crypto.randomUUID(),
          }));
          return;
        }

        if (message.type === 'unsubscribe' && message.channel) {
          wsLogger.debug('Client unsubscribed from channel', { channel: message.channel, userId });
          socket.send(JSON.stringify({
            type: 'unsubscribe',
            channel: message.channel,
            payload: { unsubscribed: true },
            timestamp: Date.now(),
            id: crypto.randomUUID(),
          }));
          return;
        }

        wsLogger.warn('Unknown message type', { type: message.type });
        socket.send(JSON.stringify({
          type: 'error',
          payload: { message: `Unknown message type: ${message.type}` },
          timestamp: Date.now(),
          id: crypto.randomUUID(),
        }));
      } catch (parseError) {
        wsLogger.error('Failed to parse WebSocket message', {
          error: parseError instanceof Error ? parseError.message : String(parseError),
        });
        socket.send(JSON.stringify({
          type: 'error',
          payload: { message: 'Invalid message format' },
          timestamp: Date.now(),
          id: crypto.randomUUID(),
        }));
      }
    });

    socket.on('close', (code, reason) => {
      activeConnections.delete(socket);
      wsLogger.info('WebSocket connection closed', {
        code,
        reason: reason?.toString(),
        userId,
      });
    });

    socket.on('error', (err) => {
      wsLogger.error('WebSocket error', {
        error: err.message,
        userId,
      });
    });
  });

  app.addHook('onClose', async () => {
    logger.info('Closing WebSocket connections', { count: activeConnections.size });
    for (const ws of activeConnections) {
      ws.close(1001, 'Server shutting down');
    }
    activeConnections.clear();
  });
}

export default fp(websocketPlugin, {
  name: 'meridian-websocket',
  fastify: '5.x',
  dependencies: ['@fastify/websocket'],
});
