import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VisualBuilder } from './visual-builder';
import type { VisualQuery } from '@meridian/shared';

// Mock datasource schema hook
vi.mock('@/api/hooks/use-datasources', () => ({
  useDatasourceSchema: (id: string) => ({
    data: id ? [
      {
        name: 'public',
        tables: [
          {
            name: 'users',
            schema: 'public',
            columns: [
              { name: 'id', type: 'integer', nullable: false, primaryKey: true },
              { name: 'name', type: 'text', nullable: false, primaryKey: false },
              { name: 'email', type: 'text', nullable: false, primaryKey: false },
              { name: 'created_at', type: 'timestamp', nullable: false, primaryKey: false },
            ],
            rowCount: 1000,
          },
          {
            name: 'orders',
            schema: 'public',
            columns: [
              { name: 'id', type: 'integer', nullable: false, primaryKey: true },
              { name: 'user_id', type: 'integer', nullable: false, primaryKey: false },
              { name: 'total', type: 'numeric', nullable: false, primaryKey: false },
              { name: 'status', type: 'text', nullable: true, primaryKey: false },
            ],
            rowCount: 5000,
          },
        ],
      },
    ] : null,
    isLoading: false,
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

const defaultQuery: VisualQuery = {
  dataSourceId: 'ds-1',
  table: '',
  columns: [],
  filters: [],
  sorts: [],
  aggregations: [],
  groupBy: [],
  limit: 1000,
};

describe('VisualBuilder', () => {
  it('should show prompt when no data source is selected', () => {
    const onChange = vi.fn();
    render(
      <VisualBuilder dataSourceId="" query={defaultQuery} onChange={onChange} />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByText('Select a data source to start building your query')).toBeDefined();
  });

  it('should render table selector when data source is selected', () => {
    const onChange = vi.fn();
    render(
      <VisualBuilder dataSourceId="ds-1" query={defaultQuery} onChange={onChange} />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByText('Table')).toBeDefined();
  });

  it('should show columns when a table is selected', () => {
    const onChange = vi.fn();
    const queryWithTable: VisualQuery = { ...defaultQuery, table: 'users' };

    render(
      <VisualBuilder dataSourceId="ds-1" query={queryWithTable} onChange={onChange} />,
      { wrapper: createWrapper() },
    );

    // Should show column buttons
    expect(screen.getByText('Columns')).toBeDefined();
    expect(screen.getByText((content) => content.includes('id'))).toBeDefined();
  });

  it('should show filter, aggregation, sort, and limit sections', () => {
    const onChange = vi.fn();
    const queryWithTable: VisualQuery = { ...defaultQuery, table: 'users' };

    render(
      <VisualBuilder dataSourceId="ds-1" query={queryWithTable} onChange={onChange} />,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText('Filters')).toBeDefined();
    expect(screen.getByText('Aggregations')).toBeDefined();
    expect(screen.getByText('Sort')).toBeDefined();
    expect(screen.getByText('Limit')).toBeDefined();
  });

  it('should have Add Filter button', () => {
    const onChange = vi.fn();
    const queryWithTable: VisualQuery = { ...defaultQuery, table: 'users' };

    render(
      <VisualBuilder dataSourceId="ds-1" query={queryWithTable} onChange={onChange} />,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText('+ Add Filter')).toBeDefined();
  });

  it('should have Add Aggregation button', () => {
    const onChange = vi.fn();
    const queryWithTable: VisualQuery = { ...defaultQuery, table: 'users' };

    render(
      <VisualBuilder dataSourceId="ds-1" query={queryWithTable} onChange={onChange} />,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText('+ Add Aggregation')).toBeDefined();
  });
});
