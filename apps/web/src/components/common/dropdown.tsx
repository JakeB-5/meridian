import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────

interface DropdownItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  separator?: false;
}

interface DropdownSeparator {
  separator: true;
}

type DropdownEntry = DropdownItem | DropdownSeparator;

interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownEntry[];
  onSelect: (id: string) => void;
  align?: 'left' | 'right';
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────

export function Dropdown({
  trigger,
  items,
  onSelect,
  align = 'right',
  className,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const handleSelect = useCallback(
    (id: string) => {
      setOpen(false);
      onSelect(id);
    },
    [onSelect],
  );

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)}>
      {/* Trigger */}
      <div onClick={() => setOpen(!open)}>{trigger}</div>

      {/* Menu */}
      {open && (
        <div
          className={cn(
            'absolute top-full mt-1 w-48 rounded-lg py-1 shadow-lg z-50',
            'animate-[fadeIn_0.1s_ease-out]',
            align === 'right' ? 'right-0' : 'left-0',
          )}
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
          role="menu"
        >
          {items.map((entry, i) => {
            if ('separator' in entry && entry.separator) {
              return (
                <div
                  key={`sep-${i}`}
                  className="my-1 border-t"
                  style={{ borderColor: 'var(--color-border)' }}
                  role="separator"
                />
              );
            }

            const item = entry as DropdownItem;
            return (
              <button
                key={item.id}
                onClick={() => !item.disabled && handleSelect(item.id)}
                disabled={item.disabled}
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left transition-colors',
                  item.disabled && 'opacity-50 cursor-not-allowed',
                  !item.disabled && !item.destructive && 'hover:bg-[var(--color-bg-tertiary)]',
                  !item.disabled && item.destructive && 'hover:bg-red-50 dark:hover:bg-red-900/20',
                )}
                style={{
                  color: item.destructive ? '#ef4444' : 'var(--color-text)',
                }}
                role="menuitem"
              >
                {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
