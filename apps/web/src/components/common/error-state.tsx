import { cn } from '@/lib/utils';
import { ApiRequestError } from '@/api/client';

interface ErrorStateProps {
  error: Error | null;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

export function ErrorState({ error, onRetry, className, compact = false }: ErrorStateProps) {
  const message = getErrorMessage(error);
  const code = error instanceof ApiRequestError ? error.code : undefined;

  if (compact) {
    return (
      <div
        className={cn('flex items-center gap-3 p-3 rounded-lg', className)}
        style={{ backgroundColor: '#fee2e2', border: '1px solid #fecaca' }}
      >
        <svg className="h-5 w-5 flex-shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
            clipRule="evenodd"
          />
        </svg>
        <p className="text-sm text-red-700 flex-1">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-sm font-medium text-red-700 underline hover:text-red-800"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-4 text-center',
        className,
      )}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
        <svg className="h-8 w-8 text-red-400" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--color-text)' }}>
        Something went wrong
      </h3>
      <p className="text-sm max-w-md mb-2" style={{ color: 'var(--color-text-secondary)' }}>
        {message}
      </p>
      {code && (
        <p className="text-xs mb-4 font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
          Error code: {code}
        </p>
      )}
      {onRetry && (
        <button onClick={onRetry} className="btn btn-secondary">
          Try again
        </button>
      )}
    </div>
  );
}

function getErrorMessage(error: Error | null): string {
  if (!error) return 'An unexpected error occurred.';
  if (error instanceof ApiRequestError) {
    return error.message;
  }
  return error.message || 'An unexpected error occurred.';
}
