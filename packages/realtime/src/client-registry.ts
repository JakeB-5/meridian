import type { WebSocket } from 'ws';
import { generateId } from '@meridian/shared';
import { WSClientNotFoundError } from './errors.js';

// ── Types ─────────────────────────────────────────────────────────────

/**
 * Metadata stored for each connected WebSocket client.
 */
export interface ClientMetadata {
  readonly clientId: string;
  readonly userId: string;
  readonly ip: string;
  readonly userAgent: string;
  readonly connectedAt: Date;
  lastSeenAt: Date;
  isAlive: boolean;
}

/**
 * Snapshot of a single connected client (safe to expose externally).
 */
export interface ClientSnapshot {
  clientId: string;
  userId: string;
  ip: string;
  userAgent: string;
  connectedAt: Date;
  lastSeenAt: Date;
  isAlive: boolean;
}

// ── ClientRegistry ────────────────────────────────────────────────────

/**
 * Tracks all active WebSocket connections.
 *
 * Maintains two indexes:
 *   - clientId → WebSocket   (1-to-1, primary lookup)
 *   - userId   → Set<clientId>  (1-to-many, multi-tab support)
 */
export class ClientRegistry {
  /** Primary map: clientId → WebSocket */
  private readonly clients = new Map<string, WebSocket>();

  /** Metadata map: clientId → ClientMetadata */
  private readonly metadata = new Map<string, ClientMetadata>();

  /** Reverse index: userId → Set<clientId> */
  private readonly userClients = new Map<string, Set<string>>();

  // ── Registration ──────────────────────────────────────────────────

  /**
   * Register a new WebSocket connection.
   * Generates a unique clientId and stores all associated metadata.
   *
   * @returns The newly assigned clientId.
   */
  register(
    ws: WebSocket,
    params: {
      userId: string;
      ip: string;
      userAgent: string;
    },
  ): string {
    const clientId = generateId();
    const now = new Date();

    this.clients.set(clientId, ws);
    this.metadata.set(clientId, {
      clientId,
      userId: params.userId,
      ip: params.ip,
      userAgent: params.userAgent,
      connectedAt: now,
      lastSeenAt: now,
      isAlive: true,
    });

    // Update user → clients reverse index
    let userSet = this.userClients.get(params.userId);
    if (!userSet) {
      userSet = new Set();
      this.userClients.set(params.userId, userSet);
    }
    userSet.add(clientId);

    return clientId;
  }

  /**
   * Remove a client from all indexes. Safe to call multiple times.
   *
   * @returns true if the client existed and was removed, false otherwise.
   */
  unregister(clientId: string): boolean {
    const meta = this.metadata.get(clientId);
    if (!meta) return false;

    // Remove from user reverse index
    const userSet = this.userClients.get(meta.userId);
    if (userSet) {
      userSet.delete(clientId);
      if (userSet.size === 0) {
        this.userClients.delete(meta.userId);
      }
    }

    this.clients.delete(clientId);
    this.metadata.delete(clientId);
    return true;
  }

  // ── Lookups ──────────────────────────────────────────────────────

  /**
   * Get the WebSocket for a given clientId.
   * Throws WSClientNotFoundError if not found.
   */
  getSocket(clientId: string): WebSocket {
    const ws = this.clients.get(clientId);
    if (!ws) throw new WSClientNotFoundError(clientId);
    return ws;
  }

  /**
   * Get the WebSocket for a given clientId, or undefined if not found.
   */
  getSocketOrUndefined(clientId: string): WebSocket | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Get metadata for a given clientId.
   * Throws WSClientNotFoundError if not found.
   */
  getMetadata(clientId: string): ClientMetadata {
    const meta = this.metadata.get(clientId);
    if (!meta) throw new WSClientNotFoundError(clientId);
    return meta;
  }

  /**
   * Get all clientIds associated with a given userId.
   * Returns an empty set if the user has no active connections.
   */
  getClientsByUser(userId: string): Set<string> {
    return this.userClients.get(userId) ?? new Set();
  }

  /**
   * Check whether a clientId is currently registered.
   */
  has(clientId: string): boolean {
    return this.clients.has(clientId);
  }

  // ── State Mutation ────────────────────────────────────────────────

  /**
   * Update the lastSeenAt timestamp for a client.
   * Used to track activity for heartbeat monitoring.
   */
  touch(clientId: string): void {
    const meta = this.metadata.get(clientId);
    if (meta) {
      meta.lastSeenAt = new Date();
    }
  }

  /**
   * Mark a client as alive (received pong from heartbeat).
   */
  markAlive(clientId: string): void {
    const meta = this.metadata.get(clientId);
    if (meta) {
      meta.isAlive = true;
      meta.lastSeenAt = new Date();
    }
  }

  /**
   * Mark a client as potentially dead (ping sent, awaiting pong).
   */
  markDead(clientId: string): void {
    const meta = this.metadata.get(clientId);
    if (meta) {
      meta.isAlive = false;
    }
  }

  /**
   * Get all clientIds that have been marked dead (isAlive = false).
   * Used by the heartbeat system to terminate stale connections.
   */
  getDeadClients(): string[] {
    const dead: string[] = [];
    for (const [clientId, meta] of this.metadata) {
      if (!meta.isAlive) {
        dead.push(clientId);
      }
    }
    return dead;
  }

  // ── Iteration ────────────────────────────────────────────────────

  /**
   * Iterate over all registered clientIds.
   */
  allClientIds(): IterableIterator<string> {
    return this.clients.keys();
  }

  /**
   * Return all client snapshots (safe copy of metadata).
   */
  allClients(): ClientSnapshot[] {
    const result: ClientSnapshot[] = [];
    for (const meta of this.metadata.values()) {
      result.push({
        clientId: meta.clientId,
        userId: meta.userId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        connectedAt: meta.connectedAt,
        lastSeenAt: meta.lastSeenAt,
        isAlive: meta.isAlive,
      });
    }
    return result;
  }

  // ── Stats ────────────────────────────────────────────────────────

  /**
   * Total number of active connections.
   */
  get size(): number {
    return this.clients.size;
  }

  /**
   * Number of distinct users with active connections.
   */
  get uniqueUserCount(): number {
    return this.userClients.size;
  }

  /**
   * Return a summary suitable for logging/monitoring.
   */
  getStats(): {
    totalConnections: number;
    uniqueUsers: number;
    aliveConnections: number;
    deadConnections: number;
  } {
    let alive = 0;
    let dead = 0;
    for (const meta of this.metadata.values()) {
      if (meta.isAlive) alive++;
      else dead++;
    }
    return {
      totalConnections: this.clients.size,
      uniqueUsers: this.userClients.size,
      aliveConnections: alive,
      deadConnections: dead,
    };
  }
}
