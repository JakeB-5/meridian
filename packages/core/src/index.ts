// Models
export {
  DataSource,
  getDefaultPort,
  Question,
  validateVisualQuery,
  validateSQL,
  Dashboard,
  DashboardCard,
  checkOverlap,
  validateCardPosition,
  validateCardSize,
  User,
  Role,
  SYSTEM_ROLES,
  Organization,
  Metric,
} from './models/index.js';

export type {
  ConnectionPoolConfig,
  DatabaseCredentials,
  DataSourceStatus,
  SystemRoleName,
  OrganizationPlan,
  OrganizationSettings,
  OrganizationMember,
  MetricValidationRule,
  MetricDependency,
} from './models/index.js';

// Ports (Repository Interfaces)
export type {
  DataSourceRepository,
  QuestionRepository,
  QuestionListOptions,
  DashboardRepository,
  DashboardListOptions,
  UserRepository,
  UserListOptions,
  OrganizationRepository,
  MetricRepository,
  MetricListOptions,
} from './ports/index.js';

// Service Interfaces
export type {
  DataSourceService,
  QuestionService,
  CreateVisualQuestionDto,
  CreateSQLQuestionDto,
  UpdateQuestionDto,
  DashboardService,
  CreateDashboardDto,
  UpdateDashboardDto,
  AddCardDto,
  UserService,
  CreateUserDto,
  UpdateUserDto,
  QueryExecutionService,
  QueryExecutionOptions,
  QueryExecution,
} from './services/index.js';

// Domain Events
export type {
  DomainEvent,
  DomainEventType,
  DomainEventName,
  DataSourceCreated,
  DataSourceUpdated,
  DataSourceDeleted,
  DataSourceConnectionTested,
  QuestionCreated,
  QuestionExecuted,
  QuestionCached,
  QuestionDeleted,
  DashboardCreated,
  DashboardUpdated,
  DashboardCardAdded,
  DashboardCardRemoved,
  DashboardDeleted,
  UserCreated,
  UserActivated,
  UserDeactivated,
  UserLoggedIn,
  UserRoleChanged,
  OrganizationCreated,
  OrganizationMemberAdded,
  OrganizationMemberRemoved,
  OrganizationPlanChanged,
  MetricCreated,
  MetricVerified,
  EventBus,
  EventHandler,
  EventSubscription,
} from './events/index.js';

export { createDomainEvent, InMemoryEventBus } from './events/index.js';
