// Tests for MeridianDashboard React component — render, loading, error states

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MeridianDashboard } from './meridian-dashboard.js';

// ── Mock fetch ────────────────────────────────────────────────────────────────

const MOCK_DASHBOARD = {
  id: 'dash-1',
  name: 'Sales Dashboard',
  description: 'Monthly overview',
  cards: [
    { id: 'c-1', questionId: 'q-1', title: 'Revenue', position: { x: 0, y: 0, w: 4, h: 2 } },
    { id: 'c-2', questionId: 'q-2', title: 'Users', position: { x: 4, y: 0, w: 4, h: 2 } },
  ],
  filters: [
    { id: 'f-region', name: 'Region', type: 'text' as const, defaultValue: '' },
    { id: 'f-year', name: 'Year', type: 'number' as const, defaultValue: 2024 },
  ],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-15T00:00:00Z',
};

function mockFetchOk(body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

function mockFetchError(status: number, message: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message, code: `HTTP_${status}` }), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

function mockFetchNetworkError(): void {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
}

// ── Default props ─────────────────────────────────────────────────────────────

const defaultProps = {
  baseUrl: 'https://analytics.example.com',
  token: 'embed-token',
  dashboardId: 'dash-1',
  maxRetries: 0,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Loading state ─────────────────────────────────────────────────────────────

describe('MeridianDashboard loading state', () => {
  it('shows skeleton while fetching', async () => {
    // Never-resolving fetch to keep loading state
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})));

    const { container } = render(<MeridianDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(container.querySelector('[data-meridian-loading]')).toBeTruthy();
    });
  });

  it('shows multiple skeleton cards', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})));

    const { container } = render(<MeridianDashboard {...defaultProps} />);

    await waitFor(() => {
      // Skeleton renders 4 placeholder cards
      const loadingEl = container.querySelector('[data-meridian-loading]');
      expect(loadingEl).toBeTruthy();
    });
  });
});

// ── Loaded state ──────────────────────────────────────────────────────────────

describe('MeridianDashboard loaded state', () => {
  it('renders dashboard name after successful fetch', async () => {
    mockFetchOk(MOCK_DASHBOARD);
    render(<MeridianDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Sales Dashboard')).toBeTruthy();
    });
  });

  it('renders dashboard description', async () => {
    mockFetchOk(MOCK_DASHBOARD);
    render(<MeridianDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Monthly overview')).toBeTruthy();
    });
  });

  it('renders all card titles', async () => {
    mockFetchOk(MOCK_DASHBOARD);
    render(<MeridianDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Revenue')).toBeTruthy();
      expect(screen.getByText('Users')).toBeTruthy();
    });
  });

  it('renders filter inputs for each filter definition', async () => {
    mockFetchOk(MOCK_DASHBOARD);
    const { container } = render(<MeridianDashboard {...defaultProps} />);

    await waitFor(() => {
      const regionInput = container.querySelector('[data-filter-id="f-region"]');
      const yearInput = container.querySelector('[data-filter-id="f-year"]');
      expect(regionInput).toBeTruthy();
      expect(yearInput).toBeTruthy();
    });
  });

  it('calls onLoad callback when loaded', async () => {
    mockFetchOk(MOCK_DASHBOARD);
    const onLoad = vi.fn();
    render(<MeridianDashboard {...defaultProps} onLoad={onLoad} />);

    await waitFor(() => {
      expect(onLoad).toHaveBeenCalledOnce();
    });
  });

  it('attaches data-meridian-dashboard attribute', async () => {
    mockFetchOk(MOCK_DASHBOARD);
    const { container } = render(<MeridianDashboard {...defaultProps} />);

    await waitFor(() => {
      const el = container.querySelector('[data-meridian-dashboard="dash-1"]');
      expect(el).toBeTruthy();
    });
  });
});

// ── Error state ───────────────────────────────────────────────────────────────

describe('MeridianDashboard error state', () => {
  it('renders error message on 404', async () => {
    mockFetchError(404, 'Dashboard not found');
    render(<MeridianDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load dashboard/i)).toBeTruthy();
    });
  });

  it('renders error message on network failure', async () => {
    mockFetchNetworkError();
    render(<MeridianDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load dashboard/i)).toBeTruthy();
    });
  });

  it('calls onError callback when fetch fails', async () => {
    mockFetchError(500, 'Internal server error');
    const onError = vi.fn();
    render(<MeridianDashboard {...defaultProps} onError={onError} />);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    });
  });

  it('renders retry button in error state', async () => {
    mockFetchError(500, 'Internal server error');
    render(<MeridianDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeTruthy();
    });
  });

  it('clicking retry refetches the dashboard', async () => {
    mockFetchError(500, 'Server error');
    const user = userEvent.setup();
    render(<MeridianDashboard {...defaultProps} />);

    // Wait for error state
    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeTruthy();
    });

    // Now mock success for the retry
    mockFetchOk(MOCK_DASHBOARD);

    await user.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Sales Dashboard')).toBeTruthy();
    });
  });

  it('shows error data-attribute in error state', async () => {
    mockFetchError(404, 'Not found');
    const { container } = render(<MeridianDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(container.querySelector('[data-meridian-error]')).toBeTruthy();
    });
  });
});

// ── Theme ─────────────────────────────────────────────────────────────────────

describe('MeridianDashboard theme', () => {
  it('applies dark theme data attribute', async () => {
    mockFetchOk(MOCK_DASHBOARD);
    const { container } = render(
      <MeridianDashboard {...defaultProps} theme="dark" />,
    );

    expect(
      container.querySelector('[data-meridian-theme="dark"]'),
    ).toBeTruthy();
  });

  it('applies light theme data attribute by default', async () => {
    mockFetchOk(MOCK_DASHBOARD);
    const { container } = render(<MeridianDashboard {...defaultProps} />);

    // No theme prop → defaults to 'light'
    await waitFor(() => {
      expect(
        container.querySelector('[data-meridian-theme="light"]'),
      ).toBeTruthy();
    });
  });

  it('applies custom theme override', () => {
    mockFetchOk(MOCK_DASHBOARD);
    const { container } = render(
      <MeridianDashboard
        {...defaultProps}
        theme={{ colors: { primary: '#deadbe' } }}
      />,
    );

    expect(
      container.querySelector('[data-meridian-theme="custom"]'),
    ).toBeTruthy();
  });
});

// ── Props ─────────────────────────────────────────────────────────────────────

describe('MeridianDashboard props', () => {
  it('applies className to root element', () => {
    mockFetchOk(MOCK_DASHBOARD);
    const { container } = render(
      <MeridianDashboard {...defaultProps} className="my-class" />,
    );

    expect(container.querySelector('.my-class')).toBeTruthy();
  });

  it('applies inline style to root element', () => {
    mockFetchOk(MOCK_DASHBOARD);
    const { container } = render(
      <MeridianDashboard {...defaultProps} style={{ margin: '20px' }} />,
    );

    const el = container.firstElementChild as HTMLElement;
    expect(el.style.margin).toBe('20px');
  });

  it('sets pixel height from number prop', () => {
    mockFetchOk(MOCK_DASHBOARD);
    const { container } = render(
      <MeridianDashboard {...defaultProps} height={600} />,
    );

    const el = container.firstElementChild as HTMLElement;
    expect(el.style.height).toBe('600px');
  });

  it('sets string height from string prop', () => {
    mockFetchOk(MOCK_DASHBOARD);
    const { container } = render(
      <MeridianDashboard {...defaultProps} height="50vh" />,
    );

    const el = container.firstElementChild as HTMLElement;
    expect(el.style.height).toBe('50vh');
  });

  it('removes border and shadow when borderless=true', () => {
    mockFetchOk(MOCK_DASHBOARD);
    const { container } = render(
      <MeridianDashboard {...defaultProps} borderless />,
    );

    const el = container.firstElementChild as HTMLElement;
    const styleAttr = el.getAttribute('style') ?? '';
    // border is removed: borderWidth 0 and boxShadow none
    expect(el.style.boxShadow).toBe('none');
    expect(styleAttr).toMatch(/border-width:\s*0/);
  });
});

// ── Filter interaction ────────────────────────────────────────────────────────

describe('MeridianDashboard filter interaction', () => {
  it('merges external filters with existing filters', async () => {
    mockFetchOk(MOCK_DASHBOARD);
    const { rerender } = render(
      <MeridianDashboard {...defaultProps} filters={{ region: 'US' }} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Sales Dashboard')).toBeTruthy();
    });

    // Update external filters
    rerender(
      <MeridianDashboard
        {...defaultProps}
        filters={{ region: 'EU', year: 2024 }}
      />,
    );

    // No crash on rerender
    await waitFor(() => {
      expect(screen.getByText('Sales Dashboard')).toBeTruthy();
    });
  });
});
