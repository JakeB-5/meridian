/** Metric type categories */
export type MetricType = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'count_distinct' | 'custom';

/** Aggregation method for a metric */
export type MetricAggregation = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct';

/** Display format for metric values */
export type MetricFormat = 'number' | 'currency' | 'percent' | 'decimal' | 'integer' | 'compact';

/** Semantic layer metric definition */
export interface MetricData {
  id: string;
  name: string;
  description?: string;
  type: MetricType;
  aggregation: MetricAggregation;
  column: string;
  table: string;
  dataSourceId: string;
  format: MetricFormat;
  organizationId: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
