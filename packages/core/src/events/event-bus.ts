import type { DomainEvent, DomainEventName } from './domain-events.js';

/** Event handler function type */
export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => Promise<void>;

/** Subscription handle for unsubscribing */
export interface EventSubscription {
  unsubscribe(): void;
}

/**
 * EventBus interface.
 * Provides publish/subscribe semantics for domain events.
 */
export interface EventBus {
  /** Publish an event to all registered handlers */
  publish<T extends DomainEvent>(event: T): Promise<void>;

  /** Subscribe to events of a specific type */
  subscribe<T extends DomainEvent>(
    eventType: string,
    handler: EventHandler<T>,
  ): EventSubscription;

  /** Subscribe to all events */
  subscribeAll(handler: EventHandler): EventSubscription;

  /** Remove all handlers (useful for testing) */
  clear(): void;
}

/**
 * In-memory EventBus implementation.
 *
 * Suitable for single-process use. For distributed systems,
 * replace with a Redis/Kafka-backed implementation via the same interface.
 */
export class InMemoryEventBus implements EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private globalHandlers: Set<EventHandler> = new Set();

  async publish<T extends DomainEvent>(event: T): Promise<void> {
    const typeHandlers = this.handlers.get(event.eventType);
    const promises: Promise<void>[] = [];

    // Execute type-specific handlers
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        promises.push(this.safeExecute(handler, event));
      }
    }

    // Execute global handlers
    for (const handler of this.globalHandlers) {
      promises.push(this.safeExecute(handler, event));
    }

    // Wait for all handlers to complete
    await Promise.all(promises);
  }

  subscribe<T extends DomainEvent>(
    eventType: string,
    handler: EventHandler<T>,
  ): EventSubscription {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }

    const typedHandler = handler as EventHandler;
    this.handlers.get(eventType)!.add(typedHandler);

    return {
      unsubscribe: () => {
        const handlers = this.handlers.get(eventType);
        if (handlers) {
          handlers.delete(typedHandler);
          if (handlers.size === 0) {
            this.handlers.delete(eventType);
          }
        }
      },
    };
  }

  subscribeAll(handler: EventHandler): EventSubscription {
    this.globalHandlers.add(handler);

    return {
      unsubscribe: () => {
        this.globalHandlers.delete(handler);
      },
    };
  }

  clear(): void {
    this.handlers.clear();
    this.globalHandlers.clear();
  }

  /** Get the count of handlers for a specific event type */
  handlerCount(eventType?: string): number {
    if (eventType) {
      return (this.handlers.get(eventType)?.size ?? 0) + this.globalHandlers.size;
    }
    let total = this.globalHandlers.size;
    for (const handlers of this.handlers.values()) {
      total += handlers.size;
    }
    return total;
  }

  /** Execute a handler safely, catching and logging errors */
  private async safeExecute<T extends DomainEvent>(
    handler: EventHandler<T>,
    event: T,
  ): Promise<void> {
    try {
      await handler(event);
    } catch (error) {
      // In production, this would log to a proper logger
      // For the domain layer, we re-throw to let the caller handle it
      console.error(
        `Event handler error for ${event.eventType}:`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }
}
