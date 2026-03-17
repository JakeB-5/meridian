import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JobRegistry } from './job-registry.js';
import { HandlerNotRegisteredError } from './errors.js';
import type { JobHandler } from './job-registry.js';
import type { JobType } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHandler(returnValue: unknown = 'result'): JobHandler {
  return {
    handle: vi.fn(async (_data, _progress) => returnValue),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JobRegistry', () => {
  let registry: JobRegistry;

  beforeEach(() => {
    registry = new JobRegistry();
  });

  // ── register / getHandler ──────────────────────────────────────────────────

  describe('register() and getHandler()', () => {
    it('registers a handler and retrieves it by type', () => {
      const handler = makeHandler();
      registry.register('query_refresh', handler);
      expect(registry.getHandler('query_refresh')).toBe(handler);
    });

    it('returns undefined for unregistered type', () => {
      expect(registry.getHandler('query_refresh')).toBeUndefined();
    });

    it('overwrites previous handler on duplicate registration', () => {
      const first = makeHandler('first');
      const second = makeHandler('second');
      registry.register('cache_cleanup', first);
      registry.register('cache_cleanup', second);
      expect(registry.getHandler('cache_cleanup')).toBe(second);
    });

    it('supports registering multiple distinct types', () => {
      const types: JobType[] = ['query_refresh', 'cache_cleanup', 'health_check'];
      for (const t of types) {
        registry.register(t, makeHandler(t));
      }
      for (const t of types) {
        expect(registry.getHandler(t)).toBeDefined();
      }
    });
  });

  // ── requireHandler ─────────────────────────────────────────────────────────

  describe('requireHandler()', () => {
    it('returns the handler when registered', () => {
      const handler = makeHandler();
      registry.register('health_check', handler);
      expect(registry.requireHandler('health_check')).toBe(handler);
    });

    it('throws HandlerNotRegisteredError for unregistered type', () => {
      expect(() => registry.requireHandler('export_csv')).toThrow(HandlerNotRegisteredError);
    });

    it('includes the job type in the error', () => {
      try {
        registry.requireHandler('export_pdf');
      } catch (err) {
        expect(err).toBeInstanceOf(HandlerNotRegisteredError);
        expect((err as HandlerNotRegisteredError).message).toContain('export_pdf');
      }
    });
  });

  // ── listRegistered ─────────────────────────────────────────────────────────

  describe('listRegistered()', () => {
    it('returns empty array when no handlers registered', () => {
      expect(registry.listRegistered()).toEqual([]);
    });

    it('lists all registered types', () => {
      registry.register('query_refresh', makeHandler());
      registry.register('health_check', makeHandler());
      const types = registry.listRegistered();
      expect(types).toContain('query_refresh');
      expect(types).toContain('health_check');
      expect(types).toHaveLength(2);
    });

    it('does not include types that have been unregistered', () => {
      registry.register('cache_cleanup', makeHandler());
      registry.unregister('cache_cleanup');
      expect(registry.listRegistered()).not.toContain('cache_cleanup');
    });
  });

  // ── unregister ─────────────────────────────────────────────────────────────

  describe('unregister()', () => {
    it('removes a registered handler', () => {
      registry.register('dashboard_refresh', makeHandler());
      registry.unregister('dashboard_refresh');
      expect(registry.getHandler('dashboard_refresh')).toBeUndefined();
    });

    it('returns true when handler existed', () => {
      registry.register('export_csv', makeHandler());
      expect(registry.unregister('export_csv')).toBe(true);
    });

    it('returns false when handler did not exist', () => {
      expect(registry.unregister('export_pdf')).toBe(false);
    });
  });

  // ── clear ──────────────────────────────────────────────────────────────────

  describe('clear()', () => {
    it('removes all registered handlers', () => {
      registry.register('query_refresh', makeHandler());
      registry.register('health_check', makeHandler());
      registry.clear();
      expect(registry.listRegistered()).toHaveLength(0);
    });
  });

  // ── handler invocation ─────────────────────────────────────────────────────

  describe('handler invocation', () => {
    it('handler.handle is called with data and progress callback', async () => {
      const handler = makeHandler('done');
      registry.register('query_refresh', handler);

      const progressFn = vi.fn();
      const result = await registry.requireHandler('query_refresh').handle({ foo: 'bar' }, progressFn);

      expect(handler.handle).toHaveBeenCalledWith({ foo: 'bar' }, progressFn);
      expect(result).toBe('done');
    });
  });
});
