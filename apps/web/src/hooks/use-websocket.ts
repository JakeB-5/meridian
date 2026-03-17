import { useEffect, useRef, useCallback, useState } from 'react';
import { WS_BASE_URL, STORAGE_KEYS } from '@/lib/constants';
import { generateId } from '@/lib/utils';
import type { WSMessage, WSMessageType } from '@meridian/shared';

// ── Types ────────────────────────────────────────────────────────────

export type WSStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseWebSocketOptions {
  /** Auto-connect on mount (default true) */
  autoConnect?: boolean;
  /** Reconnect on disconnect (default true) */
  reconnect?: boolean;
  /** Max reconnection attempts (default 10) */
  maxReconnectAttempts?: number;
  /** Base delay between reconnections in ms (default 1000) */
  reconnectDelay?: number;
  /** Handler called on any received message */
  onMessage?: (message: WSMessage) => void;
  /** Handler called on connection open */
  onOpen?: () => void;
  /** Handler called on connection close */
  onClose?: () => void;
  /** Handler called on error */
  onError?: (error: Event) => void;
}

interface UseWebSocketReturn {
  status: WSStatus;
  send: (message: Omit<WSMessage, 'timestamp' | 'id'>) => void;
  subscribe: (channel: string) => void;
  unsubscribe: (channel: string) => void;
  connect: () => void;
  disconnect: () => void;
  lastMessage: WSMessage | null;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    autoConnect = true,
    reconnect = true,
    maxReconnectAttempts = 10,
    reconnectDelay = 1000,
    onMessage,
    onOpen,
    onClose,
    onError,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribedChannelsRef = useRef<Set<string>>(new Set());
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [status, setStatus] = useState<WSStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);

  // Stable refs for callbacks
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const onErrorRef = useRef(onError);
  onMessageRef.current = onMessage;
  onOpenRef.current = onOpen;
  onCloseRef.current = onClose;
  onErrorRef.current = onError;

  const sendRaw = useCallback((data: WSMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const send = useCallback(
    (message: Omit<WSMessage, 'timestamp' | 'id'>) => {
      sendRaw({
        ...message,
        timestamp: Date.now(),
        id: generateId(),
      } as WSMessage);
    },
    [sendRaw],
  );

  const subscribe = useCallback(
    (channel: string) => {
      subscribedChannelsRef.current.add(channel);
      send({ type: 'subscribe', channel });
    },
    [send],
  );

  const unsubscribe = useCallback(
    (channel: string) => {
      subscribedChannelsRef.current.delete(channel);
      send({ type: 'unsubscribe', channel });
    },
    [send],
  );

  const cleanup = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    // Prevent duplicate connections
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    cleanup();
    setStatus('connecting');

    const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const url = token ? `${WS_BASE_URL}?token=${encodeURIComponent(token)}` : WS_BASE_URL;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      reconnectAttemptsRef.current = 0;
      onOpenRef.current?.();

      // Re-subscribe to previously subscribed channels
      for (const channel of subscribedChannelsRef.current) {
        send({ type: 'subscribe', channel });
      }

      // Start ping interval
      pingIntervalRef.current = setInterval(() => {
        send({ type: 'ping' });
      }, 30_000);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WSMessage;
        if (message.type === 'pong') return;
        setLastMessage(message);
        onMessageRef.current?.(message);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      cleanup();
      onCloseRef.current?.();

      // Attempt reconnection with exponential backoff
      if (reconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
        const delay = reconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
        const jitter = Math.random() * delay * 0.3;
        reconnectAttemptsRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay + jitter);
      }
    };

    ws.onerror = (event) => {
      setStatus('error');
      onErrorRef.current?.(event);
    };
  }, [cleanup, reconnect, maxReconnectAttempts, reconnectDelay, send]);

  const disconnect = useCallback(() => {
    reconnectAttemptsRef.current = maxReconnectAttempts; // Prevent reconnection
    cleanup();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
  }, [cleanup, maxReconnectAttempts]);

  // Auto-connect
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    status,
    send,
    subscribe,
    unsubscribe,
    connect,
    disconnect,
    lastMessage,
  };
}

// ── Dashboard-specific hook ──────────────────────────────────────────

/** Subscribe to real-time updates for a specific dashboard */
export function useDashboardWebSocket(
  dashboardId: string,
  onDataUpdate?: (payload: { cardId: string; result: unknown }) => void,
) {
  const channel = `dashboard:${dashboardId}`;

  const ws = useWebSocket({
    autoConnect: !!dashboardId,
    onMessage: (message) => {
      if (message.type === 'data_update' && message.channel === channel) {
        onDataUpdate?.(message.payload as { cardId: string; result: unknown });
      }
    },
  });

  useEffect(() => {
    if (dashboardId && ws.status === 'connected') {
      ws.subscribe(channel);
      return () => {
        ws.unsubscribe(channel);
      };
    }
  }, [dashboardId, ws.status, ws.subscribe, ws.unsubscribe, channel]);

  return ws;
}

/** Subscribe to real-time updates for a specific question */
export function useQuestionWebSocket(
  questionId: string,
  onDataUpdate?: (result: unknown) => void,
) {
  const channel = `question:${questionId}`;

  const ws = useWebSocket({
    autoConnect: !!questionId,
    onMessage: (message) => {
      if (message.type === 'data_update' && message.channel === channel) {
        onDataUpdate?.(message.payload);
      }
    },
  });

  useEffect(() => {
    if (questionId && ws.status === 'connected') {
      ws.subscribe(channel);
      return () => {
        ws.unsubscribe(channel);
      };
    }
  }, [questionId, ws.status, ws.subscribe, ws.unsubscribe, channel]);

  return ws;
}
