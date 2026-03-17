import { useState, useCallback } from 'react';
import { useDatasources, useDeleteDatasource } from '@/api/hooks/use-datasources';
import { useNavigate } from '@/router';
import { useToast } from '@/components/common/toast';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useDebounce } from '@/hooks/use-debounce';
import { PageHeader } from '@/components/common/page-header';
import { SearchInput } from '@/components/common/search-input';
import { Pagination } from '@/components/common/pagination';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { ListPageSkeleton } from '@/components/common/skeleton';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import { PAGINATION, DATABASE_TYPE_LABELS } from '@/lib/constants';
import type { DataSourceResponse, PaginatedRequest } from '@/api/types';

export function DatasourceListPage() {
  useDocumentTitle('Data Sources');

  const navigate = useNavigate();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(PAGINATION.DEFAULT_PAGE);
  const [deleteTarget, setDeleteTarget] = useState<DataSourceResponse | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  const params: PaginatedRequest = {
    page,
    pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
    search: debouncedSearch || undefined,
    sortBy: 'name',
    sortDirection: 'asc',
  };

  const { data, isLoading, isError, error, refetch } = useDatasources(params);
  const deleteMutation = useDeleteDatasource();

  const handleDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success('Data source deleted');
        setDeleteTarget(null);
      },
      onError: (err) => toast.error('Failed to delete', err.message),
    });
  }, [deleteTarget, deleteMutation, toast]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return <span className="badge badge-success">Connected</span>;
      case 'error':
        return <span className="badge badge-danger">Error</span>;
      default:
        return <span className="badge badge-warning">Disconnected</span>;
    }
  };

  return (
    <div>
      <PageHeader
        title="Data Sources"
        description="Connect and manage your database connections"
        actions={
          <button
            onClick={() => navigate({ to: '/datasources/new' })}
            className="btn btn-primary"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Add Data Source
          </button>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <SearchInput
          value={search}
          onChange={(val) => { setSearch(val); setPage(1); }}
          placeholder="Search data sources..."
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <ListPageSkeleton rows={5} columns={5} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          icon={
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
            </svg>
          }
          title={debouncedSearch ? 'No data sources found' : 'No data sources yet'}
          description={
            debouncedSearch
              ? 'Try adjusting your search'
              : 'Add your first data source to start querying data'
          }
          action={
            !debouncedSearch && (
              <button
                onClick={() => navigate({ to: '/datasources/new' })}
                className="btn btn-primary"
              >
                Add Data Source
              </button>
            )
          }
        />
      ) : (
        <>
          {/* Data sources grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.data.map((ds) => (
              <div
                key={ds.id}
                className="card card-hover cursor-pointer group"
                onClick={() => navigate({ to: '/datasources/$id', params: { id: ds.id } })}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {/* Database type icon */}
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold"
                      style={{
                        backgroundColor: 'var(--color-primary-light)',
                        color: 'var(--color-primary)',
                      }}
                    >
                      {getDatabaseIcon(ds.type)}
                    </div>
                    <div>
                      <h3
                        className="text-sm font-semibold"
                        style={{ color: 'var(--color-text)' }}
                      >
                        {ds.name}
                      </h3>
                      <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        {DATABASE_TYPE_LABELS[ds.type] ?? ds.type}
                      </p>
                    </div>
                  </div>

                  {/* Status */}
                  {getStatusBadge(ds.status)}
                </div>

                {/* Connection info */}
                <div className="space-y-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  {ds.host && (
                    <p className="truncate">
                      Host: {ds.host}{ds.port ? `:${ds.port}` : ''}
                    </p>
                  )}
                  <p className="truncate">Database: {ds.database}</p>
                  {ds.tableCount !== undefined && (
                    <p>{ds.tableCount} tables</p>
                  )}
                </div>

                {/* Footer */}
                <div
                  className="flex items-center justify-between mt-3 pt-3 border-t text-xs"
                  style={{
                    borderColor: 'var(--color-border-light)',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  <span>
                    {ds.lastSyncAt ? `Synced ${formatRelativeTime(ds.lastSyncAt)}` : 'Never synced'}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(ds);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex justify-center mt-6">
              <Pagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
            </div>
          )}
        </>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Data Source"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? All questions using this data source will stop working.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

function getDatabaseIcon(type: string): string {
  switch (type) {
    case 'postgresql': return 'PG';
    case 'mysql': return 'My';
    case 'sqlite': return 'SL';
    case 'clickhouse': return 'CH';
    case 'bigquery': return 'BQ';
    case 'snowflake': return 'SF';
    case 'duckdb': return 'DK';
    default: return 'DB';
  }
}
