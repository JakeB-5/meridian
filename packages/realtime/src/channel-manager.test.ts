import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChannelManager, channelName, parseChannel, isValidChannel } from './channel-manager.js';
import type { WebSocket } from 'ws';
import { WSChannelError } from './errors.js';

// ── Helpers ───────────────────────────────────────────────────────────

function makeMockSocket(readyState = 1 /* OPEN */): WebSocket {
  return {
    readyState,
    send: vi.fn(),
  } as unknown as WebSocket;
}

function makeMessage() {
  return {
    type: 'data_update' as const,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    channel: 'dashboard:test',
    payload: { value: 42 },
  };
}

// ── channelName / parseChannel / isValidChannel ───────────────────────

describe('channelName()', () => {
  it('builds a dashboard channel name', () => {
    expect(channelName('dashboard', 'abc123')).toBe('dashboard:abc123');
  });

  it('builds a question channel name', () => {
    expect(channelName('question', 'q1')).toBe('question:q1');
  });

  it('builds a datasource channel name', () => {
    expect(channelName('datasource', 'ds-99')).toBe('datasource:ds-99');
  });
});

describe('parseChannel()', () => {
  it('parses a valid dashboard channel', () => {
    expect(parseChannel('dashboard:abc')).toEqual({ prefix: 'dashboard', id: 'abc' });
  });

  it('parses a valid question channel', () => {
    expect(parseChannel('question:q1')).toEqual({ prefix: 'question', id: 'q1' });
  });

  it('parses a valid datasource channel', () => {
    expect(parseChannel('datasource:d1')).toEqual({ prefix: 'datasource', id: 'd1' });
  });

  it('returns null for unknown prefix', () => {
    expect(parseChannel('unknown:abc')).toBeNull();
  });

  it('returns null when no colon separator', () => {
    expect(parseChannel('dashboardabc')).toBeNull();
  });

  it('returns null when id is empty', () => {
    expect(parseChannel('dashboard:')).toBeNull();
  });
});

describe('isValidChannel()', () => {
  it('accepts valid channel names', () => {
    expect(isValidChannel('dashboard:abc')).toBe(true);
    expect(isValidChannel('question:q1')).toBe(true);
    expect(isValidChannel('datasource:d1')).toBe(true);
  });

  it('rejects invalid channel names', () => {
    expect(isValidChannel('invalid:x')).toBe(false);
    expect(isValidChannel('dashboard')).toBe(false);
    expect(isValidChannel('')).toBe(false);
  });
});

// ── ChannelManager ────────────────────────────────────────────────────

describe('ChannelManager', () => {
  let manager: ChannelManager;

  beforeEach(() => {
    manager = new ChannelManager();
  });

  // ── subscribe ─────────────────────────────────────────────────────

  describe('subscribe()', () => {
    it('subscribes a client to a channel', () => {
      manager.subscribe('client-1', 'dashboard:d1');
      expect(manager.getSubscribers('dashboard:d1').has('client-1')).toBe(true);
      expect(manager.getChannels('client-1').has('dashboard:d1')).toBe(true);
    });

    it('allows multiple clients on the same channel', () => {
      manager.subscribe('client-1', 'dashboard:d1');
      manager.subscribe('client-2', 'dashboard:d1');
      expect(manager.getSubscribers('dashboard:d1').size).toBe(2);
    });

    it('allows one client on multiple channels', () => {
      manager.subscribe('client-1', 'dashboard:d1');
      manager.subscribe('client-1', 'question:q1');
      expect(manager.getChannels('client-1').size).toBe(2);
    });

    it('is idempotent — subscribing twice does not double-count', () => {
      manager.subscribe('client-1', 'dashboard:d1');
      manager.subscribe('client-1', 'dashboard:d1');
      expect(manager.getSubscribers('dashboard:d1').size).toBe(1);
    });

    it('throws WSChannelError for an invalid channel name', () => {
      expect(() => manager.subscribe('client-1', 'bad-channel')).toThrow(WSChannelError);
    });

    it('throws WSChannelError for unknown prefix', () => {
      expect(() => manager.subscribe('client-1', 'unknown:abc')).toThrow(WSChannelError);
    });
  });

  // ── unsubscribe ───────────────────────────────────────────────────

  describe('unsubscribe()', () => {
    it('removes a client from a channel', () => {
      manager.subscribe('client-1', 'dashboard:d1');
      manager.unsubscribe('client-1', 'dashboard:d1');
      expect(manager.getSubscribers('dashboard:d1').has('client-1')).toBe(false);
    });

    it('removes the channel entry when last subscriber leaves', () => {
      manager.subscribe('client-1', 'dashboard:d1');
      manager.unsubscribe('client-1', 'dashboard:d1');
      expect(manager.channelCount).toBe(0);
    });

    it('is safe to call when not subscribed', () => {
      expect(() => manager.unsubscribe('client-99', 'dashboard:d1')).not.toThrow();
    });

    it('does not remove other clients from the channel', () => {
      manager.subscribe('client-1', 'dashboard:d1');
      manager.subscribe('client-2', 'dashboard:d1');
      manager.unsubscribe('client-1', 'dashboard:d1');
      expect(manager.getSubscribers('dashboard:d1').has('client-2')).toBe(true);
    });
  });

  // ── unsubscribeAll ────────────────────────────────────────────────

  describe('unsubscribeAll()', () => {
    it('removes client from all subscribed channels', () => {
      manager.subscribe('client-1', 'dashboard:d1');
      manager.subscribe('client-1', 'question:q1');
      manager.subscribe('client-1', 'datasource:ds1');
      manager.unsubscribeAll('client-1');

      expect(manager.getChannels('client-1').size).toBe(0);
      expect(manager.getSubscribers('dashboard:d1').has('client-1')).toBe(false);
      expect(manager.getSubscribers('question:q1').has('client-1')).toBe(false);
      expect(manager.getSubscribers('datasource:ds1').has('client-1')).toBe(false);
    });

    it('cleans up empty channel entries after unsubscribeAll', () => {
      manager.subscribe('client-1', 'dashboard:d1');
      manager.unsubscribeAll('client-1');
      expect(manager.channelCount).toBe(0);
    });

    it('keeps other clients subscribed when one unsubscribes all', () => {
      manager.subscribe('client-1', 'dashboard:d1');
      manager.subscribe('client-2', 'dashboard:d1');
      manager.unsubscribeAll('client-1');
      expect(manager.getSubscribers('dashboard:d1').has('client-2')).toBe(true);
    });

    it('is safe to call for a client with no subscriptions', () => {
      expect(() => manager.unsubscribeAll('ghost-client')).not.toThrow();
    });
  });

  // ── broadcast ────────────────────────────────────────────────────

  describe('broadcast()', () => {
    it('sends to all subscribed OPEN clients', () => {
      const ws1 = makeMockSocket(1);
      const ws2 = makeMockSocket(1);
      manager.subscribe('client-1', 'dashboard:d1');
      manager.subscribe('client-2', 'dashboard:d1');

      const getSocket = (id: string) => (id === 'client-1' ? ws1 : ws2);
      const msg = makeMessage();
      const sent = manager.broadcast('dashboard:d1', msg, getSocket);

      expect(sent).toBe(2);
      expect(ws1.send).toHaveBeenCalledOnce();
      expect(ws2.send).toHaveBeenCalledOnce();
    });

    it('skips clients whose socket is not OPEN', () => {
      const wsOpen = makeMockSocket(1);
      const wsClosed = makeMockSocket(3); // CLOSED
      manager.subscribe('client-open', 'dashboard:d1');
      manager.subscribe('client-closed', 'dashboard:d1');

      const getSocket = (id: string) => (id === 'client-open' ? wsOpen : wsClosed);
      const sent = manager.broadcast('dashboard:d1', makeMessage(), getSocket);

      expect(sent).toBe(1);
      expect(wsOpen.send).toHaveBeenCalledOnce();
      expect(wsClosed.send).not.toHaveBeenCalled();
    });

    it('skips clients whose socket is undefined', () => {
      manager.subscribe('client-1', 'dashboard:d1');
      const sent = manager.broadcast('dashboard:d1', makeMessage(), () => undefined);
      expect(sent).toBe(0);
    });

    it('returns 0 for a channel with no subscribers', () => {
      const sent = manager.broadcast('dashboard:unknown', makeMessage(), () => undefined);
      expect(sent).toBe(0);
    });

    it('serializes the message as JSON string', () => {
      const ws = makeMockSocket(1);
      manager.subscribe('client-1', 'dashboard:d1');
      const msg = makeMessage();
      manager.broadcast('dashboard:d1', msg, () => ws);

      const call = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      const parsed = JSON.parse(call as string);
      expect(parsed.type).toBe('data_update');
      expect(parsed.id).toBe(msg.id);
    });
  });

  // ── broadcastToPrefix ─────────────────────────────────────────────

  describe('broadcastToPrefix()', () => {
    it('broadcasts to all channels matching the prefix', () => {
      const ws1 = makeMockSocket(1);
      const ws2 = makeMockSocket(1);
      const ws3 = makeMockSocket(1);

      manager.subscribe('c1', 'dashboard:d1');
      manager.subscribe('c2', 'dashboard:d2');
      manager.subscribe('c3', 'question:q1'); // different prefix

      const getSocket = (id: string) => {
        if (id === 'c1') return ws1;
        if (id === 'c2') return ws2;
        return ws3;
      };

      const sent = manager.broadcastToPrefix('dashboard', makeMessage(), getSocket);
      expect(sent).toBe(2);
      expect(ws1.send).toHaveBeenCalledOnce();
      expect(ws2.send).toHaveBeenCalledOnce();
      expect(ws3.send).not.toHaveBeenCalled();
    });
  });

  // ── isSubscribed ──────────────────────────────────────────────────

  describe('isSubscribed()', () => {
    it('returns true when subscribed', () => {
      manager.subscribe('client-1', 'dashboard:d1');
      expect(manager.isSubscribed('client-1', 'dashboard:d1')).toBe(true);
    });

    it('returns false when not subscribed', () => {
      expect(manager.isSubscribed('client-1', 'dashboard:d1')).toBe(false);
    });

    it('returns false after unsubscribing', () => {
      manager.subscribe('client-1', 'dashboard:d1');
      manager.unsubscribe('client-1', 'dashboard:d1');
      expect(manager.isSubscribed('client-1', 'dashboard:d1')).toBe(false);
    });
  });

  // ── stats ─────────────────────────────────────────────────────────

  describe('getStats()', () => {
    it('returns zero stats on empty manager', () => {
      const stats = manager.getStats();
      expect(stats.channels).toBe(0);
      expect(stats.totalSubscriptions).toBe(0);
      expect(stats.subscribersByChannel).toEqual({});
    });

    it('counts channels and subscriptions correctly', () => {
      manager.subscribe('c1', 'dashboard:d1');
      manager.subscribe('c2', 'dashboard:d1');
      manager.subscribe('c1', 'question:q1');

      const stats = manager.getStats();
      expect(stats.channels).toBe(2);
      expect(stats.totalSubscriptions).toBe(3);
      expect(stats.subscribersByChannel['dashboard:d1']).toBe(2);
      expect(stats.subscribersByChannel['question:q1']).toBe(1);
    });
  });
});
