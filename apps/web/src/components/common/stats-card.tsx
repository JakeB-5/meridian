import { cn } from '@/lib/utils';
import { formatCompact } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: number | string;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  format?: 'number' | 'currency' | 'percent' | 'compact' | 'none';
  className?: string;
}

export function StatsCard({
  title,
  value,
  change,
  changeLabel,
  icon,
  format = 'compact',
  className,
}: StatsCardProps) {
  const formattedValue = formatValue(value, format);

  return (
    <div className={cn('card', className)}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          {title}
        </p>
        {icon && (
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{
              backgroundColor: 'var(--color-primary-light)',
              color: 'var(--color-primary)',
            }}
          >
            {icon}
          </div>
        )}
      </div>

      <p className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
        {formattedValue}
      </p>

      {change !== undefined && (
        <div className="flex items-center gap-1 mt-1">
          <ChangeIndicator value={change} />
          {changeLabel && (
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {changeLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ChangeIndicator({ value }: { value: number }) {
  const isPositive = value > 0;
  const isNeutral = value === 0;
  const color = isPositive ? '#22c55e' : isNeutral ? 'var(--color-text-tertiary)' : '#ef4444';

  return (
    <span className="flex items-center text-xs font-medium" style={{ color }}>
      {!isNeutral && (
        <svg
          className={cn('h-3 w-3', !isPositive && 'rotate-180')}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M12.577 4.878a.75.75 0 01.919-.53l4.78 1.281a.75.75 0 01.531.919l-1.281 4.78a.75.75 0 01-1.449-.387l.81-3.022a19.407 19.407 0 00-5.594 5.203.75.75 0 01-1.139.093L7 10.06l-4.72 4.72a.75.75 0 01-1.06-1.061l5.25-5.25a.75.75 0 011.06 0l3.074 3.073a20.923 20.923 0 015.545-4.931l-3.042.815a.75.75 0 01-.53-.919z"
            clipRule="evenodd"
          />
        </svg>
      )}
      {isPositive ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}

function formatValue(value: number | string, format: string): string {
  if (typeof value === 'string') return value;

  switch (format) {
    case 'number':
      return value.toLocaleString();
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'compact':
      return formatCompact(value);
    default:
      return String(value);
  }
}

// ── Stats Card Grid ──────────────────────────────────────────────────

interface StatsGridProps {
  children: React.ReactNode;
  className?: string;
}

export function StatsGrid({ children, className }: StatsGridProps) {
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4', className)}>
      {children}
    </div>
  );
}
