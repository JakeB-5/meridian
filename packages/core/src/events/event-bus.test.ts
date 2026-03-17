import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryEventBus } from './event-bus.js';
import { createDomainEvent } from './domain-events.js';
import type { DataSourceCreated, QuestionExecuted, DomainEvent } from './domain-events.js';

describe('InMemoryEventBus', () => {
  let bus: InMemoryEventBus;

  beforeEach(() => {
    bus = new InMemoryEventBus();
  });

  describe('publish()', () => {
    it('should deliver event to subscribed handler', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);

      bus.subscribe<DataSourceCreated>('DataSourceCreated', handler);

      const event = createDomainEvent<DataSourceCreated>({
        eventType: 'DataSourceCreated',
        aggregateId: 'ds-1',
        aggregateType: 'DataSource',
        payload: {
          name: 'Test DB',
          type: 'postgresql',
          organizationId: 'org-1',
        },
      });

      await bus.publish(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should not deliver event to unsubscribed handler types', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);

      bus.subscribe('QuestionExecuted', handler);

      const event = createDomainEvent<DataSourceCreated>({
        eventType: 'DataSourceCreated',
        aggregateId: 'ds-1',
        aggregateType: 'DataSource',
        payload: {
          name: 'Test DB',
          type: 'postgresql',
          organizationId: 'org-1',
        },
      });

      await bus.publish(event);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should deliver to multiple handlers for same event type', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);

      bus.subscribe('DataSourceCreated', handler1);
      bus.subscribe('DataSourceCreated', handler2);

      const event = createDomainEvent<DataSourceCreated>({
        eventType: 'DataSourceCreated',
        aggregateId: 'ds-1',
        aggregateType: 'DataSource',
        payload: {
          name: 'Test',
          type: 'mysql',
          organizationId: 'org-1',
        },
      });

      await bus.publish(event);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should handle async handlers correctly', async () => {
      const order: string[] = [];

      bus.subscribe('DataSourceCreated', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        order.push('first');
      });

      bus.subscribe('DataSourceCreated', async () => {
        order.push('second');
      });

      const event = createDomainEvent<DataSourceCreated>({
        eventType: 'DataSourceCreated',
        aggregateId: 'ds-1',
        aggregateType: 'DataSource',
        payload: {
          name: 'Test',
          type: 'postgresql',
          organizationId: 'org-1',
        },
      });

      await bus.publish(event);

      // Both should have run (in parallel)
      expect(order).toContain('first');
      expect(order).toContain('second');
    });

    it('should propagate handler errors', async () => {
      bus.subscribe('DataSourceCreated', async () => {
        throw new Error('Handler failed');
      });

      const event = createDomainEvent<DataSourceCreated>({
        eventType: 'DataSourceCreated',
        aggregateId: 'ds-1',
        aggregateType: 'DataSource',
        payload: {
          name: 'Test',
          type: 'postgresql',
          organizationId: 'org-1',
        },
      });

      await expect(bus.publish(event)).rejects.toThrow('Handler failed');
    });

    it('should work with no handlers registered', async () => {
      const event = createDomainEvent<DataSourceCreated>({
        eventType: 'DataSourceCreated',
        aggregateId: 'ds-1',
        aggregateType: 'DataSource',
        payload: {
          name: 'Test',
          type: 'postgresql',
          organizationId: 'org-1',
        },
      });

      await expect(bus.publish(event)).resolves.toBeUndefined();
    });
  });

  describe('subscribe()', () => {
    it('should return a subscription that can be unsubscribed', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);

      const sub = bus.subscribe('DataSourceCreated', handler);

      const event = createDomainEvent<DataSourceCreated>({
        eventType: 'DataSourceCreated',
        aggregateId: 'ds-1',
        aggregateType: 'DataSource',
        payload: {
          name: 'Test',
          type: 'postgresql',
          organizationId: 'org-1',
        },
      });

      await bus.publish(event);
      expect(handler).toHaveBeenCalledTimes(1);

      sub.unsubscribe();

      await bus.publish(event);
      expect(handler).toHaveBeenCalledTimes(1); // not called again
    });

    it('should allow re-subscribing after unsubscribe', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);

      const sub = bus.subscribe('DataSourceCreated', handler);
      sub.unsubscribe();

      bus.subscribe('DataSourceCreated', handler);

      const event = createDomainEvent<DataSourceCreated>({
        eventType: 'DataSourceCreated',
        aggregateId: 'ds-1',
        aggregateType: 'DataSource',
        payload: {
          name: 'Test',
          type: 'postgresql',
          organizationId: 'org-1',
        },
      });

      await bus.publish(event);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribeAll()', () => {
    it('should receive all events regardless of type', async () => {
      const allHandler = vi.fn().mockResolvedValue(undefined);

      bus.subscribeAll(allHandler);

      const event1 = createDomainEvent<DataSourceCreated>({
        eventType: 'DataSourceCreated',
        aggregateId: 'ds-1',
        aggregateType: 'DataSource',
        payload: {
          name: 'Test',
          type: 'postgresql',
          organizationId: 'org-1',
        },
      });

      const event2 = createDomainEvent<QuestionExecuted>({
        eventType: 'QuestionExecuted',
        aggregateId: 'q-1',
        aggregateType: 'Question',
        payload: {
          dataSourceId: 'ds-1',
          executionTimeMs: 100,
          rowCount: 50,
          cached: false,
        },
      });

      await bus.publish(event1);
      await bus.publish(event2);

      expect(allHandler).toHaveBeenCalledTimes(2);
    });

    it('should be unsubscribable', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);

      const sub = bus.subscribeAll(handler);

      const event = createDomainEvent<DataSourceCreated>({
        eventType: 'DataSourceCreated',
        aggregateId: 'ds-1',
        aggregateType: 'DataSource',
        payload: {
          name: 'Test',
          type: 'postgresql',
          organizationId: 'org-1',
        },
      });

      await bus.publish(event);
      expect(handler).toHaveBeenCalledTimes(1);

      sub.unsubscribe();

      await bus.publish(event);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should receive events alongside type-specific handlers', async () => {
      const globalHandler = vi.fn().mockResolvedValue(undefined);
      const specificHandler = vi.fn().mockResolvedValue(undefined);

      bus.subscribeAll(globalHandler);
      bus.subscribe('DataSourceCreated', specificHandler);

      const event = createDomainEvent<DataSourceCreated>({
        eventType: 'DataSourceCreated',
        aggregateId: 'ds-1',
        aggregateType: 'DataSource',
        payload: {
          name: 'Test',
          type: 'postgresql',
          organizationId: 'org-1',
        },
      });

      await bus.publish(event);

      expect(globalHandler).toHaveBeenCalledTimes(1);
      expect(specificHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('clear()', () => {
    it('should remove all handlers', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);

      bus.subscribe('DataSourceCreated', handler1);
      bus.subscribeAll(handler2);

      bus.clear();

      const event = createDomainEvent<DataSourceCreated>({
        eventType: 'DataSourceCreated',
        aggregateId: 'ds-1',
        aggregateType: 'DataSource',
        payload: {
          name: 'Test',
          type: 'postgresql',
          organizationId: 'org-1',
        },
      });

      await bus.publish(event);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('handlerCount()', () => {
    it('should return count for specific event type (including global)', () => {
      bus.subscribe('DataSourceCreated', vi.fn().mockResolvedValue(undefined));
      bus.subscribe('DataSourceCreated', vi.fn().mockResolvedValue(undefined));
      bus.subscribeAll(vi.fn().mockResolvedValue(undefined));

      expect(bus.handlerCount('DataSourceCreated')).toBe(3); // 2 specific + 1 global
    });

    it('should return total count without event type', () => {
      bus.subscribe('DataSourceCreated', vi.fn().mockResolvedValue(undefined));
      bus.subscribe('QuestionExecuted', vi.fn().mockResolvedValue(undefined));
      bus.subscribeAll(vi.fn().mockResolvedValue(undefined));

      expect(bus.handlerCount()).toBe(3); // 1 + 1 + 1 global
    });

    it('should return 0 after clear', () => {
      bus.subscribe('DataSourceCreated', vi.fn().mockResolvedValue(undefined));
      bus.clear();
      expect(bus.handlerCount()).toBe(0);
    });
  });
});

describe('createDomainEvent()', () => {
  it('should auto-generate eventId and occurredAt', () => {
    const event = createDomainEvent<DataSourceCreated>({
      eventType: 'DataSourceCreated',
      aggregateId: 'ds-1',
      aggregateType: 'DataSource',
      payload: {
        name: 'Test',
        type: 'postgresql',
        organizationId: 'org-1',
      },
    });

    expect(event.eventId).toBeDefined();
    expect(event.eventId.length).toBeGreaterThan(0);
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should allow custom eventId and occurredAt', () => {
    const customDate = new Date('2024-01-01');
    const event = createDomainEvent<DataSourceCreated>({
      eventId: 'custom-id',
      occurredAt: customDate,
      eventType: 'DataSourceCreated',
      aggregateId: 'ds-1',
      aggregateType: 'DataSource',
      payload: {
        name: 'Test',
        type: 'postgresql',
        organizationId: 'org-1',
      },
    });

    expect(event.eventId).toBe('custom-id');
    expect(event.occurredAt).toBe(customDate);
  });

  it('should include optional fields', () => {
    const event = createDomainEvent<DataSourceCreated>({
      eventType: 'DataSourceCreated',
      aggregateId: 'ds-1',
      aggregateType: 'DataSource',
      triggeredBy: 'user-1',
      correlationId: 'req-123',
      payload: {
        name: 'Test',
        type: 'postgresql',
        organizationId: 'org-1',
      },
    });

    expect(event.triggeredBy).toBe('user-1');
    expect(event.correlationId).toBe('req-123');
  });
});
