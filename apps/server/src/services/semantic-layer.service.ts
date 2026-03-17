import {
  ok,
  err,
  NotFoundError,
  ConflictError,
  generateId,
  type Result,
} from '@meridian/shared';

// ── Domain Types ────────────────────────────────────────────────────

export type DimensionType = 'string' | 'number' | 'date' | 'boolean' | 'timestamp';
export type MeasureAggregation = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'count_distinct' | 'custom';
export type JoinType = 'inner' | 'left' | 'right' | 'full';
export type MetricType = MeasureAggregation | 'ratio';
export type FilterOperator =
  | 'eq' | 'neq'
  | 'gt' | 'gte'
  | 'lt' | 'lte'
  | 'in' | 'not_in'
  | 'like'
  | 'is_null' | 'is_not_null';

export interface Dimension {
  name: string;
  column: string;
  type: DimensionType;
  label?: string;
  description?: string;
  primaryKey: boolean;
  hidden: boolean;
}

export interface Measure {
  name: string;
  expression: string;
  type: MeasureAggregation;
  label?: string;
  description?: string;
  format?: string;
  hidden: boolean;
}

export interface Join {
  modelName: string;
  type: JoinType;
  condition: string;
  label?: string;
}

export interface MetricFilter {
  column: string;
  operator: FilterOperator;
  value?: unknown;
}

export interface SemanticModel {
  id: string;
  name: string;
  description?: string;
  dataSourceId: string;
  organizationId: string;
  createdBy: string;
  tableName?: string;
  sqlTable?: string;
  dimensions: Dimension[];
  measures: Measure[];
  joins: Join[];
  tags: string[];
  hidden: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SemanticMetric {
  id: string;
  modelId: string;
  organizationId: string;
  createdBy: string;
  name: string;
  description?: string;
  expression: string;
  type: MetricType;
  label?: string;
  format?: string;
  filters: MetricFilter[];
  tags: string[];
  hidden: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ── DTO Types ────────────────────────────────────────────────────────

export interface CreateSemanticModelDto {
  name: string;
  description?: string;
  dataSourceId: string;
  organizationId: string;
  createdBy: string;
  tableName?: string;
  sqlTable?: string;
  dimensions?: Dimension[];
  measures?: Measure[];
  joins?: Join[];
  tags?: string[];
  hidden?: boolean;
}

export interface UpdateSemanticModelDto {
  name?: string;
  description?: string;
  tableName?: string;
  sqlTable?: string;
  dimensions?: Dimension[];
  measures?: Measure[];
  joins?: Join[];
  tags?: string[];
  hidden?: boolean;
}

export interface CreateSemanticMetricDto {
  modelId: string;
  organizationId: string;
  createdBy: string;
  name: string;
  description?: string;
  expression: string;
  type: MetricType;
  label?: string;
  format?: string;
  filters?: MetricFilter[];
  tags?: string[];
  hidden?: boolean;
}

export interface UpdateSemanticMetricDto {
  name?: string;
  description?: string;
  expression?: string;
  type?: MetricType;
  label?: string;
  format?: string;
  filters?: MetricFilter[];
  tags?: string[];
  hidden?: boolean;
}

export interface ListModelsOptions {
  organizationId: string;
  dataSourceId?: string;
  search?: string;
  includeHidden?: boolean;
  limit?: number;
  offset?: number;
}

// ── Service ──────────────────────────────────────────────────────────

/**
 * SemanticLayerService manages the catalogue of semantic models and
 * their associated metrics for an organization.
 *
 * A semantic model wraps a database table (or SQL expression) in a
 * business-friendly descriptor that names dimensions, pre-aggregated
 * measures, and join relationships.  Metrics further refine measures
 * with optional filters and formatting hints.
 */
export class SemanticLayerService {
  private readonly modelStore = new Map<string, SemanticModel>();
  private readonly metricStore = new Map<string, SemanticMetric>();

  // ── Model CRUD ─────────────────────────────────────────────────

  /**
   * Create a new semantic model.
   * Enforces uniqueness of `name` within the organization.
   */
  async createModel(dto: CreateSemanticModelDto): Promise<Result<SemanticModel>> {
    const duplicate = Array.from(this.modelStore.values()).find(
      (m) => m.organizationId === dto.organizationId && m.name === dto.name,
    );
    if (duplicate) {
      return err(new ConflictError(`Semantic model '${dto.name}' already exists`));
    }

    const now = new Date();
    const model: SemanticModel = {
      id: generateId(),
      name: dto.name,
      description: dto.description,
      dataSourceId: dto.dataSourceId,
      organizationId: dto.organizationId,
      createdBy: dto.createdBy,
      tableName: dto.tableName,
      sqlTable: dto.sqlTable,
      dimensions: dto.dimensions ?? [],
      measures: dto.measures ?? [],
      joins: dto.joins ?? [],
      tags: dto.tags ?? [],
      hidden: dto.hidden ?? false,
      createdAt: now,
      updatedAt: now,
    };

    this.modelStore.set(model.id, model);
    return ok(model);
  }

  /**
   * Retrieve a model by ID.
   */
  async getModelById(id: string): Promise<Result<SemanticModel>> {
    const model = this.modelStore.get(id);
    if (!model) return err(new NotFoundError('SemanticModel', id));
    return ok(model);
  }

  /**
   * List models for an organization with optional filtering.
   */
  async listModels(
    options: ListModelsOptions,
  ): Promise<Result<{ models: SemanticModel[]; total: number }>> {
    let models = Array.from(this.modelStore.values()).filter(
      (m) => m.organizationId === options.organizationId,
    );

    if (options.dataSourceId) {
      models = models.filter((m) => m.dataSourceId === options.dataSourceId);
    }
    if (!options.includeHidden) {
      models = models.filter((m) => !m.hidden);
    }
    if (options.search) {
      const s = options.search.toLowerCase();
      models = models.filter(
        (m) =>
          m.name.toLowerCase().includes(s) ||
          m.description?.toLowerCase().includes(s),
      );
    }

    models.sort((a, b) => a.name.localeCompare(b.name));

    const total = models.length;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 25;
    return ok({ models: models.slice(offset, offset + limit), total });
  }

  /**
   * Update a semantic model.
   * Enforces name uniqueness when the name is changed.
   */
  async updateModel(
    id: string,
    dto: UpdateSemanticModelDto,
  ): Promise<Result<SemanticModel>> {
    const model = this.modelStore.get(id);
    if (!model) return err(new NotFoundError('SemanticModel', id));

    if (dto.name && dto.name !== model.name) {
      const dup = Array.from(this.modelStore.values()).find(
        (m) => m.id !== id && m.organizationId === model.organizationId && m.name === dto.name,
      );
      if (dup) {
        return err(new ConflictError(`Semantic model '${dto.name}' already exists`));
      }
    }

    const updated: SemanticModel = {
      ...model,
      name: dto.name ?? model.name,
      description: dto.description !== undefined ? dto.description : model.description,
      tableName: dto.tableName !== undefined ? dto.tableName : model.tableName,
      sqlTable: dto.sqlTable !== undefined ? dto.sqlTable : model.sqlTable,
      dimensions: dto.dimensions ?? model.dimensions,
      measures: dto.measures ?? model.measures,
      joins: dto.joins ?? model.joins,
      tags: dto.tags ?? model.tags,
      hidden: dto.hidden !== undefined ? dto.hidden : model.hidden,
      updatedAt: new Date(),
    };

    this.modelStore.set(id, updated);
    return ok(updated);
  }

  /**
   * Delete a semantic model and all its associated metrics.
   */
  async deleteModel(id: string): Promise<Result<void>> {
    const model = this.modelStore.get(id);
    if (!model) return err(new NotFoundError('SemanticModel', id));

    // Cascade delete metrics
    for (const [metricId, metric] of this.metricStore) {
      if (metric.modelId === id) {
        this.metricStore.delete(metricId);
      }
    }

    this.modelStore.delete(id);
    return ok(undefined);
  }

  // ── Metric CRUD ────────────────────────────────────────────────

  /**
   * Create a metric on an existing model.
   * Enforces uniqueness of `name` within the model.
   */
  async createMetric(dto: CreateSemanticMetricDto): Promise<Result<SemanticMetric>> {
    const model = this.modelStore.get(dto.modelId);
    if (!model) return err(new NotFoundError('SemanticModel', dto.modelId));

    const duplicate = Array.from(this.metricStore.values()).find(
      (m) => m.modelId === dto.modelId && m.name === dto.name,
    );
    if (duplicate) {
      return err(new ConflictError(`Metric '${dto.name}' already exists in this model`));
    }

    const now = new Date();
    const metric: SemanticMetric = {
      id: generateId(),
      modelId: dto.modelId,
      organizationId: dto.organizationId,
      createdBy: dto.createdBy,
      name: dto.name,
      description: dto.description,
      expression: dto.expression,
      type: dto.type,
      label: dto.label,
      format: dto.format,
      filters: dto.filters ?? [],
      tags: dto.tags ?? [],
      hidden: dto.hidden ?? false,
      createdAt: now,
      updatedAt: now,
    };

    this.metricStore.set(metric.id, metric);
    return ok(metric);
  }

  /**
   * Retrieve a metric by ID.
   */
  async getMetricById(metricId: string): Promise<Result<SemanticMetric>> {
    const metric = this.metricStore.get(metricId);
    if (!metric) return err(new NotFoundError('SemanticMetric', metricId));
    return ok(metric);
  }

  /**
   * List all metrics belonging to a model.
   */
  async listMetrics(
    modelId: string,
    includeHidden = false,
  ): Promise<Result<SemanticMetric[]>> {
    const model = this.modelStore.get(modelId);
    if (!model) return err(new NotFoundError('SemanticModel', modelId));

    let metrics = Array.from(this.metricStore.values()).filter(
      (m) => m.modelId === modelId,
    );
    if (!includeHidden) {
      metrics = metrics.filter((m) => !m.hidden);
    }
    metrics.sort((a, b) => a.name.localeCompare(b.name));
    return ok(metrics);
  }

  /**
   * Update a metric.
   * Enforces name uniqueness within the model when the name changes.
   */
  async updateMetric(
    metricId: string,
    dto: UpdateSemanticMetricDto,
  ): Promise<Result<SemanticMetric>> {
    const metric = this.metricStore.get(metricId);
    if (!metric) return err(new NotFoundError('SemanticMetric', metricId));

    if (dto.name && dto.name !== metric.name) {
      const dup = Array.from(this.metricStore.values()).find(
        (m) => m.id !== metricId && m.modelId === metric.modelId && m.name === dto.name,
      );
      if (dup) {
        return err(new ConflictError(`Metric '${dto.name}' already exists in this model`));
      }
    }

    const updated: SemanticMetric = {
      ...metric,
      name: dto.name ?? metric.name,
      description: dto.description !== undefined ? dto.description : metric.description,
      expression: dto.expression ?? metric.expression,
      type: dto.type ?? metric.type,
      label: dto.label !== undefined ? dto.label : metric.label,
      format: dto.format !== undefined ? dto.format : metric.format,
      filters: dto.filters ?? metric.filters,
      tags: dto.tags ?? metric.tags,
      hidden: dto.hidden !== undefined ? dto.hidden : metric.hidden,
      updatedAt: new Date(),
    };

    this.metricStore.set(metricId, updated);
    return ok(updated);
  }

  /**
   * Delete a metric.
   */
  async deleteMetric(metricId: string): Promise<Result<void>> {
    const metric = this.metricStore.get(metricId);
    if (!metric) return err(new NotFoundError('SemanticMetric', metricId));
    this.metricStore.delete(metricId);
    return ok(undefined);
  }

  // ── Query Helpers ──────────────────────────────────────────────

  /**
   * Resolve a model's effective SQL source — either a raw table reference
   * or a sub-select from `sqlTable`.
   */
  resolveTableSql(model: SemanticModel): string {
    if (model.sqlTable) {
      return `(${model.sqlTable}) AS "${model.name}"`;
    }
    return model.tableName ? `"${model.tableName}"` : `"${model.name}"`;
  }

  /**
   * Build a human-readable summary of a model for debugging / display.
   */
  summarizeModel(model: SemanticModel): string {
    return [
      `Model: ${model.name}`,
      `  Table: ${model.tableName ?? '(sql)'}`,
      `  Dimensions: ${model.dimensions.map((d) => d.name).join(', ') || 'none'}`,
      `  Measures: ${model.measures.map((m) => m.name).join(', ') || 'none'}`,
      `  Joins: ${model.joins.map((j) => j.modelName).join(', ') || 'none'}`,
    ].join('\n');
  }
}
