import { useState, useCallback, useMemo } from 'react';
import { Select } from '@/components/common/select';
import { Tabs, TabPanel } from '@/components/common/tabs';
import { cn } from '@/lib/utils';
import { CHART_TYPE_LABELS } from '@/lib/constants';
import type { VisualizationConfig, ChartType, AxisConfig, LegendConfig, QueryResult } from '@/api/types';

// ── Types ────────────────────────────────────────────────────────────

interface ChartConfigProps {
  config: VisualizationConfig;
  onChange: (config: VisualizationConfig) => void;
  columns: string[];
  result?: QueryResult | null;
}

// ── Color palettes ───────────────────────────────────────────────────

const COLOR_PALETTES: Record<string, string[]> = {
  default: ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'],
  ocean: ['#0ea5e9', '#06b6d4', '#14b8a6', '#0d9488', '#059669', '#10b981', '#34d399', '#6ee7b7'],
  sunset: ['#f97316', '#fb923c', '#fbbf24', '#facc15', '#ef4444', '#f87171', '#e11d48', '#be123c'],
  forest: ['#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac', '#065f46', '#047857', '#059669'],
  neon: ['#a855f7', '#d946ef', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6'],
  pastel: ['#93c5fd', '#86efac', '#fde68a', '#fca5a5', '#c4b5fd', '#f9a8d4', '#67e8f9', '#fdba74'],
  monochrome: ['#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#f1f5f9'],
};

// ── Chart type categories ────────────────────────────────────────────

const chartTypeCategories: Array<{
  label: string;
  types: ChartType[];
}> = [
  {
    label: 'Basic',
    types: ['bar', 'line', 'area', 'pie', 'donut'],
  },
  {
    label: 'Statistical',
    types: ['scatter', 'histogram', 'boxplot', 'heatmap'],
  },
  {
    label: 'Display',
    types: ['table', 'number', 'gauge', 'funnel'],
  },
  {
    label: 'Advanced',
    types: ['treemap', 'radar', 'sankey', 'waterfall', 'combo', 'map'],
  },
];

// ── Component ────────────────────────────────────────────────────────

export function ChartConfig({ config, onChange, columns, result }: ChartConfigProps) {
  const [activeTab, setActiveTab] = useState('type');

  const tabs = [
    { id: 'type', label: 'Chart Type' },
    { id: 'data', label: 'Data Mapping' },
    { id: 'style', label: 'Style' },
    { id: 'advanced', label: 'Advanced' },
  ];

  const columnOptions = columns.map((c) => ({ value: c, label: c }));

  const update = useCallback(
    (partial: Partial<VisualizationConfig>) => {
      onChange({ ...config, ...partial });
    },
    [config, onChange],
  );

  const updateAxis = useCallback(
    (axis: 'xAxis' | 'yAxis', partial: Partial<AxisConfig>) => {
      onChange({
        ...config,
        [axis]: { ...config[axis], ...partial },
      });
    },
    [config, onChange],
  );

  const updateLegend = useCallback(
    (partial: Partial<LegendConfig>) => {
      onChange({
        ...config,
        legend: { show: config.legend?.show ?? true, position: config.legend?.position ?? 'bottom', ...partial },
      });
    },
    [config, onChange],
  );

  const needsAxes = !['table', 'number', 'pie', 'donut', 'gauge', 'funnel', 'treemap', 'radar'].includes(config.type);
  const canStack = ['bar', 'area', 'line'].includes(config.type);

  return (
    <div className="space-y-4">
      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} variant="pills" />

      {/* Chart Type Tab */}
      {activeTab === 'type' && (
        <div className="space-y-6">
          {chartTypeCategories.map((category) => (
            <div key={category.label}>
              <h4
                className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {category.label}
              </h4>
              <div className="grid grid-cols-5 gap-2">
                {category.types.map((type) => (
                  <button
                    key={type}
                    onClick={() => update({ type })}
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-2.5 rounded-lg border text-xs transition-all',
                      config.type === type
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] font-medium'
                        : 'border-[var(--color-border)] hover:border-[var(--color-primary)]',
                    )}
                    style={{
                      color: config.type === type ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    }}
                  >
                    <ChartTypeIcon type={type} active={config.type === type} />
                    <span className="truncate w-full text-center">
                      {CHART_TYPE_LABELS[type] ?? type}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Data Mapping Tab */}
      {activeTab === 'data' && (
        <div className="space-y-4">
          {/* Title */}
          <div>
            <label htmlFor="chart-title" className="label">Chart Title</label>
            <input
              id="chart-title"
              type="text"
              value={config.title ?? ''}
              onChange={(e) => update({ title: e.target.value || undefined })}
              className="input"
              placeholder="Optional chart title"
            />
          </div>

          {/* X-Axis mapping */}
          {needsAxes && (
            <div>
              <label className="label">X-Axis Column</label>
              <Select
                value={config.xAxis?.label ?? ''}
                onChange={(val) => updateAxis('xAxis', { label: val })}
                options={columnOptions}
                placeholder="Select column for X-axis..."
              />
            </div>
          )}

          {/* Y-Axis mapping */}
          {needsAxes && (
            <div>
              <label className="label">Y-Axis Column</label>
              <Select
                value={config.yAxis?.label ?? ''}
                onChange={(val) => updateAxis('yAxis', { label: val })}
                options={columnOptions}
                placeholder="Select column for Y-axis..."
              />
            </div>
          )}

          {/* Axis labels */}
          {needsAxes && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="x-label" className="label">X-Axis Label</label>
                <input
                  id="x-label"
                  type="text"
                  value={config.xAxis?.format ?? ''}
                  onChange={(e) => updateAxis('xAxis', { format: e.target.value || undefined })}
                  className="input"
                  placeholder="Custom label..."
                />
              </div>
              <div>
                <label htmlFor="y-label" className="label">Y-Axis Label</label>
                <input
                  id="y-label"
                  type="text"
                  value={config.yAxis?.format ?? ''}
                  onChange={(e) => updateAxis('yAxis', { format: e.target.value || undefined })}
                  className="input"
                  placeholder="Custom label..."
                />
              </div>
            </div>
          )}

          {/* Axis range */}
          {needsAxes && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="y-min" className="label">Y-Axis Min</label>
                <input
                  id="y-min"
                  type="number"
                  value={config.yAxis?.min ?? ''}
                  onChange={(e) => updateAxis('yAxis', { min: e.target.value ? Number(e.target.value) : undefined })}
                  className="input"
                  placeholder="Auto"
                />
              </div>
              <div>
                <label htmlFor="y-max" className="label">Y-Axis Max</label>
                <input
                  id="y-max"
                  type="number"
                  value={config.yAxis?.max ?? ''}
                  onChange={(e) => updateAxis('yAxis', { max: e.target.value ? Number(e.target.value) : undefined })}
                  className="input"
                  placeholder="Auto"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Style Tab */}
      {activeTab === 'style' && (
        <div className="space-y-4">
          {/* Color palette */}
          <div>
            <label className="label">Color Palette</label>
            <div className="space-y-2">
              {Object.entries(COLOR_PALETTES).map(([name, palette]) => {
                const isSelected =
                  config.colors && config.colors.length > 0
                    ? config.colors[0] === palette[0]
                    : name === 'default';
                return (
                  <button
                    key={name}
                    onClick={() => update({ colors: palette })}
                    className={cn(
                      'flex items-center gap-3 w-full p-2 rounded-lg border transition-all',
                      isSelected
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                        : 'border-[var(--color-border)] hover:border-[var(--color-primary)]',
                    )}
                  >
                    <div className="flex gap-1">
                      {palette.slice(0, 8).map((color, i) => (
                        <div
                          key={i}
                          className="h-5 w-5 rounded"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <span
                      className="text-xs font-medium capitalize"
                      style={{ color: isSelected ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}
                    >
                      {name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stacked toggle */}
          {canStack && (
            <div className="flex items-center gap-2">
              <input
                id="chart-stacked"
                type="checkbox"
                checked={config.stacked ?? false}
                onChange={(e) => update({ stacked: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="chart-stacked" className="text-sm" style={{ color: 'var(--color-text)' }}>
                Stacked
              </label>
            </div>
          )}

          {/* Tooltip toggle */}
          <div className="flex items-center gap-2">
            <input
              id="chart-tooltip"
              type="checkbox"
              checked={config.tooltip ?? true}
              onChange={(e) => update({ tooltip: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="chart-tooltip" className="text-sm" style={{ color: 'var(--color-text)' }}>
              Show Tooltip
            </label>
          </div>

          {/* Legend */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                id="chart-legend"
                type="checkbox"
                checked={config.legend?.show ?? true}
                onChange={(e) => updateLegend({ show: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="chart-legend" className="text-sm" style={{ color: 'var(--color-text)' }}>
                Show Legend
              </label>
            </div>

            {config.legend?.show && (
              <div>
                <label className="label">Legend Position</label>
                <div className="flex gap-2">
                  {(['top', 'bottom', 'left', 'right'] as const).map((pos) => (
                    <button
                      key={pos}
                      onClick={() => updateLegend({ position: pos })}
                      className={cn(
                        'btn btn-sm flex-1 capitalize',
                        config.legend?.position === pos ? 'btn-primary' : 'btn-secondary',
                      )}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Advanced Tab */}
      {activeTab === 'advanced' && (
        <div className="space-y-4">
          <div>
            <label className="label">Custom Options (JSON)</label>
            <textarea
              value={config.options ? JSON.stringify(config.options, null, 2) : ''}
              onChange={(e) => {
                try {
                  const parsed = e.target.value.trim() ? JSON.parse(e.target.value) : undefined;
                  update({ options: parsed });
                } catch {
                  // Invalid JSON — ignore until valid
                }
              }}
              className="input font-mono text-xs"
              rows={8}
              placeholder='{\n  "animation": true,\n  "smooth": false\n}'
              style={{ resize: 'vertical' }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
              Pass custom ECharts options. Must be valid JSON.
            </p>
          </div>

          {/* Data summary */}
          {result && (
            <div
              className="p-3 rounded-lg"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
              }}
            >
              <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
                Data Summary
              </h4>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p style={{ color: 'var(--color-text-tertiary)' }}>Rows</p>
                  <p className="font-medium" style={{ color: 'var(--color-text)' }}>
                    {result.rowCount.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p style={{ color: 'var(--color-text-tertiary)' }}>Columns</p>
                  <p className="font-medium" style={{ color: 'var(--color-text)' }}>
                    {result.columns.length}
                  </p>
                </div>
                <div>
                  <p style={{ color: 'var(--color-text-tertiary)' }}>Truncated</p>
                  <p className="font-medium" style={{ color: 'var(--color-text)' }}>
                    {result.truncated ? 'Yes' : 'No'}
                  </p>
                </div>
              </div>
              <div className="mt-2">
                <p style={{ color: 'var(--color-text-tertiary)' }}>Column types:</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {result.columns.map((col) => (
                    <span
                      key={col.name}
                      className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                      style={{
                        backgroundColor: 'var(--color-bg-tertiary)',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      {col.name}:{col.type}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Chart Type Icon ──────────────────────────────────────────────────

function ChartTypeIcon({ type, active }: { type: ChartType; active: boolean }) {
  const color = active ? 'var(--color-primary)' : 'var(--color-text-tertiary)';

  // Simple SVG representations for each chart type
  switch (type) {
    case 'bar':
      return (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill={color}>
          <rect x="4" y="10" width="4" height="10" rx="1" />
          <rect x="10" y="4" width="4" height="16" rx="1" />
          <rect x="16" y="8" width="4" height="12" rx="1" />
        </svg>
      );
    case 'line':
      return (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <polyline points="4,18 8,10 12,14 16,6 20,12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'area':
      return (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill={color} opacity="0.3">
          <polygon points="4,20 4,14 8,8 12,12 16,4 20,10 20,20" />
          <polyline points="4,14 8,8 12,12 16,4 20,10" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="1" />
        </svg>
      );
    case 'pie':
    case 'donut':
      return (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4 L12 12 L19.5 8.5" />
        </svg>
      );
    case 'scatter':
      return (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill={color}>
          <circle cx="6" cy="14" r="2" />
          <circle cx="10" cy="8" r="2" />
          <circle cx="14" cy="16" r="2" />
          <circle cx="18" cy="6" r="2" />
          <circle cx="12" cy="12" r="1.5" />
        </svg>
      );
    case 'number':
      return (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill={color}>
          <text x="12" y="16" textAnchor="middle" fontSize="14" fontWeight="bold">42</text>
        </svg>
      );
    default:
      return (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill={color} opacity="0.5">
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
      );
  }
}
