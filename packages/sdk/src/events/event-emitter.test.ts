// Tests for the typed EventEmitter

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from './event-emitter.js';
import type { SdkEventMap } from './event-emitter.js';

function makeEmitter(): EventEmitter {
  return new EventEmitter();
}

describe('EventEmitter', () => {
  describe('on / emit', () => {
    it('calls a registered listener when event is emitted', () => {
      const emitter = makeEmitter();
      const handler = vi.fn();
      emitter.on('load', handler);
      emitter.emit('load', { timestamp: 1000 });
      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith({ timestamp: 1000 });
    });

    it('calls multiple listeners in registration order', () => {
      const emitter = makeEmitter();
      const order: number[] = [];
      emitter.on('load', () => order.push(1));
      emitter.on('load', () => order.push(2));
      emitter.on('load', () => order.push(3));
      emitter.emit('load', { timestamp: 0 });
      expect(order).toEqual([1, 2, 3]);
    });

    it('returns true when at least one listener exists', () => {
      const emitter = makeEmitter();
      emitter.on('load', vi.fn());
      expect(emitter.emit('load', { timestamp: 0 })).toBe(true);
    });

    it('returns false when no listeners are registered', () => {
      const emitter = makeEmitter();
      expect(emitter.emit('load', { timestamp: 0 })).toBe(false);
    });

    it('does not cross-contaminate events of different types', () => {
      const emitter = makeEmitter();
      const loadHandler = vi.fn();
      const errorHandler = vi.fn();
      emitter.on('load', loadHandler);
      emitter.on('error', errorHandler);

      emitter.emit('load', { timestamp: 1 });

      expect(loadHandler).toHaveBeenCalledOnce();
      expect(errorHandler).not.toHaveBeenCalled();
    });

    it('passes typed payload to filter-change handler', () => {
      const emitter = makeEmitter();
      const payload: SdkEventMap['filter-change'] = {
        key: 'region',
        value: 'EU',
        allFilters: { region: 'EU' },
      };
      const handler = vi.fn();
      emitter.on('filter-change', handler);
      emitter.emit('filter-change', payload);
      expect(handler).toHaveBeenCalledWith(payload);
    });

    it('passes typed payload to data-update handler', () => {
      const emitter = makeEmitter();
      const handler = vi.fn();
      emitter.on('data-update', handler);
      const result = {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: 10,
        truncated: false,
      };
      emitter.emit('data-update', { result, timestamp: 999 });
      expect(handler).toHaveBeenCalledWith({ result, timestamp: 999 });
    });

    it('swallows exceptions thrown by individual handlers and continues', () => {
      const emitter = makeEmitter();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const badHandler = vi.fn(() => {
        throw new Error('handler blew up');
      });
      const goodHandler = vi.fn();

      emitter.on('load', badHandler);
      emitter.on('load', goodHandler);

      // Should not throw
      expect(() => emitter.emit('load', { timestamp: 0 })).not.toThrow();
      expect(goodHandler).toHaveBeenCalledOnce();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe('off', () => {
    it('removes a previously registered listener', () => {
      const emitter = makeEmitter();
      const handler = vi.fn();
      emitter.on('load', handler);
      emitter.off('load', handler);
      emitter.emit('load', { timestamp: 0 });
      expect(handler).not.toHaveBeenCalled();
    });

    it('does not affect other listeners when one is removed', () => {
      const emitter = makeEmitter();
      const h1 = vi.fn();
      const h2 = vi.fn();
      emitter.on('load', h1);
      emitter.on('load', h2);
      emitter.off('load', h1);
      emitter.emit('load', { timestamp: 0 });
      expect(h1).not.toHaveBeenCalled();
      expect(h2).toHaveBeenCalledOnce();
    });

    it('is a no-op for an unregistered handler', () => {
      const emitter = makeEmitter();
      const handler = vi.fn();
      // Should not throw
      expect(() => emitter.off('load', handler)).not.toThrow();
    });

    it('is a no-op for an event with no listeners', () => {
      const emitter = makeEmitter();
      const handler = vi.fn();
      expect(() => emitter.off('error', handler)).not.toThrow();
    });

    it('cleans up empty listener sets', () => {
      const emitter = makeEmitter();
      const handler = vi.fn();
      emitter.on('load', handler);
      emitter.off('load', handler);
      expect(emitter.listenerCount('load')).toBe(0);
      expect(emitter.eventNames()).not.toContain('load');
    });
  });

  describe('once', () => {
    it('fires the handler exactly once', () => {
      const emitter = makeEmitter();
      const handler = vi.fn();
      emitter.once('load', handler);

      emitter.emit('load', { timestamp: 1 });
      emitter.emit('load', { timestamp: 2 });
      emitter.emit('load', { timestamp: 3 });

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith({ timestamp: 1 });
    });

    it('can be removed before firing via off', () => {
      const emitter = makeEmitter();
      const handler = vi.fn();
      emitter.once('load', handler);
      emitter.off('load', handler);
      emitter.emit('load', { timestamp: 1 });
      expect(handler).not.toHaveBeenCalled();
    });

    it('leaves other listeners intact after firing', () => {
      const emitter = makeEmitter();
      const onceHandler = vi.fn();
      const persistentHandler = vi.fn();
      emitter.once('load', onceHandler);
      emitter.on('load', persistentHandler);

      emitter.emit('load', { timestamp: 1 });
      emitter.emit('load', { timestamp: 2 });

      expect(onceHandler).toHaveBeenCalledOnce();
      expect(persistentHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('removeAllListeners', () => {
    it('removes all listeners for a specific event', () => {
      const emitter = makeEmitter();
      emitter.on('load', vi.fn());
      emitter.on('load', vi.fn());
      emitter.on('error', vi.fn());

      emitter.removeAllListeners('load');

      expect(emitter.listenerCount('load')).toBe(0);
      expect(emitter.listenerCount('error')).toBe(1);
    });

    it('removes all listeners for all events when called without argument', () => {
      const emitter = makeEmitter();
      emitter.on('load', vi.fn());
      emitter.on('error', vi.fn());
      emitter.on('filter-change', vi.fn());

      emitter.removeAllListeners();

      expect(emitter.eventNames()).toHaveLength(0);
    });
  });

  describe('listenerCount', () => {
    it('returns 0 for an event with no listeners', () => {
      const emitter = makeEmitter();
      expect(emitter.listenerCount('load')).toBe(0);
    });

    it('returns the correct count after adding listeners', () => {
      const emitter = makeEmitter();
      emitter.on('load', vi.fn());
      emitter.on('load', vi.fn());
      expect(emitter.listenerCount('load')).toBe(2);
    });

    it('decrements after off', () => {
      const emitter = makeEmitter();
      const h = vi.fn();
      emitter.on('load', h);
      emitter.on('load', vi.fn());
      emitter.off('load', h);
      expect(emitter.listenerCount('load')).toBe(1);
    });
  });

  describe('eventNames', () => {
    it('returns empty array when no listeners are registered', () => {
      const emitter = makeEmitter();
      expect(emitter.eventNames()).toEqual([]);
    });

    it('returns all event names with active listeners', () => {
      const emitter = makeEmitter();
      emitter.on('load', vi.fn());
      emitter.on('error', vi.fn());
      emitter.on('click', vi.fn());

      const names = emitter.eventNames();
      expect(names).toContain('load');
      expect(names).toContain('error');
      expect(names).toContain('click');
      expect(names).toHaveLength(3);
    });
  });

  describe('chaining', () => {
    it('on() returns the emitter for chaining', () => {
      const emitter = makeEmitter();
      const result = emitter.on('load', vi.fn());
      expect(result).toBe(emitter);
    });

    it('off() returns the emitter for chaining', () => {
      const emitter = makeEmitter();
      const h = vi.fn();
      emitter.on('load', h);
      const result = emitter.off('load', h);
      expect(result).toBe(emitter);
    });

    it('once() returns the emitter for chaining', () => {
      const emitter = makeEmitter();
      const result = emitter.once('load', vi.fn());
      expect(result).toBe(emitter);
    });

    it('removeAllListeners() returns the emitter for chaining', () => {
      const emitter = makeEmitter();
      const result = emitter.removeAllListeners();
      expect(result).toBe(emitter);
    });
  });

  describe('all SDK event types', () => {
    it('emits and receives all five event types', () => {
      const emitter = makeEmitter();
      const handlers = {
        load: vi.fn(),
        error: vi.fn(),
        'filter-change': vi.fn(),
        'data-update': vi.fn(),
        click: vi.fn(),
      } as const;

      emitter.on('load', handlers.load);
      emitter.on('error', handlers.error);
      emitter.on('filter-change', handlers['filter-change']);
      emitter.on('data-update', handlers['data-update']);
      emitter.on('click', handlers.click);

      emitter.emit('load', { timestamp: 1 });
      emitter.emit('error', {
        error: new Error('test'),
        code: 'TEST',
        timestamp: 2,
      });
      emitter.emit('filter-change', { key: 'k', value: 'v', allFilters: {} });
      emitter.emit('data-update', {
        result: { columns: [], rows: [], rowCount: 0, executionTimeMs: 0, truncated: false },
        timestamp: 3,
      });
      emitter.emit('click', { target: 'card', data: {} });

      for (const handler of Object.values(handlers)) {
        expect(handler).toHaveBeenCalledOnce();
      }
    });
  });
});
