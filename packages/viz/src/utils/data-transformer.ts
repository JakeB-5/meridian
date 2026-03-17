/**
 * Transform QueryResult data into ECharts-compatible formats.
 *
 * This module bridges the gap between Meridian's QueryResult (rows + columns)
 * and the various data shapes that ECharts series/datasets expect.
 */

import type { QueryResult, ColumnInfo, VisualizationConfig } from '@meridian/shared';
import { isDateType, isNumericType, toDate } from './format.js';

// --- Core Types ---

/** A single series extracted from query data */
export interface SeriesData {
  name: string;
  values: (number | null)[];
}

/** Category axis labels paired with series values */
export interface CategorySeriesData {
  categories: string[];
  series: SeriesData[];
}

/** X-Y paired data for scatter/line charts */
export interface XYSeriesData {
  name: string;
  points: Array<{ x: number | string; y: number; size?: number; label?: string }>;
}

/** Pie/donut slice data */
export interface PieSliceData {
  name: string;
  value: number;
}

/** Hierarchical node for treemaps */
export interface TreeNode {
  name: string;
  value: number;
  children?: TreeNode[];
}

/** Heatmap triple */
export interface HeatmapPoint {
  x: number;
  y: number;
  value: number;
}

// --- Column Analysis ---

/**
 * Detect column roles from QueryResult columns.
 * Returns indices of the first dimension (category) and measure (numeric) columns.
 */
export function detectColumnRoles(columns: ColumnInfo[]): {
  dimensions: number[];
  measures: number[];
} {
  const dimensions: number[] = [];
  const measures: number[] = [];

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    if (isNumericType(col.type)) {
      measures.push(i);
    } else {
      dimensions.push(i);
    }
  }

  // Fallback: if no dimensions found, treat first column as dimension
  if (dimensions.length === 0 && columns.length > 1) {
    dimensions.push(0);
    // Remove 0 from measures if it was there
    const idx = measures.indexOf(0);
    if (idx !== -1) measures.splice(idx, 1);
  }

  return { dimensions, measures };
}

/**
 * Get the dimension (category) column index from config or auto-detect.
 */
export function getDimensionColumnIndex(
  columns: ColumnInfo[],
  config?: VisualizationConfig,
): number {
  // Check config.xAxis.label for explicit column name
  if (config?.xAxis?.label) {
    const idx = columns.findIndex((c) => c.name === config.xAxis!.label);
    if (idx !== -1) return idx;
  }

  // Check config.options.dimensionColumn
  if (config?.options?.dimensionColumn) {
    const idx = columns.findIndex(
      (c) => c.name === config.options!.dimensionColumn,
    );
    if (idx !== -1) return idx;
  }

  // Auto-detect: first non-numeric column
  const { dimensions } = detectColumnRoles(columns);
  return dimensions.length > 0 ? dimensions[0] : 0;
}

/**
 * Get the measure column indices from config or auto-detect.
 */
export function getMeasureColumnIndices(
  columns: ColumnInfo[],
  config?: VisualizationConfig,
): number[] {
  // Check config.options.measureColumns
  if (config?.options?.measureColumns && Array.isArray(config.options.measureColumns)) {
    const indices: number[] = [];
    for (const name of config.options.measureColumns as string[]) {
      const idx = columns.findIndex((c) => c.name === name);
      if (idx !== -1) indices.push(idx);
    }
    if (indices.length > 0) return indices;
  }

  // Auto-detect: all numeric columns except the dimension
  const dimIdx = getDimensionColumnIndex(columns, config);
  const { measures } = detectColumnRoles(columns);
  return measures.filter((i) => i !== dimIdx);
}

// --- Transformers ---

/**
 * Transform QueryResult into category + series format suitable for
 * bar charts, line charts, and area charts.
 *
 * Dimension column → categories (x-axis)
 * Measure columns → series (y-axis values)
 */
export function toCategorySeries(
  data: QueryResult,
  config?: VisualizationConfig,
): CategorySeriesData {
  if (!data.rows.length || !data.columns.length) {
    return { categories: [], series: [] };
  }

  const dimIdx = getDimensionColumnIndex(data.columns, config);
  const measureIndices = getMeasureColumnIndices(data.columns, config);

  // If no measure columns found, use all columns except dimension
  const effectiveMeasures = measureIndices.length > 0
    ? measureIndices
    : data.columns.map((_, i) => i).filter((i) => i !== dimIdx);

  const dimCol = data.columns[dimIdx];
  const isDate = isDateType(dimCol.type);

  // Sort by date if dimension is a date column
  let sortedRows = [...data.rows];
  if (isDate) {
    sortedRows.sort((a, b) => {
      const da = toDate(a[dimCol.name]);
      const db = toDate(b[dimCol.name]);
      if (!da || !db) return 0;
      return da.getTime() - db.getTime();
    });
  }

  const categories = sortedRows.map((row) => {
    const val = row[dimCol.name];
    if (val == null) return '';
    if (isDate) {
      const d = toDate(val);
      return d ? d.toISOString().split('T')[0] : String(val);
    }
    return String(val);
  });

  const series: SeriesData[] = effectiveMeasures.map((idx) => {
    const col = data.columns[idx];
    return {
      name: col.name,
      values: sortedRows.map((row) => {
        const val = row[col.name];
        if (val == null) return null;
        const num = Number(val);
        return isFinite(num) ? num : null;
      }),
    };
  });

  return { categories, series };
}

/**
 * Transform QueryResult into pie/donut slice data.
 * Uses first non-numeric column as label, first numeric column as value.
 */
export function toPieData(
  data: QueryResult,
  config?: VisualizationConfig,
): PieSliceData[] {
  if (!data.rows.length || !data.columns.length) return [];

  const dimIdx = getDimensionColumnIndex(data.columns, config);
  const measureIndices = getMeasureColumnIndices(data.columns, config);
  const measureIdx = measureIndices.length > 0 ? measureIndices[0] : (dimIdx === 0 ? 1 : 0);

  if (measureIdx >= data.columns.length) return [];

  const dimCol = data.columns[dimIdx];
  const measureCol = data.columns[measureIdx];

  return data.rows
    .map((row) => {
      const name = String(row[dimCol.name] ?? '');
      const rawValue = row[measureCol.name];
      const value = rawValue == null ? 0 : Number(rawValue);
      return { name, value: isFinite(value) ? value : 0 };
    })
    .filter((slice) => slice.value > 0);
}

/**
 * Transform QueryResult into scatter plot XY data.
 *
 * Uses config.options.xColumn, config.options.yColumn, config.options.sizeColumn
 * or auto-detects: first numeric → x, second numeric → y, third numeric → size.
 */
export function toScatterData(
  data: QueryResult,
  config?: VisualizationConfig,
): XYSeriesData[] {
  if (!data.rows.length || !data.columns.length) return [];

  const { measures, dimensions } = detectColumnRoles(data.columns);

  // Resolve column indices
  const xIdx = resolveColumnIndex(data.columns, config?.options?.xColumn as string) ??
    (measures.length > 0 ? measures[0] : 0);
  const yIdx = resolveColumnIndex(data.columns, config?.options?.yColumn as string) ??
    (measures.length > 1 ? measures[1] : (measures.length > 0 ? measures[0] : 1));
  const sizeIdx = resolveColumnIndex(data.columns, config?.options?.sizeColumn as string) ??
    (measures.length > 2 ? measures[2] : undefined);
  const labelIdx = dimensions.length > 0 ? dimensions[0] : undefined;

  // Group by a series column if specified
  const seriesColIdx = resolveColumnIndex(data.columns, config?.options?.seriesColumn as string);

  if (seriesColIdx != null) {
    const groups = new Map<string, Array<{ x: number | string; y: number; size?: number; label?: string }>>();

    for (const row of data.rows) {
      const seriesName = String(row[data.columns[seriesColIdx].name] ?? 'Other');
      const x = toNumericOrString(row[data.columns[xIdx].name]);
      const y = toNumericValue(row[data.columns[yIdx].name]);
      if (y == null) continue;

      const point: { x: number | string; y: number; size?: number; label?: string } = { x, y };
      if (sizeIdx != null) {
        point.size = toNumericValue(row[data.columns[sizeIdx].name]) ?? undefined;
      }
      if (labelIdx != null) {
        point.label = String(row[data.columns[labelIdx].name] ?? '');
      }

      if (!groups.has(seriesName)) groups.set(seriesName, []);
      groups.get(seriesName)!.push(point);
    }

    return Array.from(groups.entries()).map(([name, points]) => ({ name, points }));
  }

  // Single series
  const points: Array<{ x: number | string; y: number; size?: number; label?: string }> = [];

  for (const row of data.rows) {
    const x = toNumericOrString(row[data.columns[xIdx].name]);
    const y = toNumericValue(row[data.columns[yIdx].name]);
    if (y == null) continue;

    const point: { x: number | string; y: number; size?: number; label?: string } = { x, y };
    if (sizeIdx != null) {
      point.size = toNumericValue(row[data.columns[sizeIdx].name]) ?? undefined;
    }
    if (labelIdx != null) {
      point.label = String(row[data.columns[labelIdx].name] ?? '');
    }
    points.push(point);
  }

  return [{ name: data.columns[yIdx].name, points }];
}

/**
 * Transform QueryResult into heatmap data.
 *
 * Expects exactly 3 columns or uses config.options for column mapping:
 * xColumn → x axis, yColumn → y axis, valueColumn → color intensity.
 */
export function toHeatmapData(
  data: QueryResult,
  config?: VisualizationConfig,
): {
  xLabels: string[];
  yLabels: string[];
  points: HeatmapPoint[];
  min: number;
  max: number;
} {
  if (!data.rows.length) {
    return { xLabels: [], yLabels: [], points: [], min: 0, max: 0 };
  }

  const xColIdx = resolveColumnIndex(data.columns, config?.options?.xColumn as string) ?? 0;
  const yColIdx = resolveColumnIndex(data.columns, config?.options?.yColumn as string) ?? 1;
  const valColIdx = resolveColumnIndex(data.columns, config?.options?.valueColumn as string) ??
    (data.columns.length > 2 ? 2 : 1);

  const xCol = data.columns[xColIdx];
  const yCol = data.columns[yColIdx];
  const valCol = data.columns[valColIdx];

  // Collect unique labels
  const xSet = new Set<string>();
  const ySet = new Set<string>();

  for (const row of data.rows) {
    xSet.add(String(row[xCol.name] ?? ''));
    ySet.add(String(row[yCol.name] ?? ''));
  }

  const xLabels = Array.from(xSet);
  const yLabels = Array.from(ySet);
  const xMap = new Map(xLabels.map((l, i) => [l, i]));
  const yMap = new Map(yLabels.map((l, i) => [l, i]));

  let min = Infinity;
  let max = -Infinity;

  const points: HeatmapPoint[] = data.rows
    .map((row) => {
      const x = xMap.get(String(row[xCol.name] ?? '')) ?? 0;
      const y = yMap.get(String(row[yCol.name] ?? '')) ?? 0;
      const value = toNumericValue(row[valCol.name]) ?? 0;
      if (value < min) min = value;
      if (value > max) max = value;
      return { x, y, value };
    });

  if (!isFinite(min)) min = 0;
  if (!isFinite(max)) max = 0;

  return { xLabels, yLabels, points, min, max };
}

/**
 * Transform QueryResult into funnel data.
 * Sorts by value descending (largest at top).
 */
export function toFunnelData(
  data: QueryResult,
  config?: VisualizationConfig,
): PieSliceData[] {
  const slices = toPieData(data, config);
  // Sort descending — funnel shows largest at top
  slices.sort((a, b) => b.value - a.value);
  return slices;
}

/**
 * Transform QueryResult into treemap node data.
 *
 * If data has a parent/hierarchy column (config.options.parentColumn),
 * builds a tree. Otherwise, creates a flat list of nodes.
 */
export function toTreemapData(
  data: QueryResult,
  config?: VisualizationConfig,
): TreeNode[] {
  if (!data.rows.length) return [];

  const dimIdx = getDimensionColumnIndex(data.columns, config);
  const measureIndices = getMeasureColumnIndices(data.columns, config);
  const measureIdx = measureIndices.length > 0 ? measureIndices[0] : (dimIdx === 0 ? 1 : 0);

  if (measureIdx >= data.columns.length) return [];

  const dimCol = data.columns[dimIdx];
  const measureCol = data.columns[measureIdx];
  const parentColName = config?.options?.parentColumn as string | undefined;

  if (parentColName) {
    // Hierarchical tree
    const nodeMap = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    for (const row of data.rows) {
      const name = String(row[dimCol.name] ?? '');
      const value = toNumericValue(row[measureCol.name]) ?? 0;
      const parent = row[parentColName] != null ? String(row[parentColName]) : null;

      const node: TreeNode = { name, value };
      nodeMap.set(name, node);

      if (!parent) {
        roots.push(node);
      }
    }

    // Wire up parent-child relationships
    for (const row of data.rows) {
      const name = String(row[dimCol.name] ?? '');
      const parent = row[parentColName] != null ? String(row[parentColName]) : null;

      if (parent && nodeMap.has(parent)) {
        const parentNode = nodeMap.get(parent)!;
        if (!parentNode.children) parentNode.children = [];
        const childNode = nodeMap.get(name);
        if (childNode) parentNode.children.push(childNode);
      }
    }

    return roots;
  }

  // Flat nodes
  return data.rows.map((row) => ({
    name: String(row[dimCol.name] ?? ''),
    value: toNumericValue(row[measureCol.name]) ?? 0,
  }));
}

/**
 * Extract a single numeric value from QueryResult for KPI/number charts.
 * Returns the value from the first row, first numeric column.
 */
export function toSingleValue(
  data: QueryResult,
  config?: VisualizationConfig,
): { value: number; label: string } | null {
  if (!data.rows.length || !data.columns.length) return null;

  const measureIndices = getMeasureColumnIndices(data.columns, config);
  const colIdx = measureIndices.length > 0 ? measureIndices[0] : 0;
  const col = data.columns[colIdx];
  const rawValue = data.rows[0][col.name];
  const value = toNumericValue(rawValue);

  if (value == null) return null;
  return { value, label: col.name };
}

/**
 * Get the full rows as-is for table chart consumption.
 * Applies optional sorting.
 */
export function toTableData(
  data: QueryResult,
  sortColumn?: string,
  sortDirection?: 'asc' | 'desc',
): Record<string, unknown>[] {
  if (!data.rows.length) return [];

  let rows = [...data.rows];

  if (sortColumn) {
    const col = data.columns.find((c) => c.name === sortColumn);
    if (col) {
      const isNum = isNumericType(col.type);
      const dir = sortDirection === 'desc' ? -1 : 1;

      rows.sort((a, b) => {
        const va = a[sortColumn];
        const vb = b[sortColumn];

        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;

        if (isNum) {
          return (Number(va) - Number(vb)) * dir;
        }
        return String(va).localeCompare(String(vb)) * dir;
      });
    }
  }

  return rows;
}

// --- Helpers ---

function resolveColumnIndex(columns: ColumnInfo[], name?: string): number | undefined {
  if (!name) return undefined;
  const idx = columns.findIndex((c) => c.name === name);
  return idx >= 0 ? idx : undefined;
}

function toNumericValue(val: unknown): number | null {
  if (val == null) return null;
  const num = Number(val);
  return isFinite(num) ? num : null;
}

function toNumericOrString(val: unknown): number | string {
  if (val == null) return '';
  const num = Number(val);
  if (isFinite(num)) return num;
  return String(val);
}
