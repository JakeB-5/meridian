import { useState, useCallback, useMemo, useEffect } from 'react';
import { useDashboard, useDashboardCardResults, useRefreshDashboard } from '@/api/hooks/use-dashboards';
import { useParams, useNavigate } from '@/router';
import { useToast } from '@/components/common/toast';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useDashboardWebSocket } from '@/hooks/use-websocket';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState } from '@/components/common/error-state';
import { PageLoading } from '@/components/common/loading-spinner';
import { DashboardGrid } from '@/components/dashboard/dashboard-grid';
import { DashboardCardWrapper } from '@/components/dashboard/dashboard-card-wrapper';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import { DASHBOARD_GRID } from '@/lib/constants';
import type { DashboardCardResponse, QueryResult } from '@/api/types';

export function DashboardDetailPage() {
  const { id } = useParams({ from: '/dashboards/$id' });
  const navigate = useNavigate();
  const toast = useToast();

  const { data: dashboard, isLoading, isError, error, refetch } = useDashboard(id);
  const { data: cardResults, refetch: refetchResults } = useDashboardCardResults(id);
  const refreshMutation = useRefreshDashboard(id);

  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, unknown>>({});
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useDocumentTitle(dashboard?.name ?? 'Dashboard');

  // WebSocket for real-time updates
  const ws = useDashboardWebSocket(id, (payload) => {
    // Handle real-time data update for a specific card
    refetchResults();
    setLastRefresh(new Date());
  });

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh || !dashboard?.refreshInterval) return;

    const interval = setInterval(() => {
      refreshMutation.mutate(undefined, {
        onSuccess: () => {
          setLastRefresh(new Date());
        },
      });
    }, (dashboard.refreshInterval ?? 60) * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, dashboard?.refreshInterval, refreshMutation]);

  const handleRefresh = useCallback(() => {
    refreshMutation.mutate(undefined, {
      onSuccess: () => {
        setLastRefresh(new Date());
        toast.success('Dashboard refreshed');
      },
      onError: (err) => {
        toast.error('Failed to refresh', err.message);
      },
    });
  }, [refreshMutation, toast]);

  const handleFilterChange = useCallback(
    (filterId: string, value: unknown) => {
      setFilterValues((prev) => ({ ...prev, [filterId]: value }));
    },
    [],
  );

  if (isLoading) return <PageLoading message="Loading dashboard..." />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!dashboard) return <ErrorState error={new Error('Dashboard not found')} />;

  const columns = dashboard.layout?.columns ?? DASHBOARD_GRID.COLUMNS;
  const rowHeight = dashboard.layout?.rowHeight ?? DASHBOARD_GRID.ROW_HEIGHT;

  return (
    <div>
      <PageHeader
        title={dashboard.name}
        description={dashboard.description}
        breadcrumbs={[
          { label: 'Dashboards', href: '/dashboards' },
          { label: dashboard.name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {/* Last refresh indicator */}
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Updated {formatRelativeTime(lastRefresh)}
            </span>

            {/* WebSocket status */}
            <div
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor:
                  ws.status === 'connected' ? '#22c55e' : ws.status === 'connecting' ? '#f59e0b' : '#ef4444',
              }}
              title={`WebSocket: ${ws.status}`}
            />

            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={cn('btn btn-sm', autoRefresh ? 'btn-primary' : 'btn-secondary')}
              title={autoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh'}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.598a.75.75 0 00-.75.75v3.634a.75.75 0 001.5 0v-2.033l.312.311a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm-1.624-7.848a7 7 0 00-11.712 3.138.75.75 0 001.449.39 5.5 5.5 0 019.201-2.466l.312.311H10.5a.75.75 0 000 1.5h3.634a.75.75 0 00.75-.75V2.065a.75.75 0 00-1.5 0v2.033l-.312-.311-.384-.211z"
                  clipRule="evenodd"
                />
              </svg>
              {autoRefresh ? 'Auto' : 'Auto'}
            </button>

            {/* Refresh button */}
            <button
              onClick={handleRefresh}
              disabled={refreshMutation.isPending}
              className="btn btn-secondary btn-sm"
            >
              <svg
                className={cn('h-4 w-4', refreshMutation.isPending && 'animate-spin')}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.598a.75.75 0 00-.75.75v3.634a.75.75 0 001.5 0v-2.033l.312.311a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm-1.624-7.848a7 7 0 00-11.712 3.138.75.75 0 001.449.39 5.5 5.5 0 019.201-2.466l.312.311H10.5a.75.75 0 000 1.5h3.634a.75.75 0 00.75-.75V2.065a.75.75 0 00-1.5 0v2.033l-.312-.311-.384-.211z"
                  clipRule="evenodd"
                />
              </svg>
              Refresh
            </button>

            {/* Edit button */}
            <button
              onClick={() => navigate({ to: '/dashboards/$id/edit', params: { id } })}
              className="btn btn-primary btn-sm"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
              </svg>
              Edit
            </button>
          </div>
        }
      />

      {/* Dashboard filters */}
      {dashboard.filters.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 mb-6 p-4 rounded-lg"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
          }}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            Filters:
          </span>
          {dashboard.filters.map((filter) => (
            <div key={filter.id} className="flex items-center gap-2">
              <label
                className="text-sm"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {filter.column}:
              </label>
              <input
                type="text"
                value={(filterValues[filter.id] as string) ?? (filter.defaultValue as string) ?? ''}
                onChange={(e) => handleFilterChange(filter.id, e.target.value)}
                className="input text-sm"
                style={{ width: '160px' }}
                placeholder={`Filter by ${filter.column}`}
              />
            </div>
          ))}
        </div>
      )}

      {/* Dashboard grid */}
      {dashboard.cards.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-20 rounded-xl"
          style={{
            border: '2px dashed var(--color-border)',
            backgroundColor: 'var(--color-bg-secondary)',
          }}
        >
          <svg
            className="h-12 w-12 mb-4"
            style={{ color: 'var(--color-text-tertiary)' }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>
          <p className="text-lg font-medium mb-1" style={{ color: 'var(--color-text)' }}>
            This dashboard is empty
          </p>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
            Add cards to start building your dashboard
          </p>
          <button
            onClick={() => navigate({ to: '/dashboards/$id/edit', params: { id } })}
            className="btn btn-primary"
          >
            Edit Dashboard
          </button>
        </div>
      ) : (
        <DashboardGrid
          cards={dashboard.cards}
          columns={columns}
          rowHeight={rowHeight}
          cardResults={cardResults ?? {}}
          editable={false}
        />
      )}
    </div>
  );
}
