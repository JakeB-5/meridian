import type { Question } from '../models/question.model.js';
import type { QuestionListOptions } from '../ports/question.repository.js';
import type {
  Result,
  VisualQuery,
  VisualizationConfig,
  QuestionType,
} from '@meridian/shared';

/** DTO for creating a visual question */
export interface CreateVisualQuestionDto {
  name: string;
  description?: string;
  dataSourceId: string;
  query: VisualQuery;
  visualization?: VisualizationConfig;
  organizationId: string;
  createdBy: string;
  collectionId?: string;
}

/** DTO for creating a SQL question */
export interface CreateSQLQuestionDto {
  name: string;
  description?: string;
  dataSourceId: string;
  sql: string;
  visualization?: VisualizationConfig;
  organizationId: string;
  createdBy: string;
  collectionId?: string;
}

/** DTO for updating a question */
export interface UpdateQuestionDto {
  name?: string;
  description?: string;
  query?: VisualQuery | string;
  visualization?: VisualizationConfig;
}

/**
 * Service interface for Question operations.
 */
export interface QuestionService {
  /** Create a new visual query question */
  createVisual(dto: CreateVisualQuestionDto): Promise<Result<Question>>;

  /** Create a new SQL question */
  createSQL(dto: CreateSQLQuestionDto): Promise<Result<Question>>;

  /** Get a question by ID */
  getById(id: string): Promise<Result<Question>>;

  /** List questions with filtering and pagination */
  list(options: QuestionListOptions): Promise<Result<Question[]>>;

  /** Update a question */
  update(id: string, dto: UpdateQuestionDto): Promise<Result<Question>>;

  /** Delete a question */
  delete(id: string): Promise<Result<void>>;

  /** Duplicate a question */
  duplicate(id: string, newName: string, createdBy: string): Promise<Result<Question>>;
}
