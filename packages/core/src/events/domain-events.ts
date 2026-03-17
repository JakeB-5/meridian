import type { DatabaseType, QuestionType, ChartType, Permission } from '@meridian/shared';

/**
 * Base interface for all domain events.
 * Every event carries metadata for tracing and ordering.
 */
export interface DomainEvent {
  /** Unique event ID */
  readonly eventId: string;
  /** Event type discriminator */
  readonly eventType: string;
  /** When the event occurred */
  readonly occurredAt: Date;
  /** ID of the aggregate that produced this event */
  readonly aggregateId: string;
  /** Type of the aggregate */
  readonly aggregateType: string;
  /** User who triggered the event (if applicable) */
  readonly triggeredBy?: string;
  /** Correlation ID for request tracing */
  readonly correlationId?: string;
}

// --- DataSource Events ---

export interface DataSourceCreated extends DomainEvent {
  readonly eventType: 'DataSourceCreated';
  readonly aggregateType: 'DataSource';
  readonly payload: {
    name: string;
    type: DatabaseType;
    organizationId: string;
  };
}

export interface DataSourceUpdated extends DomainEvent {
  readonly eventType: 'DataSourceUpdated';
  readonly aggregateType: 'DataSource';
  readonly payload: {
    changes: string[];
  };
}

export interface DataSourceDeleted extends DomainEvent {
  readonly eventType: 'DataSourceDeleted';
  readonly aggregateType: 'DataSource';
  readonly payload: {
    name: string;
    organizationId: string;
  };
}

export interface DataSourceConnectionTested extends DomainEvent {
  readonly eventType: 'DataSourceConnectionTested';
  readonly aggregateType: 'DataSource';
  readonly payload: {
    success: boolean;
    latencyMs?: number;
    error?: string;
  };
}

// --- Question Events ---

export interface QuestionCreated extends DomainEvent {
  readonly eventType: 'QuestionCreated';
  readonly aggregateType: 'Question';
  readonly payload: {
    name: string;
    type: QuestionType;
    dataSourceId: string;
    organizationId: string;
  };
}

export interface QuestionExecuted extends DomainEvent {
  readonly eventType: 'QuestionExecuted';
  readonly aggregateType: 'Question';
  readonly payload: {
    dataSourceId: string;
    executionTimeMs: number;
    rowCount: number;
    cached: boolean;
  };
}

export interface QuestionCached extends DomainEvent {
  readonly eventType: 'QuestionCached';
  readonly aggregateType: 'Question';
  readonly payload: {
    cacheTtlMs: number;
    rowCount: number;
  };
}

export interface QuestionDeleted extends DomainEvent {
  readonly eventType: 'QuestionDeleted';
  readonly aggregateType: 'Question';
  readonly payload: {
    name: string;
    organizationId: string;
  };
}

// --- Dashboard Events ---

export interface DashboardCreated extends DomainEvent {
  readonly eventType: 'DashboardCreated';
  readonly aggregateType: 'Dashboard';
  readonly payload: {
    name: string;
    organizationId: string;
  };
}

export interface DashboardUpdated extends DomainEvent {
  readonly eventType: 'DashboardUpdated';
  readonly aggregateType: 'Dashboard';
  readonly payload: {
    changes: string[];
  };
}

export interface DashboardCardAdded extends DomainEvent {
  readonly eventType: 'DashboardCardAdded';
  readonly aggregateType: 'Dashboard';
  readonly payload: {
    cardId: string;
    questionId: string;
  };
}

export interface DashboardCardRemoved extends DomainEvent {
  readonly eventType: 'DashboardCardRemoved';
  readonly aggregateType: 'Dashboard';
  readonly payload: {
    cardId: string;
    questionId: string;
  };
}

export interface DashboardDeleted extends DomainEvent {
  readonly eventType: 'DashboardDeleted';
  readonly aggregateType: 'Dashboard';
  readonly payload: {
    name: string;
    organizationId: string;
  };
}

// --- User Events ---

export interface UserCreated extends DomainEvent {
  readonly eventType: 'UserCreated';
  readonly aggregateType: 'User';
  readonly payload: {
    email: string;
    organizationId: string;
  };
}

export interface UserActivated extends DomainEvent {
  readonly eventType: 'UserActivated';
  readonly aggregateType: 'User';
  readonly payload: {
    email: string;
  };
}

export interface UserDeactivated extends DomainEvent {
  readonly eventType: 'UserDeactivated';
  readonly aggregateType: 'User';
  readonly payload: {
    email: string;
  };
}

export interface UserLoggedIn extends DomainEvent {
  readonly eventType: 'UserLoggedIn';
  readonly aggregateType: 'User';
  readonly payload: {
    email: string;
    ipAddress?: string;
    userAgent?: string;
  };
}

export interface UserRoleChanged extends DomainEvent {
  readonly eventType: 'UserRoleChanged';
  readonly aggregateType: 'User';
  readonly payload: {
    previousRoleId: string;
    newRoleId: string;
    previousRoleName: string;
    newRoleName: string;
  };
}

// --- Organization Events ---

export interface OrganizationCreated extends DomainEvent {
  readonly eventType: 'OrganizationCreated';
  readonly aggregateType: 'Organization';
  readonly payload: {
    name: string;
    slug: string;
    plan: string;
  };
}

export interface OrganizationMemberAdded extends DomainEvent {
  readonly eventType: 'OrganizationMemberAdded';
  readonly aggregateType: 'Organization';
  readonly payload: {
    userId: string;
  };
}

export interface OrganizationMemberRemoved extends DomainEvent {
  readonly eventType: 'OrganizationMemberRemoved';
  readonly aggregateType: 'Organization';
  readonly payload: {
    userId: string;
  };
}

export interface OrganizationPlanChanged extends DomainEvent {
  readonly eventType: 'OrganizationPlanChanged';
  readonly aggregateType: 'Organization';
  readonly payload: {
    previousPlan: string;
    newPlan: string;
  };
}

// --- Metric Events ---

export interface MetricCreated extends DomainEvent {
  readonly eventType: 'MetricCreated';
  readonly aggregateType: 'Metric';
  readonly payload: {
    name: string;
    type: string;
    dataSourceId: string;
    organizationId: string;
  };
}

export interface MetricVerified extends DomainEvent {
  readonly eventType: 'MetricVerified';
  readonly aggregateType: 'Metric';
  readonly payload: {
    name: string;
  };
}

// --- Union type for all domain events ---

export type DomainEventType =
  | DataSourceCreated
  | DataSourceUpdated
  | DataSourceDeleted
  | DataSourceConnectionTested
  | QuestionCreated
  | QuestionExecuted
  | QuestionCached
  | QuestionDeleted
  | DashboardCreated
  | DashboardUpdated
  | DashboardCardAdded
  | DashboardCardRemoved
  | DashboardDeleted
  | UserCreated
  | UserActivated
  | UserDeactivated
  | UserLoggedIn
  | UserRoleChanged
  | OrganizationCreated
  | OrganizationMemberAdded
  | OrganizationMemberRemoved
  | OrganizationPlanChanged
  | MetricCreated
  | MetricVerified;

/** All possible event type strings */
export type DomainEventName = DomainEventType['eventType'];

/** Helper to create a domain event with metadata */
export function createDomainEvent<T extends DomainEvent>(
  params: Omit<T, 'eventId' | 'occurredAt'> & { eventId?: string; occurredAt?: Date },
): T {
  return {
    ...params,
    eventId: params.eventId ?? crypto.randomUUID(),
    occurredAt: params.occurredAt ?? new Date(),
  } as T;
}
