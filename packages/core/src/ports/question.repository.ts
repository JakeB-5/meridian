import type { Question } from '../models/question.model.js';
import type { QuestionType } from '@meridian/shared';

/** Options for listing questions */
export interface QuestionListOptions {
  organizationId: string;
  dataSourceId?: string;
  type?: QuestionType;
  createdBy?: string;
  collectionId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Repository interface for Question persistence.
 */
export interface QuestionRepository {
  /** Find a question by its unique ID */
  findById(id: string): Promise<Question | null>;

  /** Find all questions belonging to an organization with optional filters */
  findByOrganization(options: QuestionListOptions): Promise<Question[]>;

  /** Find questions by data source */
  findByDataSource(dataSourceId: string): Promise<Question[]>;

  /** Find questions by creator */
  findByCreator(userId: string): Promise<Question[]>;

  /** Find questions used in a specific dashboard */
  findByDashboard(dashboardId: string): Promise<Question[]>;

  /** Persist a question (create or update) */
  save(question: Question): Promise<Question>;

  /** Delete a question by ID */
  delete(id: string): Promise<void>;

  /** Check if a question with the given name exists in the organization */
  existsByName(orgId: string, name: string): Promise<boolean>;

  /** Count questions in an organization */
  countByOrganization(orgId: string): Promise<number>;

  /** Count questions using a specific data source */
  countByDataSource(dataSourceId: string): Promise<number>;
}
