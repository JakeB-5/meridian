import type {
  MetricType,
  MetricAggregation,
  MetricFormat,
  Result,
} from '@meridian/shared';
import {
  ok,
  err,
  generateId,
  ValidationError,
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
} from '@meridian/shared';

/** Metric validation rule */
export interface MetricValidationRule {
  type: 'range' | 'not_null' | 'custom';
  params?: Record<string, unknown>;
  message: string;
}

/** Metric dependency — one metric can reference another */
export interface MetricDependency {
  metricId: string;
  alias: string;
}

/**
 * Metric domain entity.
 *
 * Part of the semantic layer. A Metric is a reusable calculation definition
 * (measure or dimension) that ensures consistent calculations across dashboards.
 */
export class Metric {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string | undefined;
  public readonly expression: string;
  public readonly type: MetricType;
  public readonly aggregation: MetricAggregation | undefined;
  public readonly format: MetricFormat;
  public readonly formatOptions: Record<string, unknown>;
  public readonly dataSourceId: string;
  public readonly table: string;
  public readonly column: string | undefined;
  public readonly organizationId: string;
  public readonly tags: ReadonlyArray<string>;
  public readonly validationRules: ReadonlyArray<MetricValidationRule>;
  public readonly dependencies: ReadonlyArray<MetricDependency>;
  public readonly createdBy: string;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly isVerified: boolean;

  private constructor(params: {
    id: string;
    name: string;
    description?: string;
    expression: string;
    type: MetricType;
    aggregation?: MetricAggregation;
    format: MetricFormat;
    formatOptions: Record<string, unknown>;
    dataSourceId: string;
    table: string;
    column?: string;
    organizationId: string;
    tags: string[];
    validationRules: MetricValidationRule[];
    dependencies: MetricDependency[];
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    isVerified: boolean;
  }) {
    this.id = params.id;
    this.name = params.name;
    this.description = params.description;
    this.expression = params.expression;
    this.type = params.type;
    this.aggregation = params.aggregation;
    this.format = params.format;
    this.formatOptions = { ...params.formatOptions };
    this.dataSourceId = params.dataSourceId;
    this.table = params.table;
    this.column = params.column;
    this.organizationId = params.organizationId;
    this.tags = [...params.tags];
    this.validationRules = [...params.validationRules];
    this.dependencies = [...params.dependencies];
    this.createdBy = params.createdBy;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
    this.isVerified = params.isVerified;
  }

  /** Whether this is a measure (aggregatable value) */
  get isMeasure(): boolean {
    return (this.type as string) === 'measure';
  }

  /** Whether this is a dimension (grouping/slicing attribute) */
  get isDimension(): boolean {
    return (this.type as string) === 'dimension';
  }

  /**
   * Factory: create a new metric.
   */
  static create(params: {
    name: string;
    description?: string;
    expression: string;
    type: MetricType;
    aggregation?: MetricAggregation;
    format?: MetricFormat;
    formatOptions?: Record<string, unknown>;
    dataSourceId: string;
    table: string;
    column?: string;
    organizationId: string;
    tags?: string[];
    createdBy: string;
  }): Result<Metric> {
    // Validate name
    if (!params.name || params.name.trim().length === 0) {
      return err(new ValidationError('Metric name is required'));
    }
    if (params.name.length > MAX_NAME_LENGTH) {
      return err(new ValidationError(`Metric name must be ${MAX_NAME_LENGTH} characters or less`));
    }

    // Validate description
    if (params.description && params.description.length > MAX_DESCRIPTION_LENGTH) {
      return err(new ValidationError(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`));
    }

    // Validate expression
    if (!params.expression || params.expression.trim().length === 0) {
      return err(new ValidationError('Metric expression is required'));
    }

    // Measures must have an aggregation
    if ((params.type as string) === 'measure' && !params.aggregation) {
      return err(new ValidationError('Measure metrics must specify an aggregation method'));
    }

    // Dimensions should not have aggregation
    if ((params.type as string) === 'dimension' && params.aggregation) {
      return err(new ValidationError('Dimension metrics should not have an aggregation method'));
    }

    // Validate data source
    if (!params.dataSourceId || params.dataSourceId.trim().length === 0) {
      return err(new ValidationError('Data source ID is required'));
    }

    // Validate table
    if (!params.table || params.table.trim().length === 0) {
      return err(new ValidationError('Table name is required'));
    }

    // Validate organization
    if (!params.organizationId || params.organizationId.trim().length === 0) {
      return err(new ValidationError('Organization ID is required'));
    }

    // Validate creator
    if (!params.createdBy || params.createdBy.trim().length === 0) {
      return err(new ValidationError('Creator ID is required'));
    }

    const now = new Date();
    return ok(new Metric({
      id: generateId(),
      name: params.name.trim(),
      description: params.description?.trim(),
      expression: params.expression.trim(),
      type: params.type,
      aggregation: params.aggregation,
      format: params.format ?? 'number',
      formatOptions: params.formatOptions ?? {},
      dataSourceId: params.dataSourceId,
      table: params.table.trim(),
      column: params.column?.trim(),
      organizationId: params.organizationId,
      tags: params.tags ?? [],
      validationRules: [],
      dependencies: [],
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now,
      isVerified: false,
    }));
  }

  /**
   * Reconstitute from persistence.
   */
  static fromPersistence(params: {
    id: string;
    name: string;
    description?: string;
    expression: string;
    type: MetricType;
    aggregation?: MetricAggregation;
    format: MetricFormat;
    formatOptions: Record<string, unknown>;
    dataSourceId: string;
    table: string;
    column?: string;
    organizationId: string;
    tags: string[];
    validationRules: MetricValidationRule[];
    dependencies: MetricDependency[];
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    isVerified: boolean;
  }): Metric {
    return new Metric(params);
  }

  /**
   * Update the metric expression.
   */
  updateExpression(expression: string): Result<Metric> {
    if (!expression || expression.trim().length === 0) {
      return err(new ValidationError('Metric expression is required'));
    }

    return ok(new Metric({
      ...this.toParams(),
      expression: expression.trim(),
      updatedAt: new Date(),
      isVerified: false, // Unverify on expression change
    }));
  }

  /**
   * Update metric metadata (name, description, tags, format).
   */
  updateMetadata(params: {
    name?: string;
    description?: string;
    tags?: string[];
    format?: MetricFormat;
    formatOptions?: Record<string, unknown>;
  }): Result<Metric> {
    const newName = params.name ?? this.name;
    if (newName.trim().length === 0) {
      return err(new ValidationError('Metric name cannot be empty'));
    }
    if (newName.length > MAX_NAME_LENGTH) {
      return err(new ValidationError(`Metric name must be ${MAX_NAME_LENGTH} characters or less`));
    }
    if (params.description !== undefined && params.description.length > MAX_DESCRIPTION_LENGTH) {
      return err(new ValidationError(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`));
    }

    return ok(new Metric({
      ...this.toParams(),
      name: newName.trim(),
      description: params.description !== undefined ? params.description.trim() : this.description,
      tags: params.tags ?? [...this.tags],
      format: params.format ?? this.format,
      formatOptions: params.formatOptions ?? { ...this.formatOptions },
      updatedAt: new Date(),
    }));
  }

  /**
   * Add a validation rule.
   */
  addValidationRule(rule: MetricValidationRule): Metric {
    return new Metric({
      ...this.toParams(),
      validationRules: [...this.validationRules, rule],
      updatedAt: new Date(),
    });
  }

  /**
   * Add a dependency on another metric.
   */
  addDependency(dependency: MetricDependency): Result<Metric> {
    if (dependency.metricId === this.id) {
      return err(new ValidationError('A metric cannot depend on itself'));
    }
    if (this.dependencies.some(d => d.metricId === dependency.metricId)) {
      return err(new ValidationError(`Dependency on metric '${dependency.metricId}' already exists`));
    }

    return ok(new Metric({
      ...this.toParams(),
      dependencies: [...this.dependencies, dependency],
      updatedAt: new Date(),
    }));
  }

  /**
   * Mark as verified (reviewed and approved).
   */
  verify(): Metric {
    return new Metric({
      ...this.toParams(),
      isVerified: true,
      updatedAt: new Date(),
    });
  }

  /**
   * Mark as unverified.
   */
  unverify(): Metric {
    return new Metric({
      ...this.toParams(),
      isVerified: false,
      updatedAt: new Date(),
    });
  }

  /** Internal helper to extract params for reconstruction */
  private toParams() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      expression: this.expression,
      type: this.type,
      aggregation: this.aggregation,
      format: this.format,
      formatOptions: { ...this.formatOptions },
      dataSourceId: this.dataSourceId,
      table: this.table,
      column: this.column,
      organizationId: this.organizationId,
      tags: [...this.tags],
      validationRules: [...this.validationRules],
      dependencies: [...this.dependencies],
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isVerified: this.isVerified,
    };
  }
}
