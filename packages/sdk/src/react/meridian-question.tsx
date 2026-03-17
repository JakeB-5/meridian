// React component for embedding individual Meridian questions/charts

import React, {
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useState,
  type JSX,
  type CSSProperties,
} from 'react';
import type { QueryResult } from '@meridian/shared';
import { ApiClient } from '../api-client.js';
import type { Question } from '../api-client.js';
import { resolveTheme } from '../theme/theme-resolver.js';
import type { ResolvedTheme, ThemeOverride } from '../theme/theme-resolver.js';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface MeridianQuestionProps {
  /** Base URL of the Meridian API server */
  baseUrl: string;
  /** Embed token for authentication */
  token: string;
  /** Question ID to embed */
  questionId: string;
  /** Query parameters to pass to the question execution */
  parameters?: Record<string, unknown>;
  /** Visual theme */
  theme?: 'light' | 'dark' | ThemeOverride;
  /** Container height (number = px, string = CSS value) */
  height?: number | string;
  /** Container width (number = px, string = CSS value) */
  width?: number | string;
  /** Whether to hide the question title */
  hideTitle?: boolean;
  /** Whether to hide the result metadata (row count, execution time) */
  hideMeta?: boolean;
  /** Whether to hide the border and shadow */
  borderless?: boolean;
  /** Polling interval in ms. Set to re-fetch at this interval. */
  pollInterval?: number;
  /** Called when the question finishes loading */
  onLoad?: (result: QueryResult) => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
  /** Called when a data point is clicked */
  onDataPointClick?: (row: Record<string, unknown>) => void;
  /** Additional CSS class for the root element */
  className?: string;
  /** Additional inline styles for the root element */
  style?: CSSProperties;
  /** Max retries for transient API failures */
  maxRetries?: number;
  /** Request timeout in ms */
  timeoutMs?: number;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface QuestionSkeletonProps {
  theme: ResolvedTheme;
  height?: number | string;
}

function QuestionSkeleton({ theme, height }: QuestionSkeletonProps): JSX.Element {
  const h =
    typeof height === 'number' ? `${height}px` : typeof height === 'string' ? height : '240px';

  return (
    <>
      <style>{`
        @keyframes meridian-q-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
      <div
        data-meridian-loading="true"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing.sm,
          padding: theme.spacing.md,
          minHeight: h,
        }}
      >
        {/* Title skeleton */}
        <div
          style={{
            height: '20px',
            width: '40%',
            background: theme.colors.surface,
            borderRadius: theme.shape.borderRadiusSm,
            animation: 'meridian-q-pulse 1.5s ease-in-out infinite',
          }}
        />
        {/* Chart area skeleton */}
        <div
          style={{
            flex: 1,
            background: theme.colors.surface,
            borderRadius: theme.shape.borderRadius,
            animation: 'meridian-q-pulse 1.5s ease-in-out infinite',
            animationDelay: '0.2s',
            minHeight: '160px',
          }}
        />
      </div>
    </>
  );
}

interface QuestionErrorProps {
  error: Error;
  theme: ResolvedTheme;
  onRetry?: () => void;
}

function QuestionError({ error, theme, onRetry }: QuestionErrorProps): JSX.Element {
  return (
    <div
      data-meridian-error="true"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '160px',
        padding: theme.spacing.lg,
        gap: theme.spacing.sm,
        background: theme.colors.errorBackground,
        color: theme.colors.error,
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.fontSizeBase,
      }}
    >
      <div style={{ fontWeight: theme.typography.fontWeightMedium }}>
        Failed to load question
      </div>
      <div style={{ fontSize: theme.typography.fontSizeSm, color: theme.colors.textMuted }}>
        {error.message}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: theme.spacing.xs,
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            background: theme.colors.primary,
            color: theme.colors.primaryForeground,
            border: 'none',
            borderRadius: theme.shape.borderRadiusSm,
            cursor: 'pointer',
            fontFamily: theme.typography.fontFamily,
            fontSize: theme.typography.fontSizeSm,
            fontWeight: theme.typography.fontWeightMedium,
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

// ── Simple table renderer ─────────────────────────────────────────────────────

interface ResultTableProps {
  result: QueryResult;
  theme: ResolvedTheme;
  onRowClick?: (row: Record<string, unknown>) => void;
}

function ResultTable({ result, theme, onRowClick }: ResultTableProps): JSX.Element {
  const { columns, rows } = result;

  // Show at most 100 rows in the embedded view
  const visibleRows = rows.slice(0, 100);

  const theadStyle: CSSProperties = {
    background: theme.colors.surface,
    position: 'sticky',
    top: 0,
    zIndex: 1,
  };

  const thStyle: CSSProperties = {
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.fontSizeSm,
    fontWeight: theme.typography.fontWeightMedium,
    color: theme.colors.textMuted,
    textAlign: 'left',
    borderBottom: `1px solid ${theme.colors.border}`,
    whiteSpace: 'nowrap',
  };

  const tdStyle: CSSProperties = {
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    fontFamily: theme.typography.fontFamilyMono,
    fontSize: theme.typography.fontSizeSm,
    color: theme.colors.text,
    borderBottom: `1px solid ${theme.colors.borderSubtle}`,
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
      }}
    >
      <table
        data-meridian-result-table="true"
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'auto',
        }}
      >
        <thead style={theadStyle}>
          <tr>
            {columns.map((col) => (
              <th key={col.name} style={thStyle} title={col.type}>
                {col.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              onClick={() => onRowClick?.(row)}
              style={{
                cursor: onRowClick ? 'pointer' : 'default',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLTableRowElement).style.background =
                  theme.colors.surface;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLTableRowElement).style.background = 'transparent';
              }}
            >
              {columns.map((col) => (
                <td key={col.name} style={tdStyle} title={String(row[col.name] ?? '')}>
                  {formatCellValue(row[col.name])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 100 && (
        <div
          style={{
            padding: theme.spacing.sm,
            textAlign: 'center',
            color: theme.colors.textMuted,
            fontFamily: theme.typography.fontFamily,
            fontSize: theme.typography.fontSizeSm,
            borderTop: `1px solid ${theme.colors.borderSubtle}`,
          }}
        >
          Showing 100 of {rows.length} rows
        </div>
      )}
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// ── Result meta bar ───────────────────────────────────────────────────────────

interface ResultMetaProps {
  result: QueryResult;
  theme: ResolvedTheme;
  onRefresh?: () => void;
}

function ResultMeta({ result, theme, onRefresh }: ResultMetaProps): JSX.Element {
  return (
    <div
      data-meridian-meta="true"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `${theme.spacing.xs} ${theme.spacing.md}`,
        borderTop: `1px solid ${theme.colors.borderSubtle}`,
        background: theme.colors.surface,
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.fontSizeSm,
        color: theme.colors.textMuted,
      }}
    >
      <span>
        {result.rowCount.toLocaleString()} row{result.rowCount !== 1 ? 's' : ''} ·{' '}
        {result.executionTimeMs}ms
        {result.truncated && ' · truncated'}
      </span>
      {onRefresh && (
        <button
          onClick={onRefresh}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: theme.colors.primary,
            fontFamily: theme.typography.fontFamily,
            fontSize: theme.typography.fontSizeSm,
            padding: `0 ${theme.spacing.xs}`,
          }}
        >
          Refresh
        </button>
      )}
    </div>
  );
}

// ── Question title bar ────────────────────────────────────────────────────────

interface QuestionTitleBarProps {
  question: Question;
  theme: ResolvedTheme;
}

function QuestionTitleBar({ question, theme }: QuestionTitleBarProps): JSX.Element {
  return (
    <div
      style={{
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        borderBottom: `1px solid ${theme.colors.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.sm,
        background: theme.colors.surfaceElevated,
      }}
    >
      <span
        style={{
          fontFamily: theme.typography.fontFamily,
          fontSize: theme.typography.fontSizeBase,
          fontWeight: theme.typography.fontWeightMedium,
          color: theme.colors.text,
        }}
      >
        {question.name}
      </span>
      <span
        style={{
          fontFamily: theme.typography.fontFamily,
          fontSize: theme.typography.fontSizeSm,
          color: theme.colors.textMuted,
          background: theme.colors.surface,
          padding: `1px ${theme.spacing.xs}`,
          borderRadius: theme.shape.borderRadiusSm,
          border: `1px solid ${theme.colors.border}`,
        }}
      >
        {question.queryType}
      </span>
    </div>
  );
}

// ── MeridianQuestion component ────────────────────────────────────────────────

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * React component that embeds a single Meridian question (chart or table).
 *
 * @example
 * ```tsx
 * <MeridianQuestion
 *   baseUrl="https://analytics.example.com"
 *   token={embedToken}
 *   questionId="q-456"
 *   theme="dark"
 *   parameters={{ date_from: '2024-01-01' }}
 *   onLoad={(result) => console.log('rows:', result.rowCount)}
 * />
 * ```
 */
export function MeridianQuestion({
  baseUrl,
  token,
  questionId,
  parameters,
  theme: themeInput,
  height,
  width,
  hideTitle = false,
  hideMeta = false,
  borderless = false,
  pollInterval,
  onLoad,
  onError,
  onDataPointClick,
  className,
  style,
  maxRetries,
  timeoutMs,
}: MeridianQuestionProps): JSX.Element {
  const theme = useMemo(() => resolveTheme(themeInput), [themeInput]);

  const [state, setState] = useState<LoadState>('idle');
  const [question, setQuestion] = useState<Question | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);
  onLoadRef.current = onLoad;
  onErrorRef.current = onError;

  // Stable client
  const client = useMemo(
    () => new ApiClient({ baseUrl, token, maxRetries, timeoutMs }),
    [baseUrl, token, maxRetries, timeoutMs],
  );

  // Serialized params for dependency tracking
  const paramsKey = useMemo(
    () => JSON.stringify(parameters ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(parameters)],
  );

  const [fetchTick, setFetchTick] = useState(1);

  const refresh = useCallback(() => {
    setFetchTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    setError(null);

    const run = async (): Promise<void> => {
      try {
        // Fetch question metadata and execute in parallel
        const [q, r] = await Promise.all([
          client.getQuestion(questionId, { signal: controller.signal }),
          client.executeQuestion(questionId, parameters ?? {}, { signal: controller.signal }),
        ]);

        if (controller.signal.aborted) return;
        setQuestion(q);
        setResult(r);
        setState('loaded');
        onLoadRef.current?.(r);
      } catch (err) {
        if (controller.signal.aborted) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setState('error');
        onErrorRef.current?.(error);
      }
    };

    void run();

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, questionId, paramsKey, fetchTick]);

  // Polling
  useEffect(() => {
    if (!pollInterval || pollInterval <= 0) return;
    const id = setInterval(refresh, pollInterval);
    return () => clearInterval(id);
  }, [pollInterval, refresh]);

  useEffect(() => {
    return () => {
      client.cancelAll();
    };
  }, [client]);

  const containerStyle: CSSProperties = {
    background: theme.colors.background,
    border: borderless ? 'none' : `1px solid ${theme.colors.border}`,
    borderRadius: borderless ? 0 : theme.shape.borderRadiusLg,
    boxShadow: borderless ? 'none' : theme.shape.shadowMd,
    overflow: 'hidden',
    width: typeof width === 'number' ? `${width}px` : (width ?? '100%'),
    height: typeof height === 'number' ? `${height}px` : (height ?? 'auto'),
    minHeight: '200px',
    display: 'flex',
    flexDirection: 'column',
    ...style,
  };

  return (
    <div
      className={className}
      style={containerStyle}
      data-meridian-question={questionId}
      data-meridian-theme={typeof themeInput === 'string' ? themeInput : 'custom'}
    >
      {state === 'loading' && <QuestionSkeleton theme={theme} height={height} />}

      {state === 'error' && error && (
        <QuestionError error={error} theme={theme} onRetry={refresh} />
      )}

      {state === 'loaded' && question && result && (
        <>
          {!hideTitle && <QuestionTitleBar question={question} theme={theme} />}
          <ResultTable
            result={result}
            theme={theme}
            onRowClick={onDataPointClick}
          />
          {!hideMeta && (
            <ResultMeta result={result} theme={theme} onRefresh={refresh} />
          )}
        </>
      )}
    </div>
  );
}
