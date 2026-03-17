# Group C3: @meridian/realtime — WebSocket Real-Time Engine

## Task
Implement WebSocket server for real-time dashboard updates using the 'ws' library.

## Files to Create

### src/ws-server.ts
WebSocket server that upgrades HTTP connections:
- Attaches to existing HTTP server (Fastify)
- JWT authentication on connection
- Heartbeat/ping-pong (30s interval)
- Automatic reconnection handling
- Connection tracking per user

### src/channel-manager.ts
Pub/sub channel management:
```typescript
export class ChannelManager {
  subscribe(clientId: string, channel: string): void;
  unsubscribe(clientId: string, channel: string): void;
  unsubscribeAll(clientId: string): void;
  broadcast(channel: string, message: WSMessage): void;
  getSubscribers(channel: string): Set<string>;
  getChannels(clientId: string): Set<string>;
}
```
Channel naming: `dashboard:{id}`, `question:{id}`, `datasource:{id}`

### src/message-handler.ts
Handles incoming WebSocket messages:
- subscribe/unsubscribe to channels
- ping/pong
- auth (token refresh)
- Validates message format with Zod

### src/message-serializer.ts
JSON serialization/deserialization with type safety:
```typescript
export function serialize(msg: WSMessage): string;
export function deserialize(data: string): Result<WSMessage>;
```

### src/client-registry.ts
Track connected clients:
- Map<clientId, WebSocket>
- Map<userId, Set<clientId>> (multi-tab support)
- Connection metadata (IP, userAgent, connectedAt)
- Graceful disconnect handling

### src/events/dashboard-events.ts
Event handlers that trigger broadcasts:
- onQueryResultUpdated → broadcast to dashboard subscribers
- onDashboardEdited → broadcast layout changes
- onDataSourceStatusChanged → notify relevant dashboards

### src/index.ts — re-exports

## Tests
- src/ws-server.test.ts (mock ws, connection lifecycle)
- src/channel-manager.test.ts (subscribe/unsubscribe, broadcast)
- src/message-handler.test.ts (message validation, routing)
- src/client-registry.test.ts (multi-client, cleanup)

## Dependencies
- @meridian/core, @meridian/shared
- ws, @types/ws

## Estimated LOC: ~3000 + ~1000 tests
