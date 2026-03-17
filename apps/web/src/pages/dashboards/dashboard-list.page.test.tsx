import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardListPage } from './dashboard-list.page';
import { ToastProvider } from '@/components/common/toast';

// Mock the router
vi.mock('@/router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    <a href={to}>{children}</a>,
}));

// Mock dashboards hook
const mockDashboardData = {
  data: [
    {
      id: '1',
      name: 'Sales Dashboard',
      description: 'Overview of sales metrics',
      organizationId: 'org-1',
      layout: { columns: 12, rowHeight: 80 },
      cards: [
        { id: 'c1', dashboardId: '1', questionId: 'q1', position: { x: 0, y: 0 }, size: { width: 4, height: 3 } },
      ],
      filters: [],
      createdBy: 'user-1',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-03-15T10:30:00Z',
      isPublic: false,
      tags: ['sales', 'revenue'],
    },
    {
      id: '2',
      name: 'Marketing Dashboard',
      description: null,
      organizationId: 'org-1',
      layout: { columns: 12, rowHeight: 80 },
      cards: [],
      filters: [],
      createdBy: 'user-2',
      createdAt: '2025-02-01T00:00:00Z',
      updatedAt: '2025-03-10T15:00:00Z',
      isPublic: true,
      tags: [],
    },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

vi.mock('@/api/hooks/use-dashboards', () => ({
  useDashboards: () => ({
    data: mockDashboardData,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useDeleteDashboard: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useDuplicateDashboard: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          {children}
        </ToastProvider>
      </QueryClientProvider>
    );
  };
}

describe('DashboardListPage', () => {
  it('should render the page title', () => {
    render(<DashboardListPage />, { wrapper: createWrapper() });
    expect(screen.getByText('Dashboards')).toBeDefined();
  });

  it('should render dashboard cards', () => {
    render(<DashboardListPage />, { wrapper: createWrapper() });
    expect(screen.getByText('Sales Dashboard')).toBeDefined();
    expect(screen.getByText('Marketing Dashboard')).toBeDefined();
  });

  it('should show card count', () => {
    render(<DashboardListPage />, { wrapper: createWrapper() });
    expect(screen.getByText('1 cards')).toBeDefined();
    expect(screen.getByText('0 cards')).toBeDefined();
  });

  it('should show Public badge for public dashboards', () => {
    render(<DashboardListPage />, { wrapper: createWrapper() });
    expect(screen.getByText('Public')).toBeDefined();
  });

  it('should show tags', () => {
    render(<DashboardListPage />, { wrapper: createWrapper() });
    expect(screen.getByText('sales')).toBeDefined();
    expect(screen.getByText('revenue')).toBeDefined();
  });

  it('should have a New Dashboard button', () => {
    render(<DashboardListPage />, { wrapper: createWrapper() });
    expect(screen.getByText('New Dashboard')).toBeDefined();
  });

  it('should have a search input', () => {
    render(<DashboardListPage />, { wrapper: createWrapper() });
    expect(screen.getByPlaceholderText('Search dashboards...')).toBeDefined();
  });
});
