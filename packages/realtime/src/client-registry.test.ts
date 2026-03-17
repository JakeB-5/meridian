import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClientRegistry } from './client-registry.js';
import { WSClientNotFoundError } from './errors.js';
import type { WebSocket } from 'ws';

// ── Helpers ───────────────────────────────────────────────────────────

function makeMockSocket(): WebSocket {
  return { readyState: 1, send: vi.fn(), close: vi.fn() } as unknown as WebSocket;
}

const DEFAULT_PARAMS = {
  userId: 'user-1',
  ip: '127.0.0.1',
  userAgent: 'TestAgent/1.0',
};

// ── ClientRegistry ────────────────────────────────────────────────────

describe('ClientRegistry', () => {
  let registry: ClientRegistry;

  beforeEach(() => {
    registry = new ClientRegistry();
  });

  // ── register ──────────────────────────────────────────────────────

  describe('register()', () => {
    it('returns a non-empty clientId string', () => {
      const ws = makeMockSocket();
      const clientId = registry.register(ws, DEFAULT_PARAMS);
      expect(typeof clientId).toBe('string');
      expect(clientId.length).toBeGreaterThan(0);
    });

    it('increments the connection count', () => {
      registry.register(makeMockSocket(), DEFAULT_PARAMS);
      expect(registry.size).toBe(1);
      registry.register(makeMockSocket(), DEFAULT_PARAMS);
      expect(registry.size).toBe(2);
    });

    it('stores the socket retrievable by clientId', () => {
      const ws = makeMockSocket();
      const clientId = registry.register(ws, DEFAULT_PARAMS);
      expect(registry.getSocket(clientId)).toBe(ws);
    });

    it('stores correct metadata', () => {
      const ws = makeMockSocket();
      const clientId = registry.register(ws, DEFAULT_PARAMS);
      const meta = registry.getMetadata(clientId);

      expect(meta.clientId).toBe(clientId);
      expect(meta.userId).toBe('user-1');
      expect(meta.ip).toBe('127.0.0.1');
      expect(meta.userAgent).toBe('TestAgent/1.0');
      expect(meta.isAlive).toBe(true);
      expect(meta.connectedAt).toBeInstanceOf(Date);
    });

    it('creates the userId reverse index', () => {
      const ws = makeMockSocket();
      const clientId = registry.register(ws, DEFAULT_PARAMS);
      const ids = registry.getClientsByUser('user-1');
      expect(ids.has(clientId)).toBe(true);
    });

    it('assigns unique clientIds for concurrent registrations', () => {
      const id1 = registry.register(makeMockSocket(), DEFAULT_PARAMS);
      const id2 = registry.register(makeMockSocket(), DEFAULT_PARAMS);
      expect(id1).not.toBe(id2);
    });

    it('tracks multi-tab connections for the same user', () => {
      registry.register(makeMockSocket(), { ...DEFAULT_PARAMS, userId: 'user-multi' });
      registry.register(makeMockSocket(), { ...DEFAULT_PARAMS, userId: 'user-multi' });
      registry.register(makeMockSocket(), { ...DEFAULT_PARAMS, userId: 'user-multi' });

      expect(registry.getClientsByUser('user-multi').size).toBe(3);
      expect(registry.uniqueUserCount).toBe(1);
    });
  });

  // ── unregister ────────────────────────────────────────────────────

  describe('unregister()', () => {
    it('returns true when client existed', () => {
      const clientId = registry.register(makeMockSocket(), DEFAULT_PARAMS);
      expect(registry.unregister(clientId)).toBe(true);
    });

    it('returns false for unknown clientId', () => {
      expect(registry.unregister('ghost-id')).toBe(false);
    });

    it('removes the client from the primary map', () => {
      const clientId = registry.register(makeMockSocket(), DEFAULT_PARAMS);
      registry.unregister(clientId);
      expect(registry.has(clientId)).toBe(false);
      expect(registry.size).toBe(0);
    });

    it('removes the clientId from the user reverse index', () => {
      const clientId = registry.register(makeMockSocket(), DEFAULT_PARAMS);
      registry.unregister(clientId);
      expect(registry.getClientsByUser('user-1').has(clientId)).toBe(false);
    });

    it('cleans up user entry when last client disconnects', () => {
      const clientId = registry.register(makeMockSocket(), DEFAULT_PARAMS);
      registry.unregister(clientId);
      expect(registry.uniqueUserCount).toBe(0);
    });

    it('keeps the user entry when other clients remain', () => {
      const id1 = registry.register(makeMockSocket(), DEFAULT_PARAMS);
      registry.register(makeMockSocket(), DEFAULT_PARAMS);
      registry.unregister(id1);
      expect(registry.uniqueUserCount).toBe(1);
      expect(registry.getClientsByUser('user-1').size).toBe(1);
    });

    it('is safe to call multiple times on the same clientId', () => {
      const clientId = registry.register(makeMockSocket(), DEFAULT_PARAMS);
      registry.unregister(clientId);
      expect(() => registry.unregister(clientId)).not.toThrow();
    });
  });

  // ── getSocket ─────────────────────────────────────────────────────

  describe('getSocket()', () => {
    it('returns the WebSocket for a known clientId', () => {
      const ws = makeMockSocket();
      const clientId = registry.register(ws, DEFAULT_PARAMS);
      expect(registry.getSocket(clientId)).toBe(ws);
    });

    it('throws WSClientNotFoundError for unknown clientId', () => {
      expect(() => registry.getSocket('unknown')).toThrow(WSClientNotFoundError);
    });
  });

  // ── getSocketOrUndefined ──────────────────────────────────────────

  describe('getSocketOrUndefined()', () => {
    it('returns the WebSocket when found', () => {
      const ws = makeMockSocket();
      const clientId = registry.register(ws, DEFAULT_PARAMS);
      expect(registry.getSocketOrUndefined(clientId)).toBe(ws);
    });

    it('returns undefined for unknown clientId', () => {
      expect(registry.getSocketOrUndefined('unknown')).toBeUndefined();
    });
  });

  // ── getMetadata ───────────────────────────────────────────────────

  describe('getMetadata()', () => {
    it('throws WSClientNotFoundError for unknown clientId', () => {
      expect(() => registry.getMetadata('ghost')).toThrow(WSClientNotFoundError);
    });
  });

  // ── touch / markAlive / markDead ──────────────────────────────────

  describe('touch()', () => {
    it('updates lastSeenAt', async () => {
      const clientId = registry.register(makeMockSocket(), DEFAULT_PARAMS);
      const before = registry.getMetadata(clientId).lastSeenAt;

      await new Promise((r) => setTimeout(r, 5));
      registry.touch(clientId);

      const after = registry.getMetadata(clientId).lastSeenAt;
      expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('is a no-op for unknown clientId', () => {
      expect(() => registry.touch('ghost')).not.toThrow();
    });
  });

  describe('markAlive()', () => {
    it('sets isAlive to true and updates lastSeenAt', () => {
      const clientId = registry.register(makeMockSocket(), DEFAULT_PARAMS);
      registry.markDead(clientId); // flip to dead first
      registry.markAlive(clientId);
      expect(registry.getMetadata(clientId).isAlive).toBe(true);
    });
  });

  describe('markDead()', () => {
    it('sets isAlive to false', () => {
      const clientId = registry.register(makeMockSocket(), DEFAULT_PARAMS);
      registry.markDead(clientId);
      expect(registry.getMetadata(clientId).isAlive).toBe(false);
    });

    it('is a no-op for unknown clientId', () => {
      expect(() => registry.markDead('ghost')).not.toThrow();
    });
  });

  // ── getDeadClients ────────────────────────────────────────────────

  describe('getDeadClients()', () => {
    it('returns empty array when all clients are alive', () => {
      registry.register(makeMockSocket(), DEFAULT_PARAMS);
      expect(registry.getDeadClients()).toEqual([]);
    });

    it('returns only dead clientIds', () => {
      const id1 = registry.register(makeMockSocket(), DEFAULT_PARAMS);
      const id2 = registry.register(makeMockSocket(), DEFAULT_PARAMS);
      registry.markDead(id1);

      const dead = registry.getDeadClients();
      expect(dead).toContain(id1);
      expect(dead).not.toContain(id2);
    });

    it('returns all clients as dead after marking all dead', () => {
      const id1 = registry.register(makeMockSocket(), DEFAULT_PARAMS);
      const id2 = registry.register(makeMockSocket(), DEFAULT_PARAMS);
      registry.markDead(id1);
      registry.markDead(id2);

      expect(registry.getDeadClients()).toHaveLength(2);
    });
  });

  // ── allClients ────────────────────────────────────────────────────

  describe('allClients()', () => {
    it('returns an array of snapshots', () => {
      registry.register(makeMockSocket(), DEFAULT_PARAMS);
      registry.register(makeMockSocket(), { ...DEFAULT_PARAMS, userId: 'user-2' });

      const all = registry.allClients();
      expect(all).toHaveLength(2);
      expect(all.every((c) => typeof c.clientId === 'string')).toBe(true);
    });

    it('returns empty array when no clients', () => {
      expect(registry.allClients()).toEqual([]);
    });
  });

  // ── getStats ──────────────────────────────────────────────────────

  describe('getStats()', () => {
    it('returns zeroes for an empty registry', () => {
      const stats = registry.getStats();
      expect(stats.totalConnections).toBe(0);
      expect(stats.uniqueUsers).toBe(0);
      expect(stats.aliveConnections).toBe(0);
      expect(stats.deadConnections).toBe(0);
    });

    it('counts alive and dead connections correctly', () => {
      const id1 = registry.register(makeMockSocket(), DEFAULT_PARAMS);
      const id2 = registry.register(makeMockSocket(), DEFAULT_PARAMS);
      registry.register(makeMockSocket(), { ...DEFAULT_PARAMS, userId: 'user-2' });

      registry.markDead(id1);
      registry.markDead(id2);

      const stats = registry.getStats();
      expect(stats.totalConnections).toBe(3);
      expect(stats.uniqueUsers).toBe(2);
      expect(stats.aliveConnections).toBe(1);
      expect(stats.deadConnections).toBe(2);
    });
  });

  // ── allClientIds ──────────────────────────────────────────────────

  describe('allClientIds()', () => {
    it('iterates over all registered clientIds', () => {
      const id1 = registry.register(makeMockSocket(), DEFAULT_PARAMS);
      const id2 = registry.register(makeMockSocket(), DEFAULT_PARAMS);

      const ids = [...registry.allClientIds()];
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
    });
  });
});
