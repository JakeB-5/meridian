import {
  forwardRef,
  useEffect,
  useState,
  useCallback,
  type HTMLAttributes,
} from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn.js';

// ---- Types ----

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastData {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

// ---- Variants ----

export const toastVariants = cva(
  [
    'pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-lg border p-4 shadow-lg transition-all',
    'animate-in slide-in-from-top-2 fade-in-0',
  ],
  {
    variants: {
      type: {
        success: 'border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100',
        error: 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100',
        warning: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
        info: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100',
      },
    },
    defaultVariants: {
      type: 'info',
    },
  },
);

// ---- Icons ----

function ToastIcon({ type }: { type: ToastType }) {
  const iconClass = 'h-5 w-5 shrink-0';

  switch (type) {
    case 'success':
      return (
        <svg className={cn(iconClass, 'text-green-600 dark:text-green-400')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'error':
      return (
        <svg className={cn(iconClass, 'text-red-600 dark:text-red-400')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'warning':
      return (
        <svg className={cn(iconClass, 'text-amber-600 dark:text-amber-400')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      );
    case 'info':
      return (
        <svg className={cn(iconClass, 'text-blue-600 dark:text-blue-400')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
  }
}

// ---- Toast Item Component ----

export interface ToastItemProps extends HTMLAttributes<HTMLDivElement> {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

/**
 * Individual toast notification with auto-dismiss and manual close.
 */
export const ToastItem = forwardRef<HTMLDivElement, ToastItemProps>(
  ({ toast, onDismiss, className, ...props }, ref) => {
    const [isExiting, setIsExiting] = useState(false);

    const dismiss = useCallback(() => {
      setIsExiting(true);
      setTimeout(() => onDismiss(toast.id), 150);
    }, [onDismiss, toast.id]);

    useEffect(() => {
      if (toast.duration === 0) return; // Infinite duration
      const timer = setTimeout(dismiss, toast.duration ?? 5000);
      return () => clearTimeout(timer);
    }, [toast.duration, dismiss]);

    return (
      <div
        ref={ref}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className={cn(
          toastVariants({ type: toast.type }),
          isExiting && 'animate-out fade-out-0 slide-out-to-right-2',
          className,
        )}
        {...props}
      >
        <ToastIcon type={toast.type} />
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium">{toast.title}</p>
          {toast.description && (
            <p className="text-xs opacity-80">{toast.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className={cn(
            'shrink-0 rounded-md p-1 opacity-60 transition-opacity hover:opacity-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
          )}
          aria-label="Dismiss notification"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  },
);
ToastItem.displayName = 'ToastItem';
