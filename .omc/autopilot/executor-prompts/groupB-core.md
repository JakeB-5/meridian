# Group B1: @meridian/core — Domain Models & Service Interfaces

## Task
Implement core domain models, repository interfaces (ports), and service interfaces. This is the heart of the hexagonal architecture — pure business logic with no infrastructure dependencies.

## Files to Create

### src/models/datasource.model.ts
DataSource entity with:
- Factory method: create(config: DataSourceConfig): DataSource
- Methods: testConnection(), getSchema(), getTables()
- Value objects: DatabaseCredentials, ConnectionPool config

### src/models/question.model.ts
Question entity with:
- Factory methods: createVisual(...), createSQL(...)
- Methods: toVisualQuery(), toSQL(), updateVisualization()
- Validation: query must match type

### src/models/dashboard.model.ts
Dashboard entity with:
- Factory method: create(name, orgId, createdBy)
- Methods: addCard(), removeCard(), updateLayout(), reorderCards()
- Invariants: card positions don't overlap

### src/models/user.model.ts
User entity with:
- Factory: create(email, name, orgId)
- Methods: activate(), deactivate(), assignRole()
- Role and Permission value objects

### src/models/organization.model.ts
Organization entity:
- Factory: create(name, slug)
- Methods: addMember(), removeMember()

### src/models/metric.model.ts
Semantic layer metric definition:
- name, expression, type (measure/dimension)
- Aggregation rules, format

### src/ports/datasource.repository.ts
```typescript
export interface DataSourceRepository {
  findById(id: string): Promise<DataSource | null>;
  findByOrganization(orgId: string): Promise<DataSource[]>;
  save(ds: DataSource): Promise<DataSource>;
  delete(id: string): Promise<void>;
}
```

### src/ports/question.repository.ts
### src/ports/dashboard.repository.ts
### src/ports/user.repository.ts
### src/ports/organization.repository.ts
(Same pattern as datasource repository)

### src/services/datasource.service.ts
```typescript
export interface DataSourceService {
  create(config: CreateDataSourceDto): Promise<Result<DataSource>>;
  getById(id: string): Promise<Result<DataSource>>;
  listByOrganization(orgId: string): Promise<Result<DataSource[]>>;
  testConnection(id: string): Promise<Result<ConnectionTestResult>>;
  getSchema(id: string): Promise<Result<SchemaInfo>>;
  update(id: string, config: UpdateDataSourceDto): Promise<Result<DataSource>>;
  delete(id: string): Promise<Result<void>>;
}
```

### src/services/question.service.ts
### src/services/dashboard.service.ts
### src/services/user.service.ts
(Same pattern)

### src/services/query-execution.service.ts
```typescript
export interface QueryExecutionService {
  executeVisualQuery(query: VisualQuery): Promise<Result<QueryResult>>;
  executeRawSQL(dataSourceId: string, sql: string, params?: unknown[]): Promise<Result<QueryResult>>;
  cancelQuery(queryId: string): Promise<Result<void>>;
}
```

### src/events/domain-events.ts
Domain event types:
- DataSourceCreated, DataSourceDeleted
- QuestionExecuted, QuestionCached
- DashboardUpdated
- UserLoggedIn, UserRoleChanged

### src/events/event-bus.ts
Simple in-process event bus interface:
```typescript
export interface EventBus {
  publish<T extends DomainEvent>(event: T): Promise<void>;
  subscribe<T extends DomainEvent>(type: string, handler: (event: T) => Promise<void>): void;
}
```

### src/index.ts — re-exports all models, ports, services, events

## Tests
- src/models/datasource.model.test.ts
- src/models/question.model.test.ts
- src/models/dashboard.model.test.ts
- src/models/user.model.test.ts
- src/events/event-bus.test.ts (in-memory implementation for testing)

## Dependencies
- @meridian/shared (types, errors, utils)
- No infrastructure dependencies!

## Estimated LOC: ~5000 + ~1500 tests
