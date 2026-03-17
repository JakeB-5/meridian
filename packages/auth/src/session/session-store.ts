import { randomUUID } from 'crypto';
import {
  SessionNotFoundError,
  SessionRevokedError,
} from '../errors/auth-errors.js';
import { ok, err, type Result } from '../types/result.js';

/** Metadata stored for each active session */
export interface Session {
  /** Unique session identifier (UUID v4) */
  id: string;
  /** The user this session belongs to */
  userId: string;
  /** Hashed refresh token — do NOT store plaintext */
  refreshTokenHash: string;
  /** When the session was created (Unix ms) */
  createdAt: number;
  /** When the session expires (Unix ms) */
  expiresAt: number;
  /** IP address that created the session */
  ipAddress?: string;
  /** User-agent string from the creating request */
  userAgent?: string;
  /** Whether this session has been explicitly revoked */
  revoked: boolean;
}

/** Options for creating a new session */
export interface CreateSessionOptions {
  userId: string;
  refreshToken: string;
  /** TTL in milliseconds — default 7 days */
  ttlMs?: number;
  ipAddress?: string;
  userAgent?: string;
}

/** Configuration for the session store */
export interface SessionStoreConfig {
  /** Maximum concurrent sessions per user — default 5 */
  maxSessionsPerUser?: number;
  /** Default TTL in milliseconds — default 7 days */
  defaultTtlMs?: number;
  /** Optional Redis-compatible client for distributed storage */
  redisClient?: SessionRedisClient;
}

/** Minimal Redis interface for session storage */
export interface SessionRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, exMode: 'PX', exMs: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 5;

/** Simple async SHA-256 hash using the built-in crypto module */
async function hashToken(token: string): Promise<string> {
  const { createHash } = await import('crypto');
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Session store that manages refresh token sessions.
 *
 * Supports both in-memory (single-process) and Redis-backed (distributed) modes.
 * In Redis mode, sessions are stored at `session:<id>` and a set of session IDs
 * per user at `sessions:user:<userId>`.
 */
export class SessionStore {
  private readonly maxSessions: number;
  private readonly defaultTtlMs: number;
  private readonly redis: SessionRedisClient | undefined;
  /** In-memory fallback: sessionId → Session */
  private readonly sessions = new Map<string, Session>();
  /** In-memory fallback: userId → Set<sessionId> */
  private readonly userSessions = new Map<string, Set<string>>();

  constructor(config: SessionStoreConfig = {}) {
    this.maxSessions = config.maxSessionsPerUser ?? DEFAULT_MAX_SESSIONS;
    this.defaultTtlMs = config.defaultTtlMs ?? SEVEN_DAYS_MS;
    this.redis = config.redisClient;
  }

  /**
   * Create a new session for a user's refresh token.
   * If the user already has `maxSessions` active sessions, the oldest is evicted.
   */
  async create(options: CreateSessionOptions): Promise<Result<Session>> {
    const ttlMs = options.ttlMs ?? this.defaultTtlMs;
    const now = Date.now();
    const sessionId = randomUUID();
    const refreshTokenHash = await hashToken(options.refreshToken);

    const session: Session = {
      id: sessionId,
      userId: options.userId,
      refreshTokenHash,
      createdAt: now,
      expiresAt: now + ttlMs,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      revoked: false,
    };

    // Enforce max sessions
    const existingSessions = await this.listForUser(options.userId);
    const activeSessions = existingSessions.filter(
      (s) => !s.revoked && s.expiresAt > now,
    );

    if (activeSessions.length >= this.maxSessions) {
      // Evict the oldest session
      const oldest = activeSessions.sort((a, b) => a.createdAt - b.createdAt)[0];
      if (oldest) {
        await this.revoke(oldest.id);
      }
    }

    if (this.redis) {
      await this.saveToRedis(session, ttlMs);
    } else {
      this.sessions.set(sessionId, session);
      const userSet = this.userSessions.get(options.userId) ?? new Set();
      userSet.add(sessionId);
      this.userSessions.set(options.userId, userSet);
    }

    return ok(session);
  }

  /**
   * Look up a session by ID.
   * Returns an error if the session does not exist, is revoked, or has expired.
   */
  async get(sessionId: string): Promise<Result<Session>> {
    const session = await this.findById(sessionId);
    if (!session) {
      return err(new SessionNotFoundError(sessionId));
    }

    if (session.revoked) {
      return err(new SessionRevokedError(sessionId));
    }

    if (session.expiresAt <= Date.now()) {
      // Lazily clean up
      await this.delete(sessionId, session.userId);
      return err(new SessionNotFoundError(sessionId));
    }

    return ok(session);
  }

  /**
   * Validate a refresh token against a stored session.
   * Returns the session if valid, an error otherwise.
   */
  async validateRefreshToken(
    sessionId: string,
    refreshToken: string,
  ): Promise<Result<Session>> {
    const sessionResult = await this.get(sessionId);
    if (!sessionResult.ok) return sessionResult;

    const tokenHash = await hashToken(refreshToken);
    if (sessionResult.value.refreshTokenHash !== tokenHash) {
      return err(new SessionRevokedError(sessionId));
    }

    return ok(sessionResult.value);
  }

  /**
   * Revoke a session by ID.
   * Revoked sessions are kept in storage briefly for audit purposes.
   */
  async revoke(sessionId: string): Promise<Result<void>> {
    const session = await this.findById(sessionId);
    if (!session) {
      return err(new SessionNotFoundError(sessionId));
    }

    const revoked: Session = { ...session, revoked: true };

    if (this.redis) {
      // Update with a short TTL for audit — 1 hour
      await this.saveToRedis(revoked, 60 * 60 * 1000);
    } else {
      this.sessions.set(sessionId, revoked);
    }

    return ok(undefined);
  }

  /**
   * Revoke all sessions for a user.
   * Used during password change or account deactivation.
   */
  async revokeAll(userId: string): Promise<number> {
    const sessions = await this.listForUser(userId);
    let count = 0;
    for (const session of sessions) {
      if (!session.revoked) {
        await this.revoke(session.id);
        count++;
      }
    }
    return count;
  }

  /**
   * List all sessions for a user, including revoked and expired ones.
   * Callers should filter by `revoked` and `expiresAt` as needed.
   */
  async listForUser(userId: string): Promise<Session[]> {
    if (this.redis) {
      return this.listForUserRedis(userId);
    }

    const ids = this.userSessions.get(userId) ?? new Set<string>();
    const sessions: Session[] = [];
    for (const id of ids) {
      const s = this.sessions.get(id);
      if (s) sessions.push(s);
    }
    return sessions;
  }

  /**
   * List only active (non-revoked, non-expired) sessions for a user.
   */
  async listActiveSessions(userId: string): Promise<Session[]> {
    const all = await this.listForUser(userId);
    const now = Date.now();
    return all.filter((s) => !s.revoked && s.expiresAt > now);
  }

  /** Return the count of active sessions for a user */
  async countActiveSessions(userId: string): Promise<number> {
    const active = await this.listActiveSessions(userId);
    return active.length;
  }

  /** Update the refresh token hash for an existing session (token rotation) */
  async rotateRefreshToken(
    sessionId: string,
    newRefreshToken: string,
  ): Promise<Result<Session>> {
    const sessionResult = await this.get(sessionId);
    if (!sessionResult.ok) return sessionResult;

    const newHash = await hashToken(newRefreshToken);
    const now = Date.now();
    const session = sessionResult.value;
    const remainingMs = session.expiresAt - now;

    const updated: Session = {
      ...session,
      refreshTokenHash: newHash,
    };

    if (this.redis) {
      await this.saveToRedis(updated, Math.max(remainingMs, 0));
    } else {
      this.sessions.set(sessionId, updated);
    }

    return ok(updated);
  }

  // ---- Redis helpers ----

  private async saveToRedis(session: Session, ttlMs: number): Promise<void> {
    const redis = this.redis!;
    const key = `session:${session.id}`;
    const userKey = `sessions:user:${session.userId}`;

    await redis.set(key, JSON.stringify(session), 'PX', ttlMs);
    await redis.sadd(userKey, session.id);
    // Keep the user-sessions set alive as long as the longest possible session
    await redis.expire(userKey, Math.ceil(ttlMs / 1000) + 60);
  }

  private async listForUserRedis(userId: string): Promise<Session[]> {
    const redis = this.redis!;
    const userKey = `sessions:user:${userId}`;
    const sessionIds = await redis.smembers(userKey);

    const sessions: Session[] = [];
    for (const id of sessionIds) {
      const raw = await redis.get(`session:${id}`);
      if (raw) {
        try {
          sessions.push(JSON.parse(raw) as Session);
        } catch {
          // Corrupted entry — skip
        }
      } else {
        // Session expired in Redis — clean up the index
        await redis.srem(userKey, id);
      }
    }
    return sessions;
  }

  private async findById(sessionId: string): Promise<Session | undefined> {
    if (this.redis) {
      const raw = await this.redis.get(`session:${sessionId}`);
      if (!raw) return undefined;
      try {
        return JSON.parse(raw) as Session;
      } catch {
        return undefined;
      }
    }
    return this.sessions.get(sessionId);
  }

  private async delete(sessionId: string, userId: string): Promise<void> {
    if (this.redis) {
      await this.redis.del(`session:${sessionId}`);
      await this.redis.srem(`sessions:user:${userId}`, sessionId);
    } else {
      this.sessions.delete(sessionId);
      this.userSessions.get(userId)?.delete(sessionId);
    }
  }

  /** Purge expired sessions from in-memory store (call periodically) */
  purgeExpired(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(id);
        this.userSessions.get(session.userId)?.delete(id);
      }
    }
  }

  /** Total sessions in the in-memory store (for diagnostics) */
  get size(): number {
    return this.sessions.size;
  }
}
