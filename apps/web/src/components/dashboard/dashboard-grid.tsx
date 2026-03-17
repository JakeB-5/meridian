import { useMemo } from 'react';
import { DashboardCardWrapper } from './dashboard-card-wrapper';
import { cn } from '@/lib/utils';
import { DASHBOARD_GRID } from '@/lib/constants';
import type { DashboardCardResponse, QueryResult } from '@/api/types';

interface DashboardGridProps {
  cards: DashboardCardResponse[];
  columns: number;
  rowHeight: number;
  cardResults: Record<string, QueryResult>;
  editable?: boolean;
  selectedCardId?: string | null;
  onCardSelect?: (id: string | null) => void;
  onCardMove?: (id: string, position: { x: number; y: number }) => void;
  onCardResize?: (id: string, size: { width: number; height: number }) => void;
  onCardRemove?: (id: string) => void;
}

export function DashboardGrid({
  cards,
  columns,
  rowHeight,
  cardResults,
  editable = false,
  selectedCardId,
  onCardSelect,
  onCardMove,
  onCardResize,
  onCardRemove,
}: DashboardGridProps) {
  // Calculate total grid height
  const totalRows = useMemo(() => {
    if (cards.length === 0) return 4;
    return Math.max(
      ...cards.map((c) => c.position.y + c.size.height),
      4,
    );
  }, [cards]);

  const margin = DASHBOARD_GRID.MARGIN;

  return (
    <div
      className="relative"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gridAutoRows: `${rowHeight}px`,
        gap: `${margin}px`,
        minHeight: editable ? `${totalRows * (rowHeight + margin)}px` : undefined,
      }}
    >
      {/* Grid background lines for editor */}
      {editable && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(to right, var(--color-border-light) 1px, transparent 1px),
              linear-gradient(to bottom, var(--color-border-light) 1px, transparent 1px)
            `,
            backgroundSize: `calc(100% / ${columns}) ${rowHeight + margin}px`,
            opacity: 0.5,
            borderRadius: 'var(--radius-lg)',
          }}
        />
      )}

      {cards.map((card) => (
        <div
          key={card.id}
          style={{
            gridColumn: `${card.position.x + 1} / span ${card.size.width}`,
            gridRow: `${card.position.y + 1} / span ${card.size.height}`,
          }}
        >
          <DashboardCardWrapper
            card={card}
            result={cardResults[card.questionId]}
            editable={editable}
            selected={selectedCardId === card.id}
            onSelect={() => onCardSelect?.(card.id)}
            onRemove={() => onCardRemove?.(card.id)}
            onMove={(position) => onCardMove?.(card.id, position)}
            onResize={(size) => onCardResize?.(card.id, size)}
          />
        </div>
      ))}

      {/* Drop zone indicator for editor */}
      {editable && cards.length === 0 && (
        <div
          className="col-span-full row-span-4 flex flex-col items-center justify-center rounded-xl"
          style={{
            border: '2px dashed var(--color-border)',
            backgroundColor: 'var(--color-bg-secondary)',
          }}
        >
          <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            Click "Add Card" to add visualizations to this dashboard
          </p>
        </div>
      )}
    </div>
  );
}
