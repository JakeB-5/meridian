import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../utils/cn.js';

// ---- Types ----

export interface LayoutProps extends HTMLAttributes<HTMLDivElement> {
  /** Sidebar element */
  sidebar?: ReactNode;
  /** Header element */
  header?: ReactNode;
}

/**
 * Page layout composing sidebar, header, and content area.
 * Uses flexbox for responsive sidebar + main content layout.
 */
export const Layout = forwardRef<HTMLDivElement, LayoutProps>(
  ({ sidebar, header, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('flex h-screen w-full overflow-hidden', className)}
        {...props}
      >
        {/* Sidebar */}
        {sidebar}

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          {header}

          {/* Content */}
          <main className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-900">
            {children}
          </main>
        </div>
      </div>
    );
  },
);
Layout.displayName = 'Layout';

// ---- PageContainer ----

export interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  /** Maximum width constraint */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}

const maxWidthClasses = {
  sm: 'max-w-2xl',
  md: 'max-w-4xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
  '2xl': 'max-w-screen-2xl',
  full: 'max-w-full',
} as const;

/**
 * Content container with max-width constraint and padding.
 */
export const PageContainer = forwardRef<HTMLDivElement, PageContainerProps>(
  ({ maxWidth = 'xl', className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('mx-auto w-full px-6 py-6', maxWidthClasses[maxWidth], className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);
PageContainer.displayName = 'PageContainer';

// ---- PageHeader ----

export interface PageHeaderProps extends HTMLAttributes<HTMLDivElement> {
  /** Page title */
  title: ReactNode;
  /** Page description */
  description?: ReactNode;
  /** Right-side actions */
  actions?: ReactNode;
  /** Breadcrumb element */
  breadcrumb?: ReactNode;
}

/**
 * Page header section with title, description, breadcrumbs, and actions.
 */
export const PageHeader = forwardRef<HTMLDivElement, PageHeaderProps>(
  ({ title, description, actions, breadcrumb, className, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('mb-6 space-y-2', className)} {...props}>
        {breadcrumb && <div className="mb-2">{breadcrumb}</div>}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {title}
            </h1>
            {description && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
      </div>
    );
  },
);
PageHeader.displayName = 'PageHeader';
