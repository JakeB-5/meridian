import { useState, useCallback } from 'react';
import { useDashboards, useDeleteDashboard, useDuplicateDashboard } from '@/api/hooks/use-dashboards';
import { useNavigate } from '@/router';
import { useToast } from '@/components/common/toast';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useDebounce } from '@/hooks/use-debounce';
import { PageHeader } from '@/components/common/page-header';
import { SearchInput } from '@/components/common/search-input';
import { Pagination } from '@/components/common/pagination';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { CardGridSkeleton } from '@/components/common/skeleton';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { cn } from '@/lib/utils';
import { formatRelativeTime, truncate } from '@/lib/utils';
import { PAGINATION } from '@/lib/constants';
import type { DashboardResponse, PaginatedRequest } from '@/api/types';

export function DashboardListPage() {
  useDocumentTitle('Dashboards');

  const navigate = useNavigate();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(PAGINATION.DEFAULT_PAGE);
  const [sortBy, setSortBy] = useState<string>('updatedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [deleteTarget, setDeleteTarget] = useState<DashboardResponse | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  const params: PaginatedRequest = {
    page,
    pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
    search: debouncedSearch || undefined,
    sortBy,
    sortDirection,
  };

  const { data, isLoading, isError, error, refetch } = useDashboards(params);
  const deleteMutation = useDeleteDashboard();
  const duplicateMutation = useDuplicateDashboard();

  const handleCreate = useCallback(() => {
    // Navigate to a create flow — for now, just use a simple prompt approach
    // In a full implementation this would open a modal or dedicated page
    const name = window.prompt('Dashboard name:');
    if (!name?.trim()) return;
    // We will redirect to editor with a new dashboard
    navigate({ to: '/dashboards' });
    toast.info('Use the API to create a dashboard, then edit it.');
  }, [navigate, toast]);

  const handleDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success('Dashboard deleted');
        setDeleteTarget(null);
      },
      onError: (err) => {
        toast.error('Failed to delete dashboard', err.message);
      },
    });
  }, [deleteTarget, deleteMutation, toast]);

  const handleDuplicate = useCallback(
    (id: string) => {
      duplicateMutation.mutate(id, {
        onSuccess: () => {
          toast.success('Dashboard duplicated');
        },
        onError: (err) => {
          toast.error('Failed to duplicate dashboard', err.message);
        },
      });
    },
    [duplicateMutation, toast],
  );

  return (
    <div>
      <PageHeader
        title="Dashboards"
        description="Create and manage your data dashboards"
        actions={
          <button onClick={handleCreate} className="btn btn-primary">
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            New Dashboard
          </button>
        }
      />

      {/* Filters bar */}
      <div className="flex items-center gap-3 mb-6">
        <SearchInput
          value={search}
          onChange={(val) => {
            setSearch(val);
            setPage(1);
          }}
          placeholder="Search dashboards..."
        />
        <div className="flex items-center gap-2 ml-auto">
          <select
            value={`${sortBy}:${sortDirection}`}
            onChange={(e) => {
              const [field, dir] = e.target.value.split(':');
              setSortBy(field);
              setSortDirection(dir as 'asc' | 'desc');
            }}
            className="input text-sm"
            style={{ width: 'auto' }}
          >
            <option value="updatedAt:desc">Recently updated</option>
            <option value="createdAt:desc">Newest first</option>
            <option value="createdAt:asc">Oldest first</option>
            <option value="name:asc">Name A-Z</option>
            <option value="name:desc">Name Z-A</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <CardGridSkeleton count={6} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          icon={
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
          }
          title={debouncedSearch ? 'No dashboards found' : 'No dashboards yet'}
          description={
            debouncedSearch
              ? 'Try a different search term'
              : 'Create your first dashboard to start visualizing data'
          }
          action={
            !debouncedSearch && (
              <button onClick={handleCreate} className="btn btn-primary">
                Create Dashboard
              </button>
            )
          }
        />
      ) : (
        <>
          {/* Dashboard cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.data.map((dashboard) => (
              <DashboardCard
                key={dashboard.id}
                dashboard={dashboard}
                onView={() => navigate({ to: '/dashboards/$id', params: { id: dashboard.id } })}
                onEdit={() => navigate({ to: '/dashboards/$id/edit', params: { id: dashboard.id } })}
                onDuplicate={() => handleDuplicate(dashboard.id)}
                onDelete={() => setDeleteTarget(dashboard)}
              />
            ))}
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex justify-center mt-8">
              <Pagination
                page={data.page}
                totalPages={data.totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Dashboard"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

// ── Dashboard Card ───────────────────────────────────────────────────

interface DashboardCardProps {
  dashboard: DashboardResponse;
  onView: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function DashboardCard({ dashboard, onView, onEdit, onDuplicate, onDelete }: DashboardCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="card card-hover cursor-pointer group relative" onClick={onView}>
      {/* Card header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <h3
            className="text-base font-semibold truncate"
            style={{ color: 'var(--color-text)' }}
          >
            {dashboard.name}
          </h3>
          {dashboard.description && (
            <p
              className="text-sm mt-0.5 line-clamp-2"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {truncate(dashboard.description, 100)}
            </p>
          )}
        </div>

        {/* More menu */}
        <div className="relative flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            className="btn btn-ghost btn-icon btn-sm opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
            </svg>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
              <div
                className="absolute right-0 top-full mt-1 w-40 rounded-lg py-1 shadow-lg z-20"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(); }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-[var(--color-bg-tertiary)]"
                  style={{ color: 'var(--color-text)' }}
                >
                  Edit
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDuplicate(); }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-[var(--color-bg-tertiary)]"
                  style={{ color: 'var(--color-text)' }}
                >
                  Duplicate
                </button>
                <div className="border-t my-1" style={{ borderColor: 'var(--color-border)' }} />
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Card metrics */}
      <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        <span className="flex items-center gap-1">
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 006.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 011.767-1.052l3.223.716A1.5 1.5 0 0118 15.352V16.5a1.5 1.5 0 01-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 012.43 8.326 13.019 13.019 0 012 5V3.5z" />
          </svg>
          {dashboard.cards.length} cards
        </span>
        <span>{formatRelativeTime(dashboard.updatedAt)}</span>
        {dashboard.isPublic && (
          <span className="badge badge-info">Public</span>
        )}
      </div>

      {/* Tags */}
      {dashboard.tags && dashboard.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {dashboard.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded text-xs"
              style={{
                backgroundColor: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {tag}
            </span>
          ))}
          {dashboard.tags.length > 3 && (
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              +{dashboard.tags.length - 3} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}
