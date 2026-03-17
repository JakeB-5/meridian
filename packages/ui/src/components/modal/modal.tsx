import {
  forwardRef,
  useEffect,
  useRef,
  useCallback,
  type HTMLAttributes,
  type ReactNode,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn.js';

// ---- Types ----

export interface ModalProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Whether the modal is visible */
  open: boolean;
  /** Callback when the modal requests to close */
  onClose: () => void;
  /** Modal title */
  title?: ReactNode;
  /** Modal description */
  description?: ReactNode;
  /** Footer content (typically actions) */
  footer?: ReactNode;
  /** Modal size */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** Whether clicking backdrop closes modal */
  closeOnBackdropClick?: boolean;
  /** Whether pressing Escape closes modal */
  closeOnEscape?: boolean;
  /** Portal target (defaults to document.body) */
  portalTarget?: HTMLElement;
  /** Whether to show close button */
  showCloseButton?: boolean;
}

// ---- Size classes ----

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]',
} as const;

// ---- Focus trap helpers ----

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

// ---- Close Icon ----

function CloseIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ---- Component ----

/**
 * Modal dialog component rendered via portal.
 * Includes focus trap, ESC to close, and backdrop click handling.
 * Follows WAI-ARIA dialog pattern.
 */
export const Modal = forwardRef<HTMLDivElement, ModalProps>(
  (
    {
      open,
      onClose,
      title,
      description,
      footer,
      size = 'md',
      closeOnBackdropClick = true,
      closeOnEscape = true,
      portalTarget,
      showCloseButton = true,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const dialogRef = useRef<HTMLDivElement>(null);
    const previousActiveElement = useRef<HTMLElement | null>(null);

    // Store previously focused element and restore on close
    useEffect(() => {
      if (open) {
        previousActiveElement.current = document.activeElement as HTMLElement;

        // Focus first focusable element in modal
        const timer = setTimeout(() => {
          if (dialogRef.current) {
            const focusable = getFocusableElements(dialogRef.current);
            if (focusable.length > 0) {
              focusable[0]!.focus();
            } else {
              dialogRef.current.focus();
            }
          }
        }, 0);

        return () => clearTimeout(timer);
      } else {
        // Restore focus
        previousActiveElement.current?.focus();
      }
    }, [open]);

    // Prevent body scroll when open
    useEffect(() => {
      if (open) {
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
          document.body.style.overflow = originalOverflow;
        };
      }
    }, [open]);

    // Focus trap
    const handleKeyDown = useCallback(
      (e: KeyboardEvent) => {
        if (e.key === 'Escape' && closeOnEscape) {
          e.stopPropagation();
          onClose();
          return;
        }

        if (e.key === 'Tab' && dialogRef.current) {
          const focusable = getFocusableElements(dialogRef.current);
          if (focusable.length === 0) {
            e.preventDefault();
            return;
          }

          const first = focusable[0]!;
          const last = focusable[focusable.length - 1]!;

          if (e.shiftKey) {
            if (document.activeElement === first) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      },
      [closeOnEscape, onClose],
    );

    const handleBackdropClick = useCallback(
      (e: MouseEvent) => {
        if (closeOnBackdropClick && e.target === e.currentTarget) {
          onClose();
        }
      },
      [closeOnBackdropClick, onClose],
    );

    if (!open) return null;

    const target = portalTarget ?? (typeof document !== 'undefined' ? document.body : null);
    if (!target) return null;

    const modal = (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        role="presentation"
      >
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
          aria-hidden="true"
          onClick={handleBackdropClick}
        />

        {/* Dialog */}
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'modal-title' : undefined}
          aria-describedby={description ? 'modal-description' : undefined}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          className={cn(
            'relative z-50 flex w-full flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl',
            'dark:border-zinc-700 dark:bg-zinc-900',
            'animate-in fade-in-0 zoom-in-95',
            sizeClasses[size],
            className,
          )}
          {...props}
        >
          {/* Header */}
          {(title || showCloseButton) && (
            <div className="flex items-start justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <div className="flex flex-col gap-1">
                {title && (
                  <h2
                    id="modal-title"
                    className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
                  >
                    {title}
                  </h2>
                )}
                {description && (
                  <p
                    id="modal-description"
                    className="text-sm text-zinc-500 dark:text-zinc-400"
                  >
                    {description}
                  </p>
                )}
              </div>
              {showCloseButton && (
                <button
                  type="button"
                  onClick={onClose}
                  className={cn(
                    'ml-4 rounded-md p-1.5 text-zinc-400 transition-colors',
                    'hover:bg-zinc-100 hover:text-zinc-600',
                    'dark:hover:bg-zinc-800 dark:hover:text-zinc-300',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                  )}
                  aria-label="Close modal"
                >
                  <CloseIcon />
                </button>
              )}
            </div>
          )}

          {/* Body */}
          <div
            ref={ref}
            className="flex-1 overflow-y-auto px-6 py-4"
          >
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
              {footer}
            </div>
          )}
        </div>
      </div>
    );

    return createPortal(modal, target);
  },
);
Modal.displayName = 'Modal';
