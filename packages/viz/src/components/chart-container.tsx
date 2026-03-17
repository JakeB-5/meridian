/**
 * ChartContainer — Responsive wrapper for all chart types.
 *
 * Features:
 * - Auto-resize via ResizeObserver
 * - Loading overlay with skeleton animation
 * - Error boundary with fallback UI
 * - Export to PNG/SVG
 */

import { useState, useEffect, useRef, useCallback, Component } from 'react';
import type { ReactNode } from 'react';
import type { ChartContainerProps, ExportFormat } from '../types.js';

// --- Error Boundary ---

interface ErrorBoundaryState {
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

/**
 * Error boundary that catches rendering errors in chart components.
 */
export class ChartErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset);
      }
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: 24,
            color: '#EF4444',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
            Chart rendering error
          </div>
          <div style={{ fontSize: 12, color: '#9CA3AF', maxWidth: 400 }}>
            {this.state.error.message}
          </div>
          <button
            onClick={this.handleReset}
            style={{
              marginTop: 12,
              padding: '6px 16px',
              fontSize: 12,
              border: '1px solid #D1D5DB',
              borderRadius: 4,
              background: 'transparent',
              cursor: 'pointer',
              color: '#6B7280',
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Loading Overlay ---

function LoadingOverlay(): JSX.Element {
  return (
    <div
      data-testid="chart-loading"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        zIndex: 10,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {/* Skeleton bars */}
        {[0.6, 0.8, 0.4, 0.7, 0.5].map((width, i) => (
          <div
            key={i}
            style={{
              height: '16%',
              width: `${width * 100}%`,
              borderRadius: 4,
              background: `linear-gradient(90deg, #F3F4F6 25%, #E5E7EB 50%, #F3F4F6 75%)`,
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s ease-in-out infinite',
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
}

// --- useResizeObserver Hook ---

/**
 * Observe element size changes and provide current dimensions.
 */
export function useResizeObserver(): {
  ref: React.RefObject<HTMLDivElement | null>;
  width: number;
  height: number;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const { width, height } = entry.contentRect;
      setDimensions((prev) => {
        if (prev.width === Math.round(width) && prev.height === Math.round(height)) {
          return prev;
        }
        return { width: Math.round(width), height: Math.round(height) };
      });
    });

    observer.observe(element);

    // Set initial dimensions
    const rect = element.getBoundingClientRect();
    setDimensions({ width: Math.round(rect.width), height: Math.round(rect.height) });

    return () => observer.disconnect();
  }, []);

  return { ref, ...dimensions };
}

// --- ChartContainer Component ---

/**
 * ChartContainer wraps a chart component with:
 * - Responsive sizing via ResizeObserver
 * - Loading overlay
 * - Error boundary
 * - Export controls
 */
export function ChartContainer({
  width = '100%',
  height = 400,
  loading = false,
  theme = 'light',
  className,
  children,
  title,
  onExport,
  error,
}: ChartContainerProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleExport = useCallback(
    (format: ExportFormat) => {
      onExport?.(format);
    },
    [onExport],
  );

  const isDark = theme === 'dark';
  const bgColor = isDark ? '#111827' : '#FFFFFF';
  const borderColor = isDark ? '#374151' : '#E5E7EB';
  const textColor = isDark ? '#F3F4F6' : '#111827';
  const mutedColor = isDark ? '#9CA3AF' : '#6B7280';

  return (
    <div
      ref={containerRef}
      className={className}
      data-testid="chart-container"
      style={{
        position: 'relative',
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header with title and export buttons */}
      {(title || onExport) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderBottom: `1px solid ${borderColor}`,
            flexShrink: 0,
          }}
        >
          {title && (
            <div style={{ fontSize: 14, fontWeight: 600, color: textColor }}>
              {title}
            </div>
          )}
          {onExport && (
            <div style={{ display: 'flex', gap: 4 }}>
              <ExportButton
                label="PNG"
                onClick={() => handleExport('png')}
                color={mutedColor}
                borderColor={borderColor}
              />
              <ExportButton
                label="SVG"
                onClick={() => handleExport('svg')}
                color={mutedColor}
                borderColor={borderColor}
              />
            </div>
          )}
        </div>
      )}

      {/* Chart area */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {error ? (
          <ErrorDisplay error={error} />
        ) : (
          <ChartErrorBoundary>
            {children}
            {loading && <LoadingOverlay />}
          </ChartErrorBoundary>
        )}
      </div>
    </div>
  );
}

// --- Internal subcomponents ---

function ExportButton({
  label,
  onClick,
  color,
  borderColor,
}: {
  label: string;
  onClick: () => void;
  color: string;
  borderColor: string;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={`Download as ${label}`}
      style={{
        padding: '2px 8px',
        fontSize: 11,
        border: `1px solid ${borderColor}`,
        borderRadius: 4,
        background: 'transparent',
        cursor: 'pointer',
        color,
        lineHeight: '18px',
      }}
    >
      {label}
    </button>
  );
}

function ErrorDisplay({ error }: { error: Error }): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 500, color: '#EF4444', marginBottom: 8 }}>
        Failed to load chart
      </div>
      <div style={{ fontSize: 12, color: '#9CA3AF', maxWidth: 400 }}>
        {error.message}
      </div>
    </div>
  );
}
