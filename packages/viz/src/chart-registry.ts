/**
 * Chart Registry — Central registry for all chart type components.
 *
 * Charts register themselves with the registry, and the ChartRenderer
 * dynamically looks up the right component based on VisualizationConfig.type.
 */

import type { ChartType } from '@meridian/shared';
import type { ChartProps, ChartRegistryEntry } from './types.js';

/**
 * Registry that maps chart types to their React components.
 * Supports dynamic registration for plugin charts.
 */
export class ChartRegistry {
  private readonly entries = new Map<ChartType, ChartRegistryEntry>();

  /**
   * Register a chart component for a given type.
   * Overwrites any previous registration for the same type.
   */
  register(
    type: ChartType,
    component: React.ComponentType<ChartProps>,
    label?: string,
    icon?: string,
  ): void {
    this.entries.set(type, {
      type,
      component,
      label: label ?? type,
      icon,
    });
  }

  /**
   * Get the component for a chart type.
   * Returns undefined if not registered.
   */
  get(type: ChartType): React.ComponentType<ChartProps> | undefined {
    return this.entries.get(type)?.component;
  }

  /**
   * Get the full registry entry (component + metadata) for a type.
   */
  getEntry(type: ChartType): ChartRegistryEntry | undefined {
    return this.entries.get(type);
  }

  /**
   * Check if a chart type is registered.
   */
  has(type: ChartType): boolean {
    return this.entries.has(type);
  }

  /**
   * List all registered chart types.
   */
  listTypes(): ChartType[] {
    return Array.from(this.entries.keys());
  }

  /**
   * List all registered entries with metadata.
   */
  listEntries(): ChartRegistryEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Remove a chart type registration.
   */
  unregister(type: ChartType): boolean {
    return this.entries.delete(type);
  }

  /**
   * Clear all registrations.
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Number of registered chart types.
   */
  get size(): number {
    return this.entries.size;
  }
}

/**
 * Default singleton registry.
 * All built-in charts register here on import.
 */
export const defaultRegistry = new ChartRegistry();
