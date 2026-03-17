import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  useDashboard,
  useUpdateDashboard,
  useAddDashboardCard,
  useRemoveDashboardCard,
  useDashboardCardResults,
} from '@/api/hooks/use-dashboards';
import { useQuestions } from '@/api/hooks/use-questions';
import { useParams, useNavigate } from '@/router';
import { useToast } from '@/components/common/toast';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState } from '@/components/common/error-state';
import { PageLoading } from '@/components/common/loading-spinner';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { SearchInput } from '@/components/common/search-input';
import { DashboardGrid } from '@/components/dashboard/dashboard-grid';
import { cn } from '@/lib/utils';
import { generateId, deepClone } from '@/lib/utils';
import { DASHBOARD_GRID } from '@/lib/constants';
import type {
  DashboardCardData,
  DashboardFilter,
  DashboardCardResponse,
  DashboardResponse,
  UpdateDashboardRequest,
} from '@/api/types';

export function DashboardEditorPage() {
  const { id } = useParams({ from: '/dashboards/$id/edit' });
  const navigate = useNavigate();
  const toast = useToast();

  const { data: dashboard, isLoading, isError, error, refetch } = useDashboard(id);
  const { data: cardResults } = useDashboardCardResults(id);
  const updateMutation = useUpdateDashboard(id);

  // Local editor state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cards, setCards] = useState<DashboardCardResponse[]>([]);
  const [filters, setFilters] = useState<DashboardFilter[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  useDocumentTitle(dashboard ? `Edit: ${dashboard.name}` : 'Edit Dashboard');

  // Initialize local state from fetched dashboard
  useEffect(() => {
    if (dashboard) {
      setName(dashboard.name);
      setDescription(dashboard.description ?? '');
      setCards(deepClone(dashboard.cards));
      setFilters(deepClone(dashboard.filters));
    }
  }, [dashboard]);

  const handleSave = useCallback(() => {
    const update: UpdateDashboardRequest = {
      name: name.trim(),
      description: description.trim() || undefined,
      cards: cards.map((c) => ({
        id: c.id,
        dashboardId: id,
        questionId: c.questionId,
        position: c.position,
        size: c.size,
      })),
      filters,
    };

    updateMutation.mutate(update, {
      onSuccess: () => {
        toast.success('Dashboard saved');
        setIsDirty(false);
      },
      onError: (err) => {
        toast.error('Failed to save dashboard', err.message);
      },
    });
  }, [name, description, cards, filters, id, updateMutation, toast]);

  const handleAddCard = useCallback(
    (questionId: string, questionName: string) => {
      // Find next available position
      const maxY = cards.reduce((max, c) => Math.max(max, c.position.y + c.size.height), 0);

      const newCard: DashboardCardResponse = {
        id: generateId(),
        dashboardId: id,
        questionId,
        questionName,
        position: { x: 0, y: maxY },
        size: {
          width: DASHBOARD_GRID.DEFAULT_CARD_WIDTH,
          height: DASHBOARD_GRID.DEFAULT_CARD_HEIGHT,
        },
      };

      setCards((prev) => [...prev, newCard]);
      setIsDirty(true);
      setShowAddCard(false);
      toast.success(`Added "${questionName}" to dashboard`);
    },
    [cards, id, toast],
  );

  const handleRemoveCard = useCallback(
    (cardId: string) => {
      setCards((prev) => prev.filter((c) => c.id !== cardId));
      setIsDirty(true);
      setSelectedCardId(null);
    },
    [],
  );

  const handleCardMove = useCallback(
    (cardId: string, position: { x: number; y: number }) => {
      setCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, position } : c)),
      );
      setIsDirty(true);
    },
    [],
  );

  const handleCardResize = useCallback(
    (cardId: string, size: { width: number; height: number }) => {
      setCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, size } : c)),
      );
      setIsDirty(true);
    },
    [],
  );

  const handleAddFilter = useCallback(() => {
    const newFilter: DashboardFilter = {
      id: generateId(),
      type: 'text',
      column: '',
    };
    setFilters((prev) => [...prev, newFilter]);
    setIsDirty(true);
  }, []);

  const handleRemoveFilter = useCallback((filterId: string) => {
    setFilters((prev) => prev.filter((f) => f.id !== filterId));
    setIsDirty(true);
  }, []);

  const handleUpdateFilter = useCallback(
    (filterId: string, updates: Partial<DashboardFilter>) => {
      setFilters((prev) =>
        prev.map((f) => (f.id === filterId ? { ...f, ...updates } : f)),
      );
      setIsDirty(true);
    },
    [],
  );

  const handleBack = useCallback(() => {
    if (isDirty) {
      setShowDiscardDialog(true);
    } else {
      navigate({ to: '/dashboards/$id', params: { id } });
    }
  }, [isDirty, navigate, id]);

  if (isLoading) return <PageLoading message="Loading dashboard editor..." />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!dashboard) return <ErrorState error={new Error('Dashboard not found')} />;

  const columns = dashboard.layout?.columns ?? DASHBOARD_GRID.COLUMNS;
  const rowHeight = dashboard.layout?.rowHeight ?? DASHBOARD_GRID.ROW_HEIGHT;

  return (
    <div>
      <PageHeader
        title="Edit Dashboard"
        breadcrumbs={[
          { label: 'Dashboards', href: '/dashboards' },
          { label: dashboard.name, href: `/dashboards/${id}` },
          { label: 'Edit' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {isDirty && (
              <span className="text-xs font-medium" style={{ color: 'var(--color-warning)' }}>
                Unsaved changes
              </span>
            )}
            <button onClick={handleBack} className="btn btn-secondary btn-sm">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending || !isDirty}
              className="btn btn-primary btn-sm"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        }
      />

      {/* Dashboard metadata */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label htmlFor="dash-name" className="label">
            Dashboard Name
          </label>
          <input
            id="dash-name"
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setIsDirty(true); }}
            className="input"
            placeholder="My Dashboard"
          />
        </div>
        <div>
          <label htmlFor="dash-desc" className="label">
            Description
          </label>
          <input
            id="dash-desc"
            type="text"
            value={description}
            onChange={(e) => { setDescription(e.target.value); setIsDirty(true); }}
            className="input"
            placeholder="Describe this dashboard..."
          />
        </div>
      </div>

      {/* Toolbar */}
      <div
        className="flex items-center gap-3 mb-6 p-3 rounded-lg"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
        }}
      >
        <button onClick={() => setShowAddCard(true)} className="btn btn-primary btn-sm">
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          Add Card
        </button>

        <button onClick={handleAddFilter} className="btn btn-secondary btn-sm">
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 012 4.629V2.34a.75.75 0 01.628-.74z"
              clipRule="evenodd"
            />
          </svg>
          Add Filter
        </button>

        <div className="ml-auto text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          {cards.length} card{cards.length !== 1 ? 's' : ''} &middot; {columns} columns
        </div>
      </div>

      {/* Filters editor */}
      {filters.length > 0 && (
        <div className="mb-6 space-y-2">
          <h3 className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            Dashboard Filters
          </h3>
          {filters.map((filter) => (
            <div
              key={filter.id}
              className="flex items-center gap-3 p-3 rounded-lg"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
              }}
            >
              <input
                type="text"
                value={filter.column}
                onChange={(e) => handleUpdateFilter(filter.id, { column: e.target.value })}
                className="input text-sm"
                placeholder="Column name"
                style={{ maxWidth: '200px' }}
              />
              <select
                value={filter.type}
                onChange={(e) => handleUpdateFilter(filter.id, { type: e.target.value })}
                className="input text-sm"
                style={{ width: 'auto' }}
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="select">Select</option>
              </select>
              <input
                type="text"
                value={(filter.defaultValue as string) ?? ''}
                onChange={(e) =>
                  handleUpdateFilter(filter.id, { defaultValue: e.target.value || undefined })
                }
                className="input text-sm flex-1"
                placeholder="Default value (optional)"
              />
              <button
                onClick={() => handleRemoveFilter(filter.id)}
                className="btn btn-ghost btn-icon btn-sm text-red-500"
                title="Remove filter"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Dashboard grid (editable) */}
      <DashboardGrid
        cards={cards}
        columns={columns}
        rowHeight={rowHeight}
        cardResults={cardResults ?? {}}
        editable={true}
        selectedCardId={selectedCardId}
        onCardSelect={setSelectedCardId}
        onCardMove={handleCardMove}
        onCardResize={handleCardResize}
        onCardRemove={handleRemoveCard}
      />

      {/* Add Card Sidebar/Modal */}
      {showAddCard && (
        <AddCardPanel
          onAdd={handleAddCard}
          onClose={() => setShowAddCard(false)}
        />
      )}

      {/* Discard changes dialog */}
      <ConfirmDialog
        open={showDiscardDialog}
        onClose={() => setShowDiscardDialog(false)}
        onConfirm={() => navigate({ to: '/dashboards/$id', params: { id } })}
        title="Discard Changes"
        description="You have unsaved changes. Are you sure you want to discard them?"
        confirmLabel="Discard"
        variant="danger"
      />
    </div>
  );
}

// ── Add Card Panel ───────────────────────────────────────────────────

interface AddCardPanelProps {
  onAdd: (questionId: string, questionName: string) => void;
  onClose: () => void;
}

function AddCardPanel({ onAdd, onClose }: AddCardPanelProps) {
  const [search, setSearch] = useState('');
  const { data: questions, isLoading } = useQuestions({ search: search || undefined, pageSize: 50 });

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 h-full w-96 z-50 flex flex-col shadow-xl"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderLeft: '1px solid var(--color-border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <h3 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
            Add Card
          </h3>
          <button onClick={onClose} className="btn btn-ghost btn-icon btn-sm">
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search questions..."
            autoFocus
          />
        </div>

        {/* Question list */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 scrollbar-thin">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton h-16 rounded-lg" />
              ))}
            </div>
          ) : !questions || questions.data.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {search ? 'No questions found' : 'No questions available'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {questions.data.map((question) => (
                <button
                  key={question.id}
                  onClick={() => onAdd(question.id, question.name)}
                  className="w-full text-left p-3 rounded-lg transition-colors hover:bg-[var(--color-bg-tertiary)]"
                  style={{ border: '1px solid var(--color-border)' }}
                >
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                    {question.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                    {question.visualization.type} &middot; {question.dataSourceName ?? 'Unknown source'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
