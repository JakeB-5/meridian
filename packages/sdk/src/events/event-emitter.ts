// Typed event emitter for Meridian SDK events

import type { QueryResult } from '@meridian/shared';

// ── Event payload types ──────────────────────────────────────────────────────

export interface LoadEvent {
  timestamp: number;
}

export interface ErrorEvent {
  error: Error;
  code?: string;
  timestamp: number;
}

export interface FilterChangeEvent {
  key: string;
  value: unknown;
  allFilters: Record<string, unknown>;
}

export interface DataUpdateEvent {
  result: QueryResult;
  timestamp: number;
}

export interface ClickEvent {
  target: 'card' | 'chart' | 'filter' | 'action';
  data: Record<string, unknown>;
}

// ── Event map ────────────────────────────────────────────────────────────────

export interface SdkEventMap {
  load: LoadEvent;
  error: ErrorEvent;
  'filter-change': FilterChangeEvent;
  'data-update': DataUpdateEvent;
  click: ClickEvent;
}

export type SdkEventName = keyof SdkEventMap;

export type SdkEventHandler<K extends SdkEventName> = (event: SdkEventMap[K]) => void;

// Generic handler type for untyped usage
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyEventHandler = (event: any) => void;

// ── EventEmitter implementation ──────────────────────────────────────────────

/**
 * Typed event emitter for SDK events.
 * Supports strongly-typed events via the SdkEventMap interface.
 */
export class EventEmitter {
  private readonly listeners = new Map<string, Set<AnyEventHandler>>();

  /**
   * Register a typed event listener.
   */
  on<K extends SdkEventName>(event: K, handler: SdkEventHandler<K>): this {
    let handlers = this.listeners.get(event);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(event, handlers);
    }
    handlers.add(handler as AnyEventHandler);
    return this;
  }

  /**
   * Register a one-time typed event listener that fires once then unregisters.
   */
  once<K extends SdkEventName>(event: K, handler: SdkEventHandler<K>): this {
    const wrapper: AnyEventHandler = (payload) => {
      handler(payload);
      this.off(event, handler);
    };
    // Store wrapper reference so off() can remove it by original handler
    (wrapper as AnyEventHandler & { __original?: AnyEventHandler }).__original =
      handler as AnyEventHandler;
    return this.on(event, wrapper as SdkEventHandler<K>);
  }

  /**
   * Unregister a previously registered listener.
   */
  off<K extends SdkEventName>(event: K, handler: SdkEventHandler<K>): this {
    const handlers = this.listeners.get(event);
    if (!handlers) return this;

    // Try to remove by exact reference first
    if (handlers.has(handler as AnyEventHandler)) {
      handlers.delete(handler as AnyEventHandler);
    } else {
      // Search for wrapper wrapping this handler (once() wrappers)
      for (const fn of handlers) {
        const typed = fn as AnyEventHandler & { __original?: AnyEventHandler };
        if (typed.__original === (handler as AnyEventHandler)) {
          handlers.delete(fn);
          break;
        }
      }
    }

    if (handlers.size === 0) {
      this.listeners.delete(event);
    }
    return this;
  }

  /**
   * Emit a typed event to all registered listeners.
   */
  emit<K extends SdkEventName>(event: K, payload: SdkEventMap[K]): boolean {
    const handlers = this.listeners.get(event);
    if (!handlers || handlers.size === 0) return false;

    for (const handler of Array.from(handlers)) {
      try {
        handler(payload);
      } catch (err) {
        // Prevent one failing handler from breaking others
        console.error(`[MeridianSDK] Uncaught error in '${event}' event handler:`, err);
      }
    }
    return true;
  }

  /**
   * Remove all listeners for a specific event, or all events if no event specified.
   */
  removeAllListeners(event?: SdkEventName): this {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }

  /**
   * Returns the number of listeners registered for a given event.
   */
  listenerCount(event: SdkEventName): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /**
   * Returns all event names that have at least one listener.
   */
  eventNames(): string[] {
    return Array.from(this.listeners.keys());
  }
}
