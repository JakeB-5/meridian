import { describe, it, expect } from 'vitest';
import { createQuestionSchema, updateQuestionSchema, visualizationConfigSchema } from './question.schema.js';

describe('visualizationConfigSchema', () => {
  it('validates a basic config', () => {
    const result = visualizationConfigSchema.safeParse({
      type: 'bar',
      title: 'Revenue by Month',
    });
    expect(result.success).toBe(true);
  });

  it('validates all chart types', () => {
    const types = [
      'bar', 'line', 'area', 'pie', 'donut', 'scatter', 'table', 'number',
      'gauge', 'funnel', 'treemap', 'heatmap', 'map', 'sankey', 'radar',
      'waterfall', 'boxplot', 'histogram', 'combo',
    ];
    for (const type of types) {
      expect(visualizationConfigSchema.safeParse({ type }).success).toBe(true);
    }
  });

  it('rejects invalid chart type', () => {
    expect(visualizationConfigSchema.safeParse({ type: 'sparkline' }).success).toBe(false);
  });

  it('validates full config with axes and legend', () => {
    const result = visualizationConfigSchema.safeParse({
      type: 'line',
      title: 'Trend',
      xAxis: { label: 'Date', format: 'yyyy-MM' },
      yAxis: { label: 'Revenue', min: 0 },
      legend: { show: true, position: 'bottom' },
      tooltip: true,
      stacked: false,
      colors: ['#ff0000', '#00ff00'],
    });
    expect(result.success).toBe(true);
  });
});

describe('createQuestionSchema', () => {
  const visualQuestion = {
    name: 'Revenue by Month',
    type: 'visual' as const,
    dataSourceId: 'ds-1',
    query: {
      dataSourceId: 'ds-1',
      table: 'orders',
      columns: ['month', 'revenue'],
      filters: [],
      sorts: [],
      aggregations: [{ column: 'revenue', aggregation: 'sum' as const }],
      groupBy: ['month'],
    },
    visualization: { type: 'bar' as const },
    organizationId: 'org-1',
  };

  const sqlQuestion = {
    name: 'Custom Query',
    type: 'sql' as const,
    dataSourceId: 'ds-1',
    query: 'SELECT * FROM orders LIMIT 100',
    visualization: { type: 'table' as const },
    organizationId: 'org-1',
  };

  it('validates a visual question', () => {
    expect(createQuestionSchema.safeParse(visualQuestion).success).toBe(true);
  });

  it('validates a SQL question', () => {
    expect(createQuestionSchema.safeParse(sqlQuestion).success).toBe(true);
  });

  it('requires name', () => {
    expect(createQuestionSchema.safeParse({ ...visualQuestion, name: '' }).success).toBe(false);
  });

  it('requires dataSourceId', () => {
    const { dataSourceId: _, ...without } = visualQuestion;
    expect(createQuestionSchema.safeParse(without).success).toBe(false);
  });

  it('validates SQL length limit', () => {
    const longSql = 'SELECT ' + 'x'.repeat(50_001);
    expect(createQuestionSchema.safeParse({ ...sqlQuestion, query: longSql }).success).toBe(false);
  });
});

describe('updateQuestionSchema', () => {
  it('allows partial updates', () => {
    expect(updateQuestionSchema.safeParse({ name: 'Updated Name' }).success).toBe(true);
    expect(updateQuestionSchema.safeParse({ visualization: { type: 'pie' } }).success).toBe(true);
    expect(updateQuestionSchema.safeParse({}).success).toBe(true);
  });
});
