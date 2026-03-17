export const PKG_NAME = '@meridian/realtime';

// ── Core Classes ──────────────────────────────────────────────────────
export { WSServer } from './ws-server.js';
export { ChannelManager, channelName, parseChannel, isValidChannel } from './channel-manager.js';
export { ClientRegistry } from './client-registry.js';
export { MessageHandler } from './message-handler.js';

// ── Serialization ─────────────────────────────────────────────────────
export {
  serialize,
  deserialize,
  createMessage,
  createErrorMessage,
  createPongMessage,
} from './message-serializer.js';

// ── Events ────────────────────────────────────────────────────────────
export { DashboardEventEmitter } from './events/dashboard-events.js';

// ── Errors ────────────────────────────────────────────────────────────
export {
  WSAuthenticationError,
  WSMessageValidationError,
  WSChannelError,
  WSClientNotFoundError,
  WSSerializationError,
} from './errors.js';

// ── Types ─────────────────────────────────────────────────────────────
export type { WSServerConfig, TokenVerifier, TokenRefresher } from './ws-server.js';
export type { ChannelPrefix, ChannelName } from './channel-manager.js';
export type { ClientMetadata, ClientSnapshot } from './client-registry.js';
export type { MessageHandlerResult, MessageHandlerContext } from './message-handler.js';
export type {
  QueryResultUpdatedPayload,
  DashboardEditedPayload,
  DataSourceStatusChangedPayload,
  DashboardCacheInvalidatedPayload,
  QuestionUpdatedPayload,
} from './events/dashboard-events.js';
