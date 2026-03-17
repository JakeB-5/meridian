import type { WebSocket } from 'ws';
import type { WSMessage } from '@meridian/shared';
import { serialize } from './message-serializer.js';
import { WSChannelError } from './errors.js';

// ── Channel Name Helpers ──────────────────────────────────────────────

/**
 * All valid channel prefixes in Meridian's real-time system.
 */
export type ChannelPrefix = 'dashboard' | 'question' | 'datasource';

/**
 * A typed channel name in the format `prefix:id`.
 */
export type ChannelName = `dashboard:${string}` | `question:${string}` | `datasource:${string}`;

/**
 * Build a typed channel name from a prefix and entity id.
 */
export function channelName(prefix: ChannelPrefix, id: string): ChannelName {
  return `${prefix}:${id}` as ChannelName;
}

/**
 * Parse a channel name into its prefix and id components.
 * Returns null if the channel format is invalid.
 */
export function parseChannel(channel: string): { prefix: ChannelPrefix; id: string } | null {
  const idx = channel.indexOf(':');
  if (idx === -1) return null;

  const prefix = channel.slice(0, idx) as ChannelPrefix;
  const id = channel.slice(idx + 1);

  if (!['dashboard', 'question', 'datasource'].includes(prefix)) return null;
  if (!id || id.trim().length === 0) return null;

  return { prefix, id };
}

/**
 * Validate that a channel name has the correct format.
 */
export function isValidChannel(channel: string): channel is ChannelName {
  return parseChannel(channel) !== null;
}

// ── ChannelManager ────────────────────────────────────────────────────

/**
 * Manages pub/sub channel subscriptions for WebSocket clients.
 *
 * Maintains two indexes for O(1) lookups:
 *   - channel → Set<clientId>   (for broadcasting)
 *   - clientId → Set<channel>   (for cleanup on disconnect)
 */
export class ChannelManager {
  /** channel → subscribed clientIds */
  private readonly channelSubscribers = new Map<string, Set<string>>();

  /** clientId → subscribed channels */
  private readonly clientChannels = new Map<string, Set<string>>();

  // ── Subscription Management ───────────────────────────────────────

  /**
   * Subscribe a client to a channel.
   * Validates the channel format before subscribing.
   *
   * @throws WSChannelError if the channel name is invalid.
   */
  subscribe(clientId: string, channel: string): void {
    if (!isValidChannel(channel)) {
      throw new WSChannelError(
        `Invalid channel name: '${channel}'. Expected format: 'prefix:id' (e.g. 'dashboard:abc')`,
        { channel },
      );
    }

    // channel → clients
    let subscribers = this.channelSubscribers.get(channel);
    if (!subscribers) {
      subscribers = new Set();
      this.channelSubscribers.set(channel, subscribers);
    }
    subscribers.add(clientId);

    // client → channels
    let channels = this.clientChannels.get(clientId);
    if (!channels) {
      channels = new Set();
      this.clientChannels.set(clientId, channels);
    }
    channels.add(channel);
  }

  /**
   * Unsubscribe a client from a specific channel.
   * No-op if the client was not subscribed.
   */
  unsubscribe(clientId: string, channel: string): void {
    // Remove from channel → clients
    const subscribers = this.channelSubscribers.get(channel);
    if (subscribers) {
      subscribers.delete(clientId);
      if (subscribers.size === 0) {
        this.channelSubscribers.delete(channel);
      }
    }

    // Remove from client → channels
    const channels = this.clientChannels.get(clientId);
    if (channels) {
      channels.delete(channel);
      if (channels.size === 0) {
        this.clientChannels.delete(clientId);
      }
    }
  }

  /**
   * Unsubscribe a client from ALL channels.
   * Called when a client disconnects to prevent memory leaks.
   */
  unsubscribeAll(clientId: string): void {
    const channels = this.clientChannels.get(clientId);
    if (!channels) return;

    for (const channel of channels) {
      const subscribers = this.channelSubscribers.get(channel);
      if (subscribers) {
        subscribers.delete(clientId);
        if (subscribers.size === 0) {
          this.channelSubscribers.delete(channel);
        }
      }
    }

    this.clientChannels.delete(clientId);
  }

  // ── Broadcasting ──────────────────────────────────────────────────

  /**
   * Broadcast a message to all clients subscribed to the given channel.
   * The getSocket callback is used to resolve WebSocket instances without
   * creating a circular dependency with ClientRegistry.
   *
   * Silently skips clients whose socket is not OPEN.
   *
   * @param channel   The target channel name.
   * @param message   The WSMessage to broadcast.
   * @param getSocket Callback that resolves clientId → WebSocket | undefined.
   * @returns Number of clients the message was sent to.
   */
  broadcast(
    channel: string,
    message: WSMessage,
    getSocket: (clientId: string) => WebSocket | undefined,
  ): number {
    const subscribers = this.channelSubscribers.get(channel);
    if (!subscribers || subscribers.size === 0) return 0;

    const serialized = serialize(message);
    let sent = 0;

    for (const clientId of subscribers) {
      const ws = getSocket(clientId);
      if (ws && ws.readyState === 1 /* WebSocket.OPEN */) {
        ws.send(serialized);
        sent++;
      }
    }

    return sent;
  }

  /**
   * Broadcast a message to all clients subscribed to any channel
   * that matches the given prefix.
   *
   * For example, broadcastToPrefix('dashboard', message, getSocket) will
   * send to subscribers of 'dashboard:abc', 'dashboard:xyz', etc.
   *
   * @returns Total number of clients the message was sent to.
   */
  broadcastToPrefix(
    prefix: ChannelPrefix,
    message: WSMessage,
    getSocket: (clientId: string) => WebSocket | undefined,
  ): number {
    let total = 0;
    for (const channel of this.channelSubscribers.keys()) {
      if (channel.startsWith(`${prefix}:`)) {
        total += this.broadcast(channel, message, getSocket);
      }
    }
    return total;
  }

  // ── Queries ───────────────────────────────────────────────────────

  /**
   * Get all clientIds subscribed to a channel.
   * Returns an empty Set if no subscribers.
   */
  getSubscribers(channel: string): Set<string> {
    return this.channelSubscribers.get(channel) ?? new Set();
  }

  /**
   * Get all channels a client is subscribed to.
   * Returns an empty Set if the client has no subscriptions.
   */
  getChannels(clientId: string): Set<string> {
    return this.clientChannels.get(clientId) ?? new Set();
  }

  /**
   * Check whether a client is subscribed to a specific channel.
   */
  isSubscribed(clientId: string, channel: string): boolean {
    return this.channelSubscribers.get(channel)?.has(clientId) ?? false;
  }

  /**
   * Return all active channel names.
   */
  allChannels(): string[] {
    return [...this.channelSubscribers.keys()];
  }

  // ── Stats ─────────────────────────────────────────────────────────

  /**
   * Number of distinct active channels.
   */
  get channelCount(): number {
    return this.channelSubscribers.size;
  }

  /**
   * Total number of client-channel subscription pairs.
   */
  get totalSubscriptions(): number {
    let total = 0;
    for (const channels of this.clientChannels.values()) {
      total += channels.size;
    }
    return total;
  }

  /**
   * Return a summary suitable for logging/monitoring.
   */
  getStats(): {
    channels: number;
    totalSubscriptions: number;
    subscribersByChannel: Record<string, number>;
  } {
    const subscribersByChannel: Record<string, number> = {};
    for (const [channel, subscribers] of this.channelSubscribers) {
      subscribersByChannel[channel] = subscribers.size;
    }
    return {
      channels: this.channelSubscribers.size,
      totalSubscriptions: this.totalSubscriptions,
      subscribersByChannel,
    };
  }
}
