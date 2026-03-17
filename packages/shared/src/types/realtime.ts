/** WebSocket message types */
export type WSMessageType = 'subscribe' | 'unsubscribe' | 'data_update' | 'error' | 'ping' | 'pong' | 'auth';

/** WebSocket message envelope */
export interface WSMessage<T = unknown> {
  type: WSMessageType;
  channel?: string;
  payload?: T;
  timestamp: number;
  id: string;
}

/** A client subscription to a channel */
export interface Subscription {
  channel: string;
  entityType: 'dashboard' | 'question';
  entityId: string;
}
