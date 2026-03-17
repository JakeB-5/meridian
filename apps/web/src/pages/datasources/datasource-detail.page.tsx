import { useState, useCallback, useMemo } from 'react';
import {
  useDatasource,
  useDatasourceSchema,
  useSyncSchema,
  useDeleteDatasource,
} from '@/api/hooks/use-datasources';
import { useParams, useNavigate } from '@/router';
import { useToast } from '@/components/common/toast';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState } from '@/components/common/error-state';
import { PageLoading, LoadingSpinner } from '@/components/common/loading-spinner';
import { SearchInput } from '@/components/common/search-input';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import { DATABASE_TYPE_LABELS } from '@/lib/constants';
import type { SchemaInfo } from '@/api/types';

export function DatasourceDetailPage() {
  const { id } = useParams({ from: '/datasources/$id' });
  const navigate = useNavigate();
  const toast = useToast();

  const { data: ds, isLoading, isError, error, refetch } = useDatasource(id);
  const { data: schemas, isLoading: isLoadingSchema, refetch: refetchSchema } = useDatasourceSchema(id);
  const syncMutation = useSyncSchema(id);
  const deleteMutation = useDeleteDatasource();

  const [tableSearch, setTableSearch] = useState('');
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);

  useDocumentTitle(ds?.name ?? 'Data Source');

  const handleSync = useCallback(() => {
    syncMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success('Schema sync started');
        refetchSchema();
      },
      onError: (err) => toast.error('Sync failed', err.message),
    });
  }, [syncMutation, refetchSchema, toast]);

  const handleDelete = useCallback(() => {
    if (!ds) return;
    deleteMutation.mutate(ds.id, {
      onSuccess: () => {
        toast.success('Data source deleted');
        navigate({ to: '/datasources' });
      },
      onError: (err) => toast.error('Failed to delete', err.message),
    });
  }, [ds, deleteMutation, navigate, toast]);

  // Flatten and filter tables
  const filteredTables = useMemo(() => {
    if (!schemas) return [];
    const allTables = schemas.flatMap((schema) =>
      schema.tables.map((table) => ({
        ...table,
        schemaName: schema.name,
        fullName: schema.name !== 'public' ? `${schema.name}.${table.name}` : table.name,
      })),
    );
    if (!tableSearch) return allTables;
    const lower = tableSearch.toLowerCase();
    return allTables.filter(
      (t) => t.name.toLowerCase().includes(lower) || t.fullName.toLowerCase().includes(lower),
    );
  }, [schemas, tableSearch]);

  if (isLoading) return <PageLoading message="Loading data source..." />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!ds) return <ErrorState error={new Error('Data source not found')} />;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return '#22c55e';
      case 'error': return '#ef4444';
      default: return '#f59e0b';
    }
  };

  return (
    <div>
      <PageHeader
        title={ds.name}
        description={`${DATABASE_TYPE_LABELS[ds.type] ?? ds.type} database`}
        breadcrumbs={[
          { label: 'Data Sources', href: '/datasources' },
          { label: ds.name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={handleSync} disabled={syncMutation.isPending} className="btn btn-secondary btn-sm">
              {syncMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" />
                  Syncing...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.598a.75.75 0 00-.75.75v3.634a.75.75 0 001.5 0v-2.033l.312.311a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm-1.624-7.848a7 7 0 00-11.712 3.138.75.75 0 001.449.39 5.5 5.5 0 019.201-2.466l.312.311H10.5a.75.75 0 000 1.5h3.634a.75.75 0 00.75-.75V2.065a.75.75 0 00-1.5 0v2.033l-.312-.311-.384-.211z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Sync Schema
                </>
              )}
            </button>
            <button onClick={() => setShowDelete(true)} className="btn btn-danger btn-sm">
              Delete
            </button>
          </div>
        }
      />

      {/* Connection info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card">
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
            Status
          </p>
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getStatusColor(ds.status) }} />
            <span className="text-sm font-semibold capitalize" style={{ color: 'var(--color-text)' }}>
              {ds.status}
            </span>
          </div>
        </div>
        <div className="card">
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
            Connection
          </p>
          <p className="text-sm font-mono truncate" style={{ color: 'var(--color-text)' }}>
            {ds.host ? `${ds.host}:${ds.port ?? ''}/${ds.database}` : ds.database}
          </p>
        </div>
        <div className="card">
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
            Last Synced
          </p>
          <p className="text-sm" style={{ color: 'var(--color-text)' }}>
            {ds.lastSyncAt ? formatRelativeTime(ds.lastSyncAt) : 'Never'}
          </p>
        </div>
      </div>

      {/* Schema browser */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
          Schema Browser
        </h2>
        <SearchInput
          value={tableSearch}
          onChange={setTableSearch}
          placeholder="Search tables..."
        />
      </div>

      {isLoadingSchema ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-12 rounded-lg" />
          ))}
        </div>
      ) : filteredTables.length === 0 ? (
        <div
          className="text-center py-12 rounded-lg"
          style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {tableSearch ? 'No tables match your search' : 'No tables found. Try syncing the schema.'}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {filteredTables.map((table) => {
            const isExpanded = expandedTable === table.fullName;
            return (
              <div key={table.fullName}>
                <button
                  onClick={() => setExpandedTable(isExpanded ? null : table.fullName)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition-colors hover:bg-[var(--color-bg-tertiary)]"
                  style={{ border: '1px solid var(--color-border)' }}
                >
                  <svg
                    className={cn('h-4 w-4 transition-transform flex-shrink-0', isExpanded && 'rotate-90')}
                    style={{ color: 'var(--color-text-tertiary)' }}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <svg className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--color-primary)' }} viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M.99 5.24A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25l.01 9.5A2.25 2.25 0 0116.76 17H3.26A2.25 2.25 0 011 14.75V5.25zM3.25 4.5a.75.75 0 00-.75.75v9.5c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75l-.01-9.5a.75.75 0 00-.75-.75H3.25z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-sm font-medium flex-1" style={{ color: 'var(--color-text)' }}>
                    {table.fullName}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {table.columns.length} columns
                    {table.rowCount !== undefined && ` | ~${table.rowCount.toLocaleString()} rows`}
                  </span>
                </button>

                {/* Expanded column list */}
                {isExpanded && (
                  <div
                    className="ml-11 mt-1 mb-2 rounded-lg overflow-hidden"
                    style={{ border: '1px solid var(--color-border)' }}
                  >
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                          <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                            Column
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                            Type
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                            Nullable
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                            Key
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold hidden md:table-cell" style={{ color: 'var(--color-text-secondary)' }}>
                            Default
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {table.columns.map((col) => (
                          <tr
                            key={col.name}
                            style={{ borderTop: '1px solid var(--color-border-light)' }}
                          >
                            <td className="px-3 py-1.5 font-mono text-xs" style={{ color: 'var(--color-text)' }}>
                              {col.name}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                              {col.type}
                            </td>
                            <td className="px-3 py-1.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                              {col.nullable ? 'yes' : 'no'}
                            </td>
                            <td className="px-3 py-1.5 text-xs">
                              {col.primaryKey && (
                                <span className="badge badge-info">PK</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-xs hidden md:table-cell" style={{ color: 'var(--color-text-tertiary)' }}>
                              {col.defaultValue ?? '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete Data Source"
        description={`Are you sure you want to delete "${ds.name}"? All questions using this data source will stop working.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
