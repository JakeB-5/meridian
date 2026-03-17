import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/utils';

interface AvatarProps {
  name: string;
  src?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-xl',
};

// Deterministic color from name string
const colors = [
  { bg: '#dbeafe', fg: '#1e40af' }, // blue
  { bg: '#dcfce7', fg: '#166534' }, // green
  { bg: '#fef3c7', fg: '#92400e' }, // amber
  { bg: '#fce7f3', fg: '#9d174d' }, // pink
  { bg: '#e0e7ff', fg: '#3730a3' }, // indigo
  { bg: '#ffedd5', fg: '#9a3412' }, // orange
  { bg: '#f3e8ff', fg: '#6b21a8' }, // purple
  { bg: '#ccfbf1', fg: '#134e4a' }, // teal
];

function getColorForName(name: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const color = getColorForName(name);

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn(
          'rounded-full object-cover',
          sizeClasses[size],
          className,
        )}
        onError={(e) => {
          // Fallback to initials on image error
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          const parent = target.parentElement;
          if (parent) {
            parent.innerHTML = getInitials(name);
          }
        }}
      />
    );
  }

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold',
        sizeClasses[size],
        className,
      )}
      style={{ backgroundColor: color.bg, color: color.fg }}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
}

interface AvatarGroupProps {
  users: Array<{ name: string; src?: string }>;
  max?: number;
  size?: AvatarProps['size'];
  className?: string;
}

export function AvatarGroup({ users, max = 4, size = 'sm', className }: AvatarGroupProps) {
  const visible = users.slice(0, max);
  const remaining = users.length - max;

  return (
    <div className={cn('flex -space-x-2', className)}>
      {visible.map((user, i) => (
        <div key={i} className="ring-2 ring-white dark:ring-gray-800 rounded-full">
          <Avatar name={user.name} src={user.src} size={size} />
        </div>
      ))}
      {remaining > 0 && (
        <div
          className={cn(
            'inline-flex items-center justify-center rounded-full font-semibold ring-2 ring-white dark:ring-gray-800',
            sizeClasses[size ?? 'sm'],
          )}
          style={{
            backgroundColor: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-secondary)',
          }}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}
