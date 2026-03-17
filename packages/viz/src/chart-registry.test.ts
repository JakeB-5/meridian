import { describe, it, expect, beforeEach } from 'vitest';
import { ChartRegistry } from './chart-registry.js';
import type { ChartProps } from './types.js';

// Dummy chart component for testing
function DummyChart(_props: ChartProps): JSX.Element {
  return null as unknown as JSX.Element;
}

function AnotherChart(_props: ChartProps): JSX.Element {
  return null as unknown as JSX.Element;
}

describe('ChartRegistry', () => {
  let registry: ChartRegistry;

  beforeEach(() => {
    registry = new ChartRegistry();
  });

  describe('register', () => {
    it('should register a chart component for a type', () => {
      registry.register('bar', DummyChart, 'Bar Chart');
      expect(registry.has('bar')).toBe(true);
      expect(registry.get('bar')).toBe(DummyChart);
    });

    it('should store metadata (label, icon)', () => {
      registry.register('bar', DummyChart, 'Bar Chart', 'bar-icon');
      const entry = registry.getEntry('bar');
      expect(entry).toBeDefined();
      expect(entry!.label).toBe('Bar Chart');
      expect(entry!.icon).toBe('bar-icon');
      expect(entry!.type).toBe('bar');
    });

    it('should use type name as default label', () => {
      registry.register('line', DummyChart);
      const entry = registry.getEntry('line');
      expect(entry!.label).toBe('line');
    });

    it('should overwrite previous registration for same type', () => {
      registry.register('bar', DummyChart, 'Old');
      registry.register('bar', AnotherChart, 'New');
      expect(registry.get('bar')).toBe(AnotherChart);
      expect(registry.getEntry('bar')!.label).toBe('New');
    });
  });

  describe('get', () => {
    it('should return undefined for unregistered type', () => {
      expect(registry.get('scatter')).toBeUndefined();
    });

    it('should return the registered component', () => {
      registry.register('pie', DummyChart);
      expect(registry.get('pie')).toBe(DummyChart);
    });
  });

  describe('has', () => {
    it('should return false for unregistered type', () => {
      expect(registry.has('heatmap')).toBe(false);
    });

    it('should return true for registered type', () => {
      registry.register('heatmap', DummyChart);
      expect(registry.has('heatmap')).toBe(true);
    });
  });

  describe('listTypes', () => {
    it('should return empty array when nothing registered', () => {
      expect(registry.listTypes()).toEqual([]);
    });

    it('should return all registered types', () => {
      registry.register('bar', DummyChart);
      registry.register('line', DummyChart);
      registry.register('pie', DummyChart);
      const types = registry.listTypes();
      expect(types).toHaveLength(3);
      expect(types).toContain('bar');
      expect(types).toContain('line');
      expect(types).toContain('pie');
    });
  });

  describe('listEntries', () => {
    it('should return all entries with metadata', () => {
      registry.register('bar', DummyChart, 'Bar Chart');
      registry.register('line', AnotherChart, 'Line Chart');
      const entries = registry.listEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0].type).toBe('bar');
      expect(entries[1].component).toBe(AnotherChart);
    });
  });

  describe('unregister', () => {
    it('should remove a registered type', () => {
      registry.register('bar', DummyChart);
      expect(registry.unregister('bar')).toBe(true);
      expect(registry.has('bar')).toBe(false);
    });

    it('should return false for non-existent type', () => {
      expect(registry.unregister('scatter')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all registrations', () => {
      registry.register('bar', DummyChart);
      registry.register('line', DummyChart);
      registry.clear();
      expect(registry.size).toBe(0);
      expect(registry.listTypes()).toEqual([]);
    });
  });

  describe('size', () => {
    it('should return the number of registered types', () => {
      expect(registry.size).toBe(0);
      registry.register('bar', DummyChart);
      expect(registry.size).toBe(1);
      registry.register('line', DummyChart);
      expect(registry.size).toBe(2);
    });
  });
});
