import type {
  CardPosition,
  CardSize,
  DashboardLayout,
  DashboardFilter,
  DashboardCardData,
  Result,
} from '@meridian/shared';
import {
  ok,
  err,
  generateId,
  ValidationError,
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_CARDS_PER_DASHBOARD,
  DEFAULT_DASHBOARD_COLUMNS,
  DEFAULT_ROW_HEIGHT,
  MIN_CARD_WIDTH,
  MIN_CARD_HEIGHT,
  MAX_CARD_WIDTH,
  MAX_CARD_HEIGHT,
} from '@meridian/shared';

/**
 * DashboardCard value object.
 * Represents a question placed on a dashboard at a specific position and size.
 */
export class DashboardCard {
  public readonly id: string;
  public readonly dashboardId: string;
  public readonly questionId: string;
  public readonly position: CardPosition;
  public readonly size: CardSize;
  public readonly title: string | undefined;

  constructor(params: {
    id: string;
    dashboardId: string;
    questionId: string;
    position: CardPosition;
    size: CardSize;
    title?: string;
  }) {
    this.id = params.id;
    this.dashboardId = params.dashboardId;
    this.questionId = params.questionId;
    this.position = { ...params.position };
    this.size = { ...params.size };
    this.title = params.title;
  }

  /** Get the bounding box for overlap detection */
  get bounds(): { x1: number; y1: number; x2: number; y2: number } {
    return {
      x1: this.position.x,
      y1: this.position.y,
      x2: this.position.x + this.size.width,
      y2: this.position.y + this.size.height,
    };
  }

  /** Convert to plain data */
  toData(): DashboardCardData {
    return {
      id: this.id,
      dashboardId: this.dashboardId,
      questionId: this.questionId,
      position: { ...this.position },
      size: { ...this.size },
    };
  }
}

/**
 * Dashboard domain entity.
 *
 * A Dashboard is a collection of cards arranged on a grid layout.
 * Enforces invariants: no card overlap, valid positions, card limits.
 */
export class Dashboard {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string | undefined;
  public readonly organizationId: string;
  public readonly createdBy: string;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly isPublic: boolean;
  public readonly layout: DashboardLayout;
  public readonly filters: DashboardFilter[];

  private _cards: DashboardCard[];

  private constructor(params: {
    id: string;
    name: string;
    description?: string;
    organizationId: string;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    isPublic: boolean;
    layout: DashboardLayout;
    filters: DashboardFilter[];
    cards: DashboardCard[];
  }) {
    this.id = params.id;
    this.name = params.name;
    this.description = params.description;
    this.organizationId = params.organizationId;
    this.createdBy = params.createdBy;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
    this.isPublic = params.isPublic;
    this.layout = { ...params.layout };
    this.filters = [...params.filters];
    this._cards = [...params.cards];
  }

  /** Get all cards (read-only copy) */
  get cards(): ReadonlyArray<DashboardCard> {
    return [...this._cards];
  }

  /** Get card count */
  get cardCount(): number {
    return this._cards.length;
  }

  /**
   * Factory method: create a new empty dashboard.
   */
  static create(params: {
    name: string;
    organizationId: string;
    createdBy: string;
    description?: string;
    isPublic?: boolean;
    layout?: Partial<DashboardLayout>;
  }): Result<Dashboard> {
    if (!params.name || params.name.trim().length === 0) {
      return err(new ValidationError('Dashboard name is required'));
    }
    if (params.name.length > MAX_NAME_LENGTH) {
      return err(new ValidationError(`Dashboard name must be ${MAX_NAME_LENGTH} characters or less`));
    }
    if (params.description && params.description.length > MAX_DESCRIPTION_LENGTH) {
      return err(new ValidationError(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`));
    }
    if (!params.organizationId || params.organizationId.trim().length === 0) {
      return err(new ValidationError('Organization ID is required'));
    }
    if (!params.createdBy || params.createdBy.trim().length === 0) {
      return err(new ValidationError('Creator ID is required'));
    }

    const now = new Date();
    return ok(new Dashboard({
      id: generateId(),
      name: params.name.trim(),
      description: params.description?.trim(),
      organizationId: params.organizationId,
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now,
      isPublic: params.isPublic ?? false,
      layout: {
        columns: params.layout?.columns ?? DEFAULT_DASHBOARD_COLUMNS,
        rowHeight: params.layout?.rowHeight ?? DEFAULT_ROW_HEIGHT,
      },
      filters: [],
      cards: [],
    }));
  }

  /**
   * Reconstitute from persistence.
   */
  static fromPersistence(params: {
    id: string;
    name: string;
    description?: string;
    organizationId: string;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    isPublic: boolean;
    layout: DashboardLayout;
    filters: DashboardFilter[];
    cards: DashboardCard[];
  }): Dashboard {
    return new Dashboard(params);
  }

  /**
   * Add a card to the dashboard.
   * Validates card position, size, and checks for overlap with existing cards.
   */
  addCard(params: {
    questionId: string;
    position: CardPosition;
    size: CardSize;
    title?: string;
  }): Result<Dashboard> {
    // Check card limit
    if (this._cards.length >= MAX_CARDS_PER_DASHBOARD) {
      return err(new ValidationError(`Dashboard cannot have more than ${MAX_CARDS_PER_DASHBOARD} cards`));
    }

    // Validate question ID
    if (!params.questionId || params.questionId.trim().length === 0) {
      return err(new ValidationError('Question ID is required'));
    }

    // Validate position
    const posValidation = validateCardPosition(params.position, params.size, this.layout);
    if (!posValidation.ok) return posValidation;

    // Validate size
    const sizeValidation = validateCardSize(params.size);
    if (!sizeValidation.ok) return sizeValidation;

    const newCard = new DashboardCard({
      id: generateId(),
      dashboardId: this.id,
      questionId: params.questionId,
      position: params.position,
      size: params.size,
      title: params.title,
    });

    // Check for overlaps with existing cards
    const overlapCheck = checkOverlap(newCard, this._cards);
    if (!overlapCheck.ok) return overlapCheck;

    const newCards = [...this._cards, newCard];

    return ok(new Dashboard({
      id: this.id,
      name: this.name,
      description: this.description,
      organizationId: this.organizationId,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      isPublic: this.isPublic,
      layout: this.layout,
      filters: this.filters,
      cards: newCards,
    }));
  }

  /**
   * Remove a card by ID.
   */
  removeCard(cardId: string): Result<Dashboard> {
    const cardIndex = this._cards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
      return err(new ValidationError(`Card with id '${cardId}' not found on this dashboard`));
    }

    const newCards = this._cards.filter(c => c.id !== cardId);

    return ok(new Dashboard({
      id: this.id,
      name: this.name,
      description: this.description,
      organizationId: this.organizationId,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      isPublic: this.isPublic,
      layout: this.layout,
      filters: this.filters,
      cards: newCards,
    }));
  }

  /**
   * Update the layout configuration (columns, row height).
   * Re-validates all card positions against the new layout.
   */
  updateLayout(layout: Partial<DashboardLayout>): Result<Dashboard> {
    const newLayout: DashboardLayout = {
      columns: layout.columns ?? this.layout.columns,
      rowHeight: layout.rowHeight ?? this.layout.rowHeight,
    };

    if (newLayout.columns < 1 || newLayout.columns > 48) {
      return err(new ValidationError('Dashboard columns must be between 1 and 48'));
    }
    if (newLayout.rowHeight < 20 || newLayout.rowHeight > 500) {
      return err(new ValidationError('Row height must be between 20 and 500'));
    }

    // Validate all existing cards fit within the new layout
    for (const card of this._cards) {
      if (card.position.x + card.size.width > newLayout.columns) {
        return err(new ValidationError(
          `Card '${card.id}' would exceed the new column limit (${newLayout.columns})`,
        ));
      }
    }

    return ok(new Dashboard({
      id: this.id,
      name: this.name,
      description: this.description,
      organizationId: this.organizationId,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      isPublic: this.isPublic,
      layout: newLayout,
      filters: this.filters,
      cards: this._cards,
    }));
  }

  /**
   * Reorder cards by providing a new ordered list of card IDs.
   * Validates that all current card IDs are present.
   */
  reorderCards(cardIds: string[]): Result<Dashboard> {
    if (cardIds.length !== this._cards.length) {
      return err(new ValidationError('Card ID list must contain exactly the same cards as the dashboard'));
    }

    const currentIds = new Set(this._cards.map(c => c.id));
    for (const id of cardIds) {
      if (!currentIds.has(id)) {
        return err(new ValidationError(`Card '${id}' is not on this dashboard`));
      }
    }

    // Check for duplicates
    const uniqueIds = new Set(cardIds);
    if (uniqueIds.size !== cardIds.length) {
      return err(new ValidationError('Card ID list contains duplicates'));
    }

    const cardMap = new Map(this._cards.map(c => [c.id, c]));
    const reordered = cardIds.map(id => cardMap.get(id)!);

    return ok(new Dashboard({
      id: this.id,
      name: this.name,
      description: this.description,
      organizationId: this.organizationId,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      isPublic: this.isPublic,
      layout: this.layout,
      filters: this.filters,
      cards: reordered,
    }));
  }

  /**
   * Move a card to a new position.
   * Validates no overlap with other cards.
   */
  moveCard(cardId: string, position: CardPosition, size?: CardSize): Result<Dashboard> {
    const cardIndex = this._cards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
      return err(new ValidationError(`Card with id '${cardId}' not found on this dashboard`));
    }

    const existingCard = this._cards[cardIndex]!;
    const newSize = size ?? existingCard.size;

    // Validate position
    const posValidation = validateCardPosition(position, newSize, this.layout);
    if (!posValidation.ok) return posValidation;

    // Validate size
    if (size) {
      const sizeValidation = validateCardSize(size);
      if (!sizeValidation.ok) return sizeValidation;
    }

    const movedCard = new DashboardCard({
      id: existingCard.id,
      dashboardId: this.id,
      questionId: existingCard.questionId,
      position,
      size: newSize,
      title: existingCard.title,
    });

    // Check overlap with all other cards (excluding the card being moved)
    const otherCards = this._cards.filter(c => c.id !== cardId);
    const overlapCheck = checkOverlap(movedCard, otherCards);
    if (!overlapCheck.ok) return overlapCheck;

    const newCards = [...otherCards];
    newCards.splice(cardIndex > otherCards.length ? otherCards.length : cardIndex, 0, movedCard);

    return ok(new Dashboard({
      id: this.id,
      name: this.name,
      description: this.description,
      organizationId: this.organizationId,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      isPublic: this.isPublic,
      layout: this.layout,
      filters: this.filters,
      cards: newCards,
    }));
  }

  /**
   * Update dashboard metadata (name, description, public flag).
   */
  updateMetadata(params: {
    name?: string;
    description?: string;
    isPublic?: boolean;
  }): Result<Dashboard> {
    const newName = params.name ?? this.name;
    if (newName.trim().length === 0) {
      return err(new ValidationError('Dashboard name cannot be empty'));
    }
    if (newName.length > MAX_NAME_LENGTH) {
      return err(new ValidationError(`Dashboard name must be ${MAX_NAME_LENGTH} characters or less`));
    }
    if (params.description !== undefined && params.description.length > MAX_DESCRIPTION_LENGTH) {
      return err(new ValidationError(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`));
    }

    return ok(new Dashboard({
      id: this.id,
      name: newName.trim(),
      description: params.description !== undefined ? params.description.trim() : this.description,
      organizationId: this.organizationId,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      isPublic: params.isPublic ?? this.isPublic,
      layout: this.layout,
      filters: this.filters,
      cards: this._cards,
    }));
  }

  /**
   * Add a dashboard-level filter.
   */
  addFilter(filter: Omit<DashboardFilter, 'id'>): Result<Dashboard> {
    if (!filter.type || filter.type.trim().length === 0) {
      return err(new ValidationError('Filter type is required'));
    }
    if (!filter.column || filter.column.trim().length === 0) {
      return err(new ValidationError('Filter column is required'));
    }

    const newFilter: DashboardFilter = {
      id: generateId(),
      type: filter.type,
      column: filter.column,
      defaultValue: filter.defaultValue,
    };

    return ok(new Dashboard({
      id: this.id,
      name: this.name,
      description: this.description,
      organizationId: this.organizationId,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      isPublic: this.isPublic,
      layout: this.layout,
      filters: [...this.filters, newFilter],
      cards: this._cards,
    }));
  }

  /**
   * Remove a dashboard-level filter.
   */
  removeFilter(filterId: string): Result<Dashboard> {
    const exists = this.filters.some(f => f.id === filterId);
    if (!exists) {
      return err(new ValidationError(`Filter with id '${filterId}' not found`));
    }

    return ok(new Dashboard({
      id: this.id,
      name: this.name,
      description: this.description,
      organizationId: this.organizationId,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      isPublic: this.isPublic,
      layout: this.layout,
      filters: this.filters.filter(f => f.id !== filterId),
      cards: this._cards,
    }));
  }

  /**
   * Find a card by ID.
   */
  findCard(cardId: string): DashboardCard | undefined {
    return this._cards.find(c => c.id === cardId);
  }
}

// --- Validation helpers ---

function validateCardPosition(
  position: CardPosition,
  size: CardSize,
  layout: DashboardLayout,
): Result<void> {
  if (position.x < 0 || position.y < 0) {
    return err(new ValidationError('Card position cannot be negative'));
  }
  if (!Number.isInteger(position.x) || !Number.isInteger(position.y)) {
    return err(new ValidationError('Card position must be integers'));
  }
  if (position.x + size.width > layout.columns) {
    return err(new ValidationError(
      `Card exceeds dashboard width: position.x(${position.x}) + width(${size.width}) > columns(${layout.columns})`,
    ));
  }
  return ok(undefined);
}

function validateCardSize(size: CardSize): Result<void> {
  if (size.width < MIN_CARD_WIDTH || size.height < MIN_CARD_HEIGHT) {
    return err(new ValidationError(
      `Card size must be at least ${MIN_CARD_WIDTH}x${MIN_CARD_HEIGHT}`,
    ));
  }
  if (size.width > MAX_CARD_WIDTH || size.height > MAX_CARD_HEIGHT) {
    return err(new ValidationError(
      `Card size must be at most ${MAX_CARD_WIDTH}x${MAX_CARD_HEIGHT}`,
    ));
  }
  if (!Number.isInteger(size.width) || !Number.isInteger(size.height)) {
    return err(new ValidationError('Card size must be integers'));
  }
  return ok(undefined);
}

/**
 * Check if a card overlaps with any existing cards.
 * Uses axis-aligned bounding box (AABB) collision detection.
 */
function checkOverlap(card: DashboardCard, existingCards: DashboardCard[]): Result<void> {
  const newBounds = card.bounds;

  for (const existing of existingCards) {
    const existingBounds = existing.bounds;

    // AABB overlap test
    const overlaps =
      newBounds.x1 < existingBounds.x2 &&
      newBounds.x2 > existingBounds.x1 &&
      newBounds.y1 < existingBounds.y2 &&
      newBounds.y2 > existingBounds.y1;

    if (overlaps) {
      return err(new ValidationError(
        `Card overlaps with existing card '${existing.id}' at position (${existing.position.x}, ${existing.position.y})`,
      ));
    }
  }

  return ok(undefined);
}

export { checkOverlap, validateCardPosition, validateCardSize };
