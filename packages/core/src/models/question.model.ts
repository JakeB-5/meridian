import type {
  VisualQuery,
  VisualizationConfig,
  QueryResult,
  QuestionType,
  ChartType,
  FilterClause,
  SortClause,
  AggregationClause,
  Result,
} from '@meridian/shared';
import {
  ok,
  err,
  generateId,
  ValidationError,
  MAX_SQL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
} from '@meridian/shared';

/** Default visualization for new questions */
const DEFAULT_VISUALIZATION: VisualizationConfig = {
  type: 'table',
  tooltip: true,
};

/**
 * Question domain entity.
 *
 * A Question represents a saved query — either a visual query built via the UI
 * or a raw SQL query. Each question has an associated visualization configuration.
 */
export class Question {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string | undefined;
  public readonly type: QuestionType;
  public readonly dataSourceId: string;
  public readonly query: VisualQuery | string;
  public readonly visualization: VisualizationConfig;
  public readonly organizationId: string;
  public readonly createdBy: string;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly collectionId: string | undefined;

  private _cachedResult: QueryResult | undefined;
  private _cacheExpiresAt: Date | undefined;

  private constructor(params: {
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
    collectionId?: string;
    cachedResult?: QueryResult;
    cacheExpiresAt?: Date;
  }) {
    this.id = params.id;
    this.name = params.name;
    this.description = params.description;
    this.type = params.type;
    this.dataSourceId = params.dataSourceId;
    this.query = params.query;
    this.visualization = params.visualization;
    this.organizationId = params.organizationId;
    this.createdBy = params.createdBy;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
    this.collectionId = params.collectionId;
    this._cachedResult = params.cachedResult;
    this._cacheExpiresAt = params.cacheExpiresAt;
  }

  get cachedResult(): QueryResult | undefined {
    return this._cachedResult;
  }

  get cacheExpiresAt(): Date | undefined {
    return this._cacheExpiresAt;
  }

  /** Check if the cached result is still valid */
  get isCacheValid(): boolean {
    if (!this._cachedResult || !this._cacheExpiresAt) return false;
    return this._cacheExpiresAt.getTime() > Date.now();
  }

  /**
   * Factory: create a visual query question.
   * The query is constructed via the visual query builder (no raw SQL).
   */
  static createVisual(params: {
    name: string;
    description?: string;
    dataSourceId: string;
    query: VisualQuery;
    visualization?: VisualizationConfig;
    organizationId: string;
    createdBy: string;
    collectionId?: string;
  }): Result<Question> {
    const nameValidation = validateName(params.name);
    if (!nameValidation.ok) return nameValidation;

    const descValidation = validateDescription(params.description);
    if (!descValidation.ok) return descValidation;

    if (!params.dataSourceId || params.dataSourceId.trim().length === 0) {
      return err(new ValidationError('Data source ID is required'));
    }

    if (!params.organizationId || params.organizationId.trim().length === 0) {
      return err(new ValidationError('Organization ID is required'));
    }

    if (!params.createdBy || params.createdBy.trim().length === 0) {
      return err(new ValidationError('Creator ID is required'));
    }

    // Validate visual query
    const queryValidation = validateVisualQuery(params.query);
    if (!queryValidation.ok) return queryValidation;

    const now = new Date();
    return ok(new Question({
      id: generateId(),
      name: params.name.trim(),
      description: params.description?.trim(),
      type: 'visual',
      dataSourceId: params.dataSourceId,
      query: params.query,
      visualization: params.visualization ?? DEFAULT_VISUALIZATION,
      organizationId: params.organizationId,
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now,
      collectionId: params.collectionId,
    }));
  }

  /**
   * Factory: create a raw SQL question.
   */
  static createSQL(params: {
    name: string;
    description?: string;
    dataSourceId: string;
    sql: string;
    visualization?: VisualizationConfig;
    organizationId: string;
    createdBy: string;
    collectionId?: string;
  }): Result<Question> {
    const nameValidation = validateName(params.name);
    if (!nameValidation.ok) return nameValidation;

    const descValidation = validateDescription(params.description);
    if (!descValidation.ok) return descValidation;

    if (!params.dataSourceId || params.dataSourceId.trim().length === 0) {
      return err(new ValidationError('Data source ID is required'));
    }

    if (!params.organizationId || params.organizationId.trim().length === 0) {
      return err(new ValidationError('Organization ID is required'));
    }

    if (!params.createdBy || params.createdBy.trim().length === 0) {
      return err(new ValidationError('Creator ID is required'));
    }

    // Validate SQL
    const sqlValidation = validateSQL(params.sql);
    if (!sqlValidation.ok) return sqlValidation;

    const now = new Date();
    return ok(new Question({
      id: generateId(),
      name: params.name.trim(),
      description: params.description?.trim(),
      type: 'sql',
      dataSourceId: params.dataSourceId,
      query: params.sql.trim(),
      visualization: params.visualization ?? DEFAULT_VISUALIZATION,
      organizationId: params.organizationId,
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now,
      collectionId: params.collectionId,
    }));
  }

  /**
   * Reconstitute from persistence layer.
   */
  static fromPersistence(params: {
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
    collectionId?: string;
    cachedResult?: QueryResult;
    cacheExpiresAt?: Date;
  }): Question {
    return new Question(params);
  }

  /**
   * Extract the visual query if this is a visual-type question.
   * Returns error if this is a SQL question.
   */
  toVisualQuery(): Result<VisualQuery> {
    if (this.type !== 'visual') {
      return err(new ValidationError('Cannot extract visual query from a SQL question'));
    }
    return ok(this.query as VisualQuery);
  }

  /**
   * Extract the raw SQL if this is a SQL-type question.
   * Returns error if this is a visual question.
   */
  toSQL(): Result<string> {
    if (this.type !== 'sql') {
      return err(new ValidationError('Cannot extract SQL from a visual question'));
    }
    return ok(this.query as string);
  }

  /**
   * Update the visualization configuration.
   * Returns a new Question with updated visualization.
   */
  updateVisualization(config: VisualizationConfig): Result<Question> {
    if (!config.type) {
      return err(new ValidationError('Visualization type is required'));
    }

    return ok(new Question({
      id: this.id,
      name: this.name,
      description: this.description,
      type: this.type,
      dataSourceId: this.dataSourceId,
      query: this.query,
      visualization: config,
      organizationId: this.organizationId,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      collectionId: this.collectionId,
      cachedResult: this._cachedResult,
      cacheExpiresAt: this._cacheExpiresAt,
    }));
  }

  /**
   * Update the query (visual or SQL).
   * Type must match the question type.
   */
  updateQuery(query: VisualQuery | string): Result<Question> {
    if (this.type === 'visual' && typeof query === 'string') {
      return err(new ValidationError('Visual question requires a VisualQuery object, not a string'));
    }
    if (this.type === 'sql' && typeof query !== 'string') {
      return err(new ValidationError('SQL question requires a string query, not an object'));
    }

    if (this.type === 'visual') {
      const validation = validateVisualQuery(query as VisualQuery);
      if (!validation.ok) return validation;
    } else {
      const validation = validateSQL(query as string);
      if (!validation.ok) return validation;
    }

    return ok(new Question({
      id: this.id,
      name: this.name,
      description: this.description,
      type: this.type,
      dataSourceId: this.dataSourceId,
      query,
      visualization: this.visualization,
      organizationId: this.organizationId,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      collectionId: this.collectionId,
      // Invalidate cache on query change
      cachedResult: undefined,
      cacheExpiresAt: undefined,
    }));
  }

  /**
   * Update name and description.
   */
  updateMetadata(params: { name?: string; description?: string }): Result<Question> {
    const newName = params.name ?? this.name;
    const nameValidation = validateName(newName);
    if (!nameValidation.ok) return nameValidation;

    if (params.description !== undefined) {
      const descValidation = validateDescription(params.description);
      if (!descValidation.ok) return descValidation;
    }

    return ok(new Question({
      id: this.id,
      name: newName.trim(),
      description: params.description !== undefined ? params.description?.trim() : this.description,
      type: this.type,
      dataSourceId: this.dataSourceId,
      query: this.query,
      visualization: this.visualization,
      organizationId: this.organizationId,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      collectionId: this.collectionId,
      cachedResult: this._cachedResult,
      cacheExpiresAt: this._cacheExpiresAt,
    }));
  }

  /**
   * Store a cached query result with expiration.
   */
  cacheResult(result: QueryResult, ttlMs: number): Question {
    return new Question({
      id: this.id,
      name: this.name,
      description: this.description,
      type: this.type,
      dataSourceId: this.dataSourceId,
      query: this.query,
      visualization: this.visualization,
      organizationId: this.organizationId,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      collectionId: this.collectionId,
      cachedResult: result,
      cacheExpiresAt: new Date(Date.now() + ttlMs),
    });
  }

  /**
   * Clear the cached result.
   */
  clearCache(): Question {
    return new Question({
      id: this.id,
      name: this.name,
      description: this.description,
      type: this.type,
      dataSourceId: this.dataSourceId,
      query: this.query,
      visualization: this.visualization,
      organizationId: this.organizationId,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      collectionId: this.collectionId,
    });
  }
}

// --- Validation helpers ---

function validateName(name: string): Result<void> {
  if (!name || name.trim().length === 0) {
    return err(new ValidationError('Question name is required'));
  }
  if (name.length > MAX_NAME_LENGTH) {
    return err(new ValidationError(`Question name must be ${MAX_NAME_LENGTH} characters or less`));
  }
  return ok(undefined);
}

function validateDescription(description: string | undefined): Result<void> {
  if (description !== undefined && description.length > MAX_DESCRIPTION_LENGTH) {
    return err(new ValidationError(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`));
  }
  return ok(undefined);
}

function validateSQL(sql: string): Result<void> {
  if (!sql || sql.trim().length === 0) {
    return err(new ValidationError('SQL query is required'));
  }
  if (sql.length > MAX_SQL_LENGTH) {
    return err(new ValidationError(`SQL query must be ${MAX_SQL_LENGTH} characters or less`));
  }
  return ok(undefined);
}

function validateVisualQuery(query: VisualQuery): Result<void> {
  if (!query.dataSourceId || query.dataSourceId.trim().length === 0) {
    return err(new ValidationError('Visual query must specify a data source'));
  }
  if (!query.table || query.table.trim().length === 0) {
    return err(new ValidationError('Visual query must specify a table'));
  }
  if (!query.columns || query.columns.length === 0) {
    // Aggregation-only queries are allowed without explicit columns
    if (!query.aggregations || query.aggregations.length === 0) {
      return err(new ValidationError('Visual query must specify at least one column or aggregation'));
    }
  }
  if (query.limit !== undefined && query.limit < 0) {
    return err(new ValidationError('Query limit cannot be negative'));
  }
  if (query.offset !== undefined && query.offset < 0) {
    return err(new ValidationError('Query offset cannot be negative'));
  }
  return ok(undefined);
}

export { validateVisualQuery, validateSQL };
