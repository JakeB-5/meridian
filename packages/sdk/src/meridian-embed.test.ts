// Tests for MeridianEmbed — init, destroy, dashboard, question, options

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MeridianEmbed } from './meridian-embed.js';
import type { MeridianEmbedOptions } from './meridian-embed.js';

// ── DOM helpers ───────────────────────────────────────────────────────────────

function makeContainer(): HTMLDivElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function cleanupContainers(): void {
  document.body.innerHTML = '';
}

// ── Mock fetch ────────────────────────────────────────────────────────────────

const MOCK_DASHBOARD = {
  id: 'dash-1',
  name: 'Test Dashboard',
  description: 'A test dashboard',
  cards: [
    { id: 'card-1', questionId: 'q-1', title: 'Revenue', position: { x: 0, y: 0, w: 4, h: 2 } },
  ],
  filters: [],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-15T00:00:00Z',
};

const MOCK_RESULT = {
  columns: [{ name: 'value', type: 'number', nullable: false }],
  rows: [{ value: 42 }],
  rowCount: 1,
  executionTimeMs: 10,
  truncated: false,
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

// ── Default options ───────────────────────────────────────────────────────────

const defaultOptions: MeridianEmbedOptions = {
  baseUrl: 'https://analytics.example.com',
  token: 'embed-token',
  maxRetries: 0,
  timeoutMs: 5000,
};

// ── Setup / teardown ──────────────────────────────────────────────────────────

afterEach(() => {
  cleanupContainers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Constructor ───────────────────────────────────────────────────────────────

describe('MeridianEmbed constructor', () => {
  it('creates an instance with default light theme', () => {
    const sdk = new MeridianEmbed(defaultOptions);
    const theme = sdk.getTheme();
    expect(theme.name).toBe('light');
    sdk.destroy();
  });

  it('resolves dark theme when specified', () => {
    const sdk = new MeridianEmbed({ ...defaultOptions, theme: 'dark' });
    expect(sdk.getTheme().name).toBe('dark');
    sdk.destroy();
  });

  it('resolves custom theme override', () => {
    const sdk = new MeridianEmbed({
      ...defaultOptions,
      theme: { colors: { primary: '#ff0000' } },
    });
    expect(sdk.getTheme().colors.primary).toBe('#ff0000');
    sdk.destroy();
  });

  it('exposes the ApiClient via getClient()', () => {
    const sdk = new MeridianEmbed(defaultOptions);
    expect(sdk.getClient()).toBeDefined();
    sdk.destroy();
  });
});

// ── dashboard() ───────────────────────────────────────────────────────────────

describe('MeridianEmbed.dashboard()', () => {
  it('returns an EmbeddedDashboard with the expected interface', () => {
    mockFetchOk(MOCK_DASHBOARD);
    const sdk = new MeridianEmbed(defaultOptions);
    const container = makeContainer();

    const dash = sdk.dashboard('dash-1', container);

    expect(typeof dash.setFilter).toBe('function');
    expect(typeof dash.setFilters).toBe('function');
    expect(typeof dash.refresh).toBe('function');
    expect(typeof dash.destroy).toBe('function');
    expect(typeof dash.on).toBe('function');
    expect(typeof dash.off).toBe('function');
    expect(typeof dash.getFilters).toBe('function');

    dash.destroy();
    sdk.destroy();
  });

  it('renders into the container element', async () => {
    mockFetchOk(MOCK_DASHBOARD);
    const sdk = new MeridianEmbed(defaultOptions);
    const container = makeContainer();

    sdk.dashboard('dash-1', container);

    // Wait for async fetch
    await vi.waitFor(() => {
      expect(container.innerHTML).not.toBe('');
    });

    sdk.destroy();
  });

  it('throws if called after destroy()', () => {
    const sdk = new MeridianEmbed(defaultOptions);
    sdk.destroy();

    expect(() => sdk.dashboard('dash-1', makeContainer())).toThrow(
      'MeridianEmbed.dashboard() called after destroy()',
    );
  });

  it('passes initial filters via options', () => {
    mockFetchOk(MOCK_DASHBOARD);
    const sdk = new MeridianEmbed(defaultOptions);
    const container = makeContainer();

    const dash = sdk.dashboard('dash-1', container, {
      filters: { region: 'EU', year: 2024 },
    });

    expect(dash.getFilters()).toEqual({ region: 'EU', year: 2024 });
    dash.destroy();
    sdk.destroy();
  });

  it('setFilter updates filter state', () => {
    mockFetchOk(MOCK_DASHBOARD);
    const sdk = new MeridianEmbed(defaultOptions);
    const container = makeContainer();

    const dash = sdk.dashboard('dash-1', container, { filters: { region: 'US' } });
    dash.setFilter('region', 'EU');

    expect(dash.getFilters()).toMatchObject({ region: 'EU' });
    dash.destroy();
    sdk.destroy();
  });

  it('setFilters merges multiple filters', () => {
    mockFetchOk(MOCK_DASHBOARD);
    const sdk = new MeridianEmbed(defaultOptions);
    const container = makeContainer();

    const dash = sdk.dashboard('dash-1', container, { filters: { region: 'US' } });
    dash.setFilters({ year: 2024, quarter: 'Q1' });

    const filters = dash.getFilters();
    expect(filters).toMatchObject({ region: 'US', year: 2024, quarter: 'Q1' });
    dash.destroy();
    sdk.destroy();
  });

  it('emits filter-change event when setFilter is called', () => {
    mockFetchOk(MOCK_DASHBOARD);
    const sdk = new MeridianEmbed(defaultOptions);
    const container = makeContainer();

    const dash = sdk.dashboard('dash-1', container);
    const handler = vi.fn();
    dash.on('filter-change', handler);

    dash.setFilter('region', 'APAC');

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'region', value: 'APAC' }),
    );
    dash.destroy();
    sdk.destroy();
  });

  it('emits load event on successful fetch', async () => {
    mockFetchOk(MOCK_DASHBOARD);
    const sdk = new MeridianEmbed(defaultOptions);
    const container = makeContainer();

    const dash = sdk.dashboard('dash-1', container);
    const loadHandler = vi.fn();
    dash.on('load', loadHandler);

    await vi.waitFor(() => {
      expect(loadHandler).toHaveBeenCalledOnce();
    });

    dash.destroy();
    sdk.destroy();
  });

  it('emits error event on failed fetch', async () => {
    mockFetchError(404, 'Dashboard not found');
    const sdk = new MeridianEmbed(defaultOptions);
    const container = makeContainer();

    const dash = sdk.dashboard('dash-1', container);
    const errorHandler = vi.fn();
    dash.on('error', errorHandler);

    await vi.waitFor(() => {
      expect(errorHandler).toHaveBeenCalledOnce();
    });

    dash.destroy();
    sdk.destroy();
  });

  it('calls global onError handler when dashboard errors', async () => {
    mockFetchError(500, 'Internal error');
    const globalOnError = vi.fn();
    const sdk = new MeridianEmbed({ ...defaultOptions, onError: globalOnError });
    const container = makeContainer();

    sdk.dashboard('dash-1', container);

    await vi.waitFor(() => {
      expect(globalOnError).toHaveBeenCalledOnce();
    });

    sdk.destroy();
  });
});

// ── question() ────────────────────────────────────────────────────────────────

describe('MeridianEmbed.question()', () => {
  it('returns an EmbeddedQuestion with the expected interface', () => {
    mockFetchOk(MOCK_RESULT);
    const sdk = new MeridianEmbed(defaultOptions);
    const container = makeContainer();

    const q = sdk.question('q-1', container);

    expect(typeof q.setParameters).toBe('function');
    expect(typeof q.refresh).toBe('function');
    expect(typeof q.getResult).toBe('function');
    expect(typeof q.destroy).toBe('function');
    expect(typeof q.on).toBe('function');
    expect(typeof q.off).toBe('function');

    q.destroy();
    sdk.destroy();
  });

  it('throws if called after destroy()', () => {
    const sdk = new MeridianEmbed(defaultOptions);
    sdk.destroy();

    expect(() => sdk.question('q-1', makeContainer())).toThrow(
      'MeridianEmbed.question() called after destroy()',
    );
  });

  it('emits load event after successful execution', async () => {
    mockFetchOk(MOCK_RESULT);
    const sdk = new MeridianEmbed(defaultOptions);
    const container = makeContainer();

    const q = sdk.question('q-1', container);
    const loadHandler = vi.fn();
    q.on('load', loadHandler);

    await vi.waitFor(() => {
      expect(loadHandler).toHaveBeenCalledOnce();
    });

    q.destroy();
    sdk.destroy();
  });

  it('emits error event on execution failure', async () => {
    mockFetchError(403, 'Forbidden');
    const sdk = new MeridianEmbed(defaultOptions);
    const container = makeContainer();

    const q = sdk.question('q-1', container);
    const errorHandler = vi.fn();
    q.on('error', errorHandler);

    await vi.waitFor(() => {
      expect(errorHandler).toHaveBeenCalledOnce();
    });

    q.destroy();
    sdk.destroy();
  });

  it('setParameters triggers a re-execution', async () => {
    mockFetchOk(MOCK_RESULT);
    const sdk = new MeridianEmbed(defaultOptions);
    const container = makeContainer();

    const q = sdk.question('q-1', container);

    // Wait for initial load
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledOnce();
    });

    q.setParameters({ date_from: '2024-01-01' });

    await vi.waitFor(() => {
      // Should have made at least 2 fetch calls
      expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    q.destroy();
    sdk.destroy();
  });
});

// ── destroy() ─────────────────────────────────────────────────────────────────

describe('MeridianEmbed.destroy()', () => {
  it('clears the container DOM when destroyed', async () => {
    mockFetchOk(MOCK_DASHBOARD);
    const sdk = new MeridianEmbed(defaultOptions);
    const container = makeContainer();

    const dash = sdk.dashboard('dash-1', container);

    // Wait for render
    await vi.waitFor(() => {
      expect(container.innerHTML).not.toBe('');
    });

    dash.destroy();
    expect(container.innerHTML).toBe('');
  });

  it('is idempotent — calling destroy() twice does not throw', () => {
    const sdk = new MeridianEmbed(defaultOptions);
    sdk.destroy();
    expect(() => sdk.destroy()).not.toThrow();
  });

  it('destroys all child instances', async () => {
    mockFetchOk(MOCK_DASHBOARD);
    const sdk = new MeridianEmbed(defaultOptions);
    const c1 = makeContainer();
    const c2 = makeContainer();

    sdk.dashboard('dash-1', c1);
    sdk.dashboard('dash-2', c2);

    await vi.waitFor(() => {
      expect(c1.innerHTML).not.toBe('');
    });

    sdk.destroy();

    expect(c1.innerHTML).toBe('');
    expect(c2.innerHTML).toBe('');
  });

  it('embedded instance destroy() is idempotent', () => {
    mockFetchOk(MOCK_DASHBOARD);
    const sdk = new MeridianEmbed(defaultOptions);
    const container = makeContainer();
    const dash = sdk.dashboard('dash-1', container);

    dash.destroy();
    expect(() => dash.destroy()).not.toThrow();

    sdk.destroy();
  });

  it('embedded instance setFilter is a no-op after destroy', () => {
    mockFetchOk(MOCK_DASHBOARD);
    const sdk = new MeridianEmbed(defaultOptions);
    const container = makeContainer();
    const dash = sdk.dashboard('dash-1', container);
    dash.destroy();

    // Should not throw
    expect(() => dash.setFilter('region', 'EU')).not.toThrow();
    sdk.destroy();
  });
});

// ── refresh() ─────────────────────────────────────────────────────────────────

describe('EmbeddedDashboard.refresh()', () => {
  it('triggers a new fetch', async () => {
    mockFetchOk(MOCK_DASHBOARD);
    const sdk = new MeridianEmbed(defaultOptions);
    const container = makeContainer();

    const dash = sdk.dashboard('dash-1', container);

    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledOnce();
    });

    dash.refresh();

    await vi.waitFor(() => {
      expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    dash.destroy();
    sdk.destroy();
  });
});
