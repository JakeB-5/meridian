/**
 * Shared test helpers and fixtures for chart tests.
 */

import { vi } from 'vitest';
import type { QueryResult, VisualizationConfig } from '@meridian/shared';

// --- Mock ECharts ---

/**
 * Create a mock ECharts instance with all required methods.
 */
export function createMockEChartsInstance() {
  return {
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    showLoading: vi.fn(),
    hideLoading: vi.fn(),
    getDataURL: vi.fn(() => 'data:image/png;base64,mock'),
    getDom: vi.fn(() => document.createElement('div')),
    getWidth: vi.fn(() => 600),
    getHeight: vi.fn(() => 400),
    clear: vi.fn(),
  };
}

/**
 * Setup echarts mock.
 * Returns the mock init function and instance for assertions.
 */
export function setupEchartsMock() {
  const mockInstance = createMockEChartsInstance();

  vi.mock('echarts', () => ({
    default: {
      init: vi.fn(() => mockInstance),
      graphic: {
        LinearGradient: vi.fn(
          (_x0: number, _y0: number, _x2: number, _y2: number, stops: unknown[]) => ({
            type: 'linear',
            stops,
          }),
        ),
      },
    },
    init: vi.fn(() => mockInstance),
    graphic: {
      LinearGradient: vi.fn(
        (_x0: number, _y0: number, _x2: number, _y2: number, stops: unknown[]) => ({
          type: 'linear',
          stops,
        }),
      ),
    },
  }));

  return { mockInstance };
}

// --- Mock ResizeObserver ---

export function setupResizeObserverMock() {
  const mockObserve = vi.fn();
  const mockDisconnect = vi.fn();

  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: mockObserve,
    disconnect: mockDisconnect,
    unobserve: vi.fn(),
  }));

  return { mockObserve, mockDisconnect };
}

// --- Test Data Fixtures ---

export function makeBarData(): QueryResult {
  return {
    columns: [
      { name: 'category', type: 'varchar', nullable: false },
      { name: 'sales', type: 'integer', nullable: false },
    ],
    rows: [
      { category: 'Electronics', sales: 450 },
      { category: 'Clothing', sales: 300 },
      { category: 'Food', sales: 200 },
    ],
    rowCount: 3,
    executionTimeMs: 5,
    truncated: false,
  };
}

export function makeMultiSeriesData(): QueryResult {
  return {
    columns: [
      { name: 'month', type: 'varchar', nullable: false },
      { name: 'revenue', type: 'integer', nullable: false },
      { name: 'cost', type: 'integer', nullable: false },
    ],
    rows: [
      { month: 'Jan', revenue: 1000, cost: 400 },
      { month: 'Feb', revenue: 1500, cost: 600 },
      { month: 'Mar', revenue: 1200, cost: 500 },
    ],
    rowCount: 3,
    executionTimeMs: 10,
    truncated: false,
  };
}

export function makeLineData(): QueryResult {
  return {
    columns: [
      { name: 'date', type: 'varchar', nullable: false },
      { name: 'visitors', type: 'integer', nullable: false },
    ],
    rows: [
      { date: 'Mon', visitors: 120 },
      { date: 'Tue', visitors: 200 },
      { date: 'Wed', visitors: 150 },
      { date: 'Thu', visitors: 300 },
      { date: 'Fri', visitors: 280 },
    ],
    rowCount: 5,
    executionTimeMs: 3,
    truncated: false,
  };
}

export function makePieData(): QueryResult {
  return {
    columns: [
      { name: 'browser', type: 'varchar', nullable: false },
      { name: 'share', type: 'float', nullable: false },
    ],
    rows: [
      { browser: 'Chrome', share: 65 },
      { browser: 'Firefox', share: 15 },
      { browser: 'Safari', share: 12 },
      { browser: 'Edge', share: 8 },
    ],
    rowCount: 4,
    executionTimeMs: 2,
    truncated: false,
  };
}

export function makeKpiData(): QueryResult {
  return {
    columns: [
      { name: 'total_revenue', type: 'float', nullable: false },
    ],
    rows: [{ total_revenue: 42567.89 }],
    rowCount: 1,
    executionTimeMs: 1,
    truncated: false,
  };
}

export function makeTableData(): QueryResult {
  return {
    columns: [
      { name: 'name', type: 'varchar', nullable: false },
      { name: 'age', type: 'integer', nullable: false },
      { name: 'salary', type: 'float', nullable: false },
      { name: 'department', type: 'varchar', nullable: false },
    ],
    rows: [
      { name: 'Alice', age: 30, salary: 75000, department: 'Engineering' },
      { name: 'Bob', age: 25, salary: 65000, department: 'Design' },
      { name: 'Charlie', age: 35, salary: 85000, department: 'Engineering' },
      { name: 'Diana', age: 28, salary: 70000, department: 'Marketing' },
    ],
    rowCount: 4,
    executionTimeMs: 3,
    truncated: false,
  };
}

export function makeEmptyData(): QueryResult {
  return {
    columns: [
      { name: 'x', type: 'varchar', nullable: false },
      { name: 'y', type: 'integer', nullable: false },
    ],
    rows: [],
    rowCount: 0,
    executionTimeMs: 0,
    truncated: false,
  };
}

// --- Config Helpers ---

export function barConfig(overrides?: Partial<VisualizationConfig>): VisualizationConfig {
  return { type: 'bar', ...overrides };
}

export function lineConfig(overrides?: Partial<VisualizationConfig>): VisualizationConfig {
  return { type: 'line', ...overrides };
}

export function pieConfig(overrides?: Partial<VisualizationConfig>): VisualizationConfig {
  return { type: 'pie', ...overrides };
}

export function tableConfig(overrides?: Partial<VisualizationConfig>): VisualizationConfig {
  return { type: 'table', ...overrides };
}

export function numberConfig(overrides?: Partial<VisualizationConfig>): VisualizationConfig {
  return { type: 'number', ...overrides };
}
