// React component for embedding Meridian dashboards

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type JSX,
  type CSSProperties,
} from 'react';
import { ApiClient } from '../api-client.js';
import type { Dashboard, DashboardFilterDef } from '../api-client.js';
import { resolveTheme } from '../theme/theme-resolver.js';
import type { ResolvedTheme, ThemeOverride } from '../theme/theme-resolver.js';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface MeridianDashboardProps {
  /** Base URL of the Meridian API server */
  baseUrl: string;
  /** Embed token for authentication */
  token: string;
  /** Dashboard ID to embed */
  dashboardId: string;
  /** Filter values to apply */
  filters?: Record<string, unknown>;
  /** Visual theme */
  theme?: 'light' | 'dark' | ThemeOverride;
  /** Container height (number = px, string = CSS value) */
  height?: number | string;
  /** Container width (number = px, string = CSS value) */
  width?: number | string;
  /** Whether to hide the border and shadow */
  borderless?: boolean;
  /** Called when the dashboard finishes loading */
  onLoad?: () => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
  /** Additional CSS class for the root element */
  className?: string;
  /** Additional inline styles for the root element */
  style?: CSSProperties;
  /** Max retries for transient API failures */
  maxRetries?: number;
  /** Request timeout in ms */
  timeoutMs?: number;
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

interface SkeletonProps {
  theme: ResolvedTheme;
}

function DashboardSkeleton({ theme }: SkeletonProps): JSX.Element {
  const cardStyle: CSSProperties = {
    background: theme.colors.surface,
    borderRadius: theme.shape.borderRadius,
    height: '160px',
    animation: 'meridian-pulse 1.5s ease-in-out infinite',
  };

  return (
    <>
      <style>{`
        @keyframes meridian-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
      <div
        data-meridian-loading="true"
        style={{
          padding: theme.spacing.md,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: theme.spacing.md,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={cardStyle} />
        ))}
      </div>
    </>
  );
}

// ── Error state ───────────────────────────────────────────────────────────────

interface ErrorStateProps {
  error: Error;
  theme: ResolvedTheme;
  onRetry?: () => void;
}

function ErrorState({ error, theme, onRetry }: ErrorStateProps): JSX.Element {
  return (
    <div
      data-meridian-error="true"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '200px',
        padding: theme.spacing.xl,
        gap: theme.spacing.md,
        background: theme.colors.errorBackground,
        color: theme.colors.error,
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.fontSizeBase,
      }}
    >
      <div
        style={{
          fontSize: theme.typography.fontSizeLg,
          fontWeight: theme.typography.fontWeightMedium,
        }}
      >
        Failed to load dashboard
      </div>
      <div style={{ color: theme.colors.textMuted, fontSize: theme.typography.fontSizeSm }}>
        {error.message}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: theme.spacing.sm,
            padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            background: theme.colors.primary,
            color: theme.colors.primaryForeground,
            border: 'none',
            borderRadius: theme.shape.borderRadiusSm,
            cursor: 'pointer',
            fontFamily: theme.typography.fontFamily,
            fontSize: theme.typography.fontSizeBase,
            fontWeight: theme.typography.fontWeightMedium,
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

// ── Dashboard header ──────────────────────────────────────────────────────────

interface DashboardHeaderProps {
  dashboard: Dashboard;
  theme: ResolvedTheme;
}

function DashboardHeader({ dashboard, theme }: DashboardHeaderProps): JSX.Element {
  return (
    <div
      style={{
        padding: `${theme.spacing.md} ${theme.spacing.lg}`,
        borderBottom: `1px solid ${theme.colors.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: theme.colors.surfaceElevated,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontFamily: theme.typography.fontFamily,
          fontSize: theme.typography.fontSizeLg,
          fontWeight: theme.typography.fontWeightBold,
          color: theme.colors.text,
        }}
      >
        {dashboard.name}
      </h2>
      {dashboard.description && (
        <span
          style={{
            fontFamily: theme.typography.fontFamily,
            fontSize: theme.typography.fontSizeSm,
            color: theme.colors.textMuted,
          }}
        >
          {dashboard.description}
        </span>
      )}
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────

interface FilterBarProps {
  filterDefs: DashboardFilterDef[];
  values: Record<string, unknown>;
  onFilterChange: (key: string, value: unknown) => void;
  theme: ResolvedTheme;
}

function FilterBar({
  filterDefs,
  values,
  onFilterChange,
  theme,
}: FilterBarProps): JSX.Element | null {
  if (filterDefs.length === 0) return null;

  return (
    <div
      data-meridian-filters="true"
      style={{
        padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
        borderBottom: `1px solid ${theme.colors.borderSubtle}`,
        display: 'flex',
        flexWrap: 'wrap',
        gap: theme.spacing.sm,
        background: theme.colors.surface,
        alignItems: 'center',
      }}
    >
      <span
        style={{
          fontFamily: theme.typography.fontFamily,
          fontSize: theme.typography.fontSizeSm,
          fontWeight: theme.typography.fontWeightMedium,
          color: theme.colors.textMuted,
          marginRight: theme.spacing.xs,
        }}
      >
        Filters:
      </span>
      {filterDefs.map((f) => (
        <FilterInput
          key={f.id}
          definition={f}
          value={values[f.id]}
          onChange={(value) => onFilterChange(f.id, value)}
          theme={theme}
        />
      ))}
    </div>
  );
}

interface FilterInputProps {
  definition: DashboardFilterDef;
  value: unknown;
  onChange: (value: unknown) => void;
  theme: ResolvedTheme;
}

function FilterInput({ definition, value, onChange, theme }: FilterInputProps): JSX.Element {
  const inputStyle: CSSProperties = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.fontSizeSm,
    color: theme.colors.text,
    background: theme.colors.background,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.shape.borderRadiusSm,
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    outline: 'none',
  };

  if (definition.type === 'number') {
    return (
      <input
        type="number"
        placeholder={definition.name}
        value={typeof value === 'number' ? value : ''}
        onChange={(e) => onChange(e.target.valueAsNumber || undefined)}
        style={inputStyle}
        data-filter-id={definition.id}
      />
    );
  }

  return (
    <input
      type="text"
      placeholder={definition.name}
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      style={inputStyle}
      data-filter-id={definition.id}
    />
  );
}

// ── Card grid ─────────────────────────────────────────────────────────────────

interface CardGridProps {
  cards: Dashboard['cards'];
  theme: ResolvedTheme;
}

function CardGrid({ cards, theme }: CardGridProps): JSX.Element {
  return (
    <div
      data-meridian-cards="true"
      style={{
        padding: theme.spacing.md,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: theme.spacing.md,
      }}
    >
      {cards.map((card) => (
        <DashboardCardItem key={card.id} card={card} theme={theme} />
      ))}
    </div>
  );
}

interface DashboardCardItemProps {
  card: Dashboard['cards'][number];
  theme: ResolvedTheme;
}

function DashboardCardItem({ card, theme }: DashboardCardItemProps): JSX.Element {
  return (
    <div
      data-meridian-card={card.id}
      style={{
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.shape.borderRadius,
        boxShadow: theme.shape.shadowSm,
        padding: theme.spacing.md,
        minHeight: '160px',
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.sm,
      }}
    >
      {card.title && (
        <div
          style={{
            fontFamily: theme.typography.fontFamily,
            fontSize: theme.typography.fontSizeBase,
            fontWeight: theme.typography.fontWeightMedium,
            color: theme.colors.text,
          }}
        >
          {card.title}
        </div>
      )}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: theme.colors.textMuted,
          fontFamily: theme.typography.fontFamily,
          fontSize: theme.typography.fontSizeSm,
        }}
      >
        {card.questionId ? 'Chart placeholder' : 'Text card'}
      </div>
    </div>
  );
}

// ── MeridianDashboard component ───────────────────────────────────────────────

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * React component that embeds a Meridian dashboard.
 *
 * @example
 * ```tsx
 * <MeridianDashboard
 *   baseUrl="https://analytics.example.com"
 *   token={embedToken}
 *   dashboardId="dash-123"
 *   theme="light"
 *   onLoad={() => console.log('loaded')}
 * />
 * ```
 */
export function MeridianDashboard({
  baseUrl,
  token,
  dashboardId,
  filters: externalFilters,
  theme: themeInput,
  height,
  width,
  borderless = false,
  onLoad,
  onError,
  className,
  style,
  maxRetries,
  timeoutMs,
}: MeridianDashboardProps): JSX.Element {
  const theme = useMemo(() => resolveTheme(themeInput), [themeInput]);

  const [state, setState] = useState<LoadState>('idle');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [localFilters, setLocalFilters] = useState<Record<string, unknown>>(
    externalFilters ?? {},
  );

  // Merge external filters into local state when they change
  const prevExternalFilters = useRef(externalFilters);
  useEffect(() => {
    if (externalFilters && externalFilters !== prevExternalFilters.current) {
      setLocalFilters((prev) => ({ ...prev, ...externalFilters }));
      prevExternalFilters.current = externalFilters;
    }
  }, [externalFilters]);

  // Stable client
  const client = useMemo(
    () => new ApiClient({ baseUrl, token, maxRetries, timeoutMs }),
    [baseUrl, token, maxRetries, timeoutMs],
  );

  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);
  onLoadRef.current = onLoad;
  onErrorRef.current = onError;

  // Fetch counter for manual refresh
  const [fetchTick, setFetchTick] = useState(0);

  const fetchDashboard = useCallback(() => {
    setFetchTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (state === 'idle') {
      setFetchTick((t) => t + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (fetchTick === 0) return;

    const controller = new AbortController();
    setState('loading');
    setError(null);

    client
      .getDashboard(dashboardId, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setDashboard(data);
        setState('loaded');
        onLoadRef.current?.();
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setState('error');
        onErrorRef.current?.(error);
      });

    return () => {
      controller.abort();
    };
  }, [client, dashboardId, fetchTick]);

  // Cleanup client on unmount
  useEffect(() => {
    return () => {
      client.cancelAll();
    };
  }, [client]);

  const handleFilterChange = useCallback((key: string, value: unknown) => {
    setLocalFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const containerStyle: CSSProperties = {
    background: theme.colors.background,
    borderWidth: borderless ? '0' : '1px',
    borderStyle: borderless ? 'none' : 'solid',
    borderColor: borderless ? 'transparent' : theme.colors.border,
    borderRadius: borderless ? 0 : theme.shape.borderRadiusLg,
    boxShadow: borderless ? 'none' : theme.shape.shadowMd,
    overflow: 'hidden',
    width: typeof width === 'number' ? `${width}px` : (width ?? '100%'),
    height: typeof height === 'number' ? `${height}px` : (height ?? 'auto'),
    minHeight: '200px',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: theme.typography.fontFamily,
    ...style,
  };

  return (
    <div
      className={className}
      style={containerStyle}
      data-meridian-dashboard={dashboardId}
      data-meridian-theme={
        typeof themeInput === 'string' ? themeInput : themeInput == null ? 'light' : 'custom'
      }
    >
      {state === 'loading' && <DashboardSkeleton theme={theme} />}

      {state === 'error' && error && (
        <ErrorState error={error} theme={theme} onRetry={fetchDashboard} />
      )}

      {state === 'loaded' && dashboard && (
        <>
          <DashboardHeader dashboard={dashboard} theme={theme} />
          <FilterBar
            filterDefs={dashboard.filters}
            values={localFilters}
            onFilterChange={handleFilterChange}
            theme={theme}
          />
          <CardGrid cards={dashboard.cards} theme={theme} />
        </>
      )}
    </div>
  );
}
