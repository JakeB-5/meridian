import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../utils/cn.js';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Width of the skeleton (CSS value) */
  width?: string | number;
  /** Height of the skeleton (CSS value) */
  height?: string | number;
  /** Shape variant */
  variant?: 'rectangular' | 'circular' | 'text';
}

/**
 * Loading skeleton placeholder with pulse animation.
 * Used as a loading state indicator before content appears.
 */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, width, height, variant = 'rectangular', style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="status"
        aria-label="Loading..."
        aria-busy="true"
        className={cn(
          'animate-pulse bg-zinc-200 dark:bg-zinc-700',
          variant === 'circular' && 'rounded-full',
          variant === 'rectangular' && 'rounded-md',
          variant === 'text' && 'rounded-sm',
          className,
        )}
        style={{
          width: typeof width === 'number' ? `${width}px` : width,
          height:
            typeof height === 'number'
              ? `${height}px`
              : height ?? (variant === 'text' ? '1em' : undefined),
          ...style,
        }}
        {...props}
      />
    );
  },
);
Skeleton.displayName = 'Skeleton';

export interface SkeletonTextProps extends HTMLAttributes<HTMLDivElement> {
  /** Number of text lines to render */
  lines?: number;
  /** Gap between lines */
  gap?: string;
}

/**
 * Multiple skeleton lines for text content loading state.
 */
export const SkeletonText = forwardRef<HTMLDivElement, SkeletonTextProps>(
  ({ lines = 3, gap = '0.5rem', className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="status"
        aria-label="Loading text..."
        className={cn('flex flex-col', className)}
        style={{ gap }}
        {...props}
      >
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton
            key={i}
            variant="text"
            className={cn('h-4', i === lines - 1 ? 'w-3/4' : 'w-full')}
          />
        ))}
      </div>
    );
  },
);
SkeletonText.displayName = 'SkeletonText';
