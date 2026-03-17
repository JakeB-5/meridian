/** Position of a card on a dashboard grid */
export interface CardPosition {
  x: number;
  y: number;
}

/** Size of a card in grid units */
export interface CardSize {
  width: number;
  height: number;
}

/** Dashboard grid layout configuration */
export interface DashboardLayout {
  columns: number;
  rowHeight: number;
}

/** A card placed on a dashboard */
export interface DashboardCardData {
  id: string;
  dashboardId: string;
  questionId: string;
  position: CardPosition;
  size: CardSize;
}

/** Dashboard-level filter */
export interface DashboardFilter {
  id: string;
  type: string;
  column: string;
  defaultValue?: unknown;
}
