import type { Dashboard, DashboardCard } from '../models/dashboard.model.js';
import type { DashboardListOptions } from '../ports/dashboard.repository.js';
import type {
  Result,
  CardPosition,
  CardSize,
  DashboardLayout,
  DashboardFilter,
} from '@meridian/shared';

/** DTO for creating a dashboard */
export interface CreateDashboardDto {
  name: string;
  description?: string;
  organizationId: string;
  createdBy: string;
  isPublic?: boolean;
  layout?: Partial<DashboardLayout>;
}

/** DTO for updating a dashboard */
export interface UpdateDashboardDto {
  name?: string;
  description?: string;
  isPublic?: boolean;
}

/** DTO for adding a card to a dashboard */
export interface AddCardDto {
  questionId: string;
  position: CardPosition;
  size: CardSize;
  title?: string;
}

/**
 * Service interface for Dashboard operations.
 */
export interface DashboardService {
  /** Create a new dashboard */
  create(dto: CreateDashboardDto): Promise<Result<Dashboard>>;

  /** Get a dashboard by ID */
  getById(id: string): Promise<Result<Dashboard>>;

  /** List dashboards with filtering and pagination */
  list(options: DashboardListOptions): Promise<Result<Dashboard[]>>;

  /** Update dashboard metadata */
  update(id: string, dto: UpdateDashboardDto): Promise<Result<Dashboard>>;

  /** Delete a dashboard */
  delete(id: string): Promise<Result<void>>;

  /** Add a card to a dashboard */
  addCard(dashboardId: string, dto: AddCardDto): Promise<Result<Dashboard>>;

  /** Remove a card from a dashboard */
  removeCard(dashboardId: string, cardId: string): Promise<Result<Dashboard>>;

  /** Move a card to a new position */
  moveCard(dashboardId: string, cardId: string, position: CardPosition, size?: CardSize): Promise<Result<Dashboard>>;

  /** Update the dashboard layout */
  updateLayout(dashboardId: string, layout: Partial<DashboardLayout>): Promise<Result<Dashboard>>;

  /** Reorder cards */
  reorderCards(dashboardId: string, cardIds: string[]): Promise<Result<Dashboard>>;

  /** Add a dashboard-level filter */
  addFilter(dashboardId: string, filter: Omit<DashboardFilter, 'id'>): Promise<Result<Dashboard>>;

  /** Remove a dashboard-level filter */
  removeFilter(dashboardId: string, filterId: string): Promise<Result<Dashboard>>;

  /** Duplicate a dashboard */
  duplicate(id: string, newName: string, createdBy: string): Promise<Result<Dashboard>>;
}
