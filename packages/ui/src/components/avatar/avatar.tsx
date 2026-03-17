import {
  forwardRef,
  useState,
  type ImgHTMLAttributes,
  type HTMLAttributes,
} from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn.js';

export const avatarVariants = cva(
  'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700',
  {
    variants: {
      size: {
        xs: 'h-6 w-6 text-[10px]',
        sm: 'h-8 w-8 text-xs',
        md: 'h-10 w-10 text-sm',
        lg: 'h-12 w-12 text-base',
        xl: 'h-16 w-16 text-lg',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
);

export type AvatarVariantProps = VariantProps<typeof avatarVariants>;

export interface AvatarProps
  extends HTMLAttributes<HTMLDivElement>,
    AvatarVariantProps {
  /** Image source URL */
  src?: string | null;
  /** Alt text for the image */
  alt?: string;
  /** Full name to derive initials from */
  name?: string;
  /** Image loading props */
  imgProps?: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'>;
}

/**
 * Extracts up to 2 initials from a full name.
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]![0]?.toUpperCase() ?? '';
  return `${parts[0]![0]?.toUpperCase() ?? ''}${parts[parts.length - 1]![0]?.toUpperCase() ?? ''}`;
}

/**
 * Simple deterministic color from a string for fallback background.
 */
function getColorFromName(name: string): string {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-amber-500',
    'bg-pink-500',
    'bg-cyan-500',
    'bg-indigo-500',
    'bg-teal-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length]!;
}

/**
 * Avatar component with image and initials fallback.
 * Automatically generates initials and background color from the name.
 */
export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, size, src, alt, name, imgProps, ...props }, ref) => {
    const [imgError, setImgError] = useState(false);
    const showImage = src && !imgError;
    const initials = name ? getInitials(name) : '';
    const bgColor = name ? getColorFromName(name) : '';

    return (
      <div
        ref={ref}
        className={cn(
          avatarVariants({ size }),
          !showImage && name && bgColor,
          className,
        )}
        role="img"
        aria-label={alt ?? name ?? 'Avatar'}
        {...props}
      >
        {showImage ? (
          <img
            src={src}
            alt={alt ?? name ?? 'Avatar'}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
            {...imgProps}
          />
        ) : (
          <span className="font-medium text-white select-none" aria-hidden="true">
            {initials || '?'}
          </span>
        )}
      </div>
    );
  },
);
Avatar.displayName = 'Avatar';
