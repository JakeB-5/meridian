import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn.js';
import { ToastItem, type ToastData, type ToastType } from './toast.js';

// ---- Types ----

export interface ToastOptions {
  title: string;
  description?: string;
  type?: ToastType;
  duration?: number;
}

export interface ToastContextValue {
  /** Show a toast notification */
  toast: (options: ToastOptions) => string;
  /** Show a success toast */
  success: (title: string, description?: string) => string;
  /** Show an error toast */
  error: (title: string, description?: string) => string;
  /** Show a warning toast */
  warning: (title: string, description?: string) => string;
  /** Show an info toast */
  info: (title: string, description?: string) => string;
  /** Dismiss a specific toast by id */
  dismiss: (id: string) => void;
  /** Dismiss all toasts */
  dismissAll: () => void;
}

// ---- Context ----

const ToastContext = createContext<ToastContextValue | null>(null);

// ---- ID generator ----

let nextId = 0;
function generateId(): string {
  return `toast-${++nextId}-${Date.now()}`;
}

// ---- Provider Props ----

export interface ToastProviderProps {
  children: ReactNode;
  /** Maximum visible toasts at once */
  maxVisible?: number;
  /** Position of toast container */
  position?: 'top-right' | 'top-left' | 'top-center' | 'bottom-right' | 'bottom-left' | 'bottom-center';
  /** Portal target */
  portalTarget?: HTMLElement;
}

const positionClasses = {
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
} as const;

/**
 * Toast notification provider and container.
 * Wraps the application to provide useToast() hook access.
 */
export function ToastProvider({
  children,
  maxVisible = 5,
  position = 'top-right',
  portalTarget,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback(
    (options: ToastOptions): string => {
      const id = generateId();
      const newToast: ToastData = {
        id,
        type: options.type ?? 'info',
        title: options.title,
        description: options.description,
        duration: options.duration,
      };

      setToasts((prev) => {
        const next = [newToast, ...prev];
        // Trim to max visible
        if (next.length > maxVisible) {
          return next.slice(0, maxVisible);
        }
        return next;
      });

      return id;
    },
    [maxVisible],
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const contextValue: ToastContextValue = {
    toast: addToast,
    success: (title, description) => addToast({ title, description, type: 'success' }),
    error: (title, description) => addToast({ title, description, type: 'error' }),
    warning: (title, description) => addToast({ title, description, type: 'warning' }),
    info: (title, description) => addToast({ title, description, type: 'info' }),
    dismiss,
    dismissAll,
  };

  const target = portalTarget ?? (typeof document !== 'undefined' ? document.body : null);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {target &&
        createPortal(
          <div
            className={cn(
              'pointer-events-none fixed z-[100] flex flex-col gap-2',
              positionClasses[position],
            )}
            aria-live="polite"
            aria-label="Notifications"
          >
            {toasts.map((toast) => (
              <ToastItem
                key={toast.id}
                toast={toast}
                onDismiss={dismiss}
              />
            ))}
          </div>,
          target,
        )}
    </ToastContext.Provider>
  );
}
ToastProvider.displayName = 'ToastProvider';

/**
 * Hook to access toast notification functionality.
 * Must be used within a ToastProvider.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
