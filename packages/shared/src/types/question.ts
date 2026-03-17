import type { VisualQuery } from './query.js';
import type { VisualizationConfig } from './visualization.js';
import type { QueryResult } from './query.js';

/** Question types - visual builder or raw SQL */
export type QuestionType = 'visual' | 'sql';

/** Question data shape (DTO / persistence) */
export interface QuestionData {
  id: string;
  name: string;
  description?: string;
  type: QuestionType;
  dataSourceId: string;
  query: VisualQuery | string;
  visualization: VisualizationConfig;
  organizationId: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  cachedResult?: QueryResult;
  cacheExpiresAt?: Date;
}
