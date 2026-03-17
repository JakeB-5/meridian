import {
  forwardRef,
  useState,
  useRef,
  useCallback,
  useEffect,
  createContext,
  useContext,
  useId,
  type ReactNode,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { cn } from '../../utils/cn.js';
import { useClickOutside } from '../../hooks/use-click-outside.js';

// ---- Types ----

export interface DropdownItem {
  /** Unique key for the item */
  key: string;
  /** Display label */
  label: ReactNode;
  /** Icon before the label */
  icon?: ReactNode;
  /** Disable this item */
  disabled?: boolean;
  /** Danger/destructive styling */
  danger?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Keyboard shortcut hint */
  shortcut?: string;
}

export interface DropdownDivider {
  key: string;
  type: 'divider';
}

export interface DropdownLabel {
  key: string;
  type: 'label';
  label: string;
}

export type DropdownMenuItem = DropdownItem | DropdownDivider | DropdownLabel;

function isDivider(item: DropdownMenuItem): item is DropdownDivider {
  return 'type' in item && item.type === 'divider';
}

function isLabel(item: DropdownMenuItem): item is DropdownLabel {
  return 'type' in item && item.type === 'label';
}

function isActionItem(item: DropdownMenuItem): item is DropdownItem {
  return !isDivider(item) && !isLabel(item);
}

// ---- Context ----

interface DropdownContextValue {
  isOpen: boolean;
  close: () => void;
}

const DropdownContext = createContext<DropdownContextValue>({
  isOpen: false,
  close: () => {},
});

// ---- Props ----

export interface DropdownProps extends HTMLAttributes<HTMLDivElement> {
  /** Items to render in the menu */
  items: DropdownMenuItem[];
  /** Trigger element */
  trigger: ReactNode;
  /** Menu alignment relative to trigger */
  align?: 'start' | 'end' | 'center';
  /** Menu position direction */
  side?: 'top' | 'bottom';
  /** Disable the entire dropdown */
  disabled?: boolean;
  /** Callback after an item is clicked */
  onItemClick?: (key: string) => void;
}

// ---- Component ----

/**
 * Dropdown menu component with trigger, items, dividers, and keyboard navigation.
 * Follows WAI-ARIA menu pattern.
 */
export const Dropdown = forwardRef<HTMLDivElement, DropdownProps>(
  (
    {
      items,
      trigger,
      align = 'start',
      side = 'bottom',
      disabled = false,
      onItemClick,
      className,
      ...props
    },
    ref,
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const menuId = useId();
    const triggerId = `${menuId}-trigger`;
    const containerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLUListElement>(null);

    useClickOutside(containerRef, () => {
      setIsOpen(false);
      setHighlightedIndex(-1);
    });

    const actionItems = items.filter(isActionItem);
    const enabledItems = actionItems.filter((i) => !i.disabled);

    // Scroll highlighted into view
    useEffect(() => {
      if (isOpen && menuRef.current && highlightedIndex >= 0) {
        const el = menuRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
        el?.scrollIntoView({ block: 'nearest' });
      }
    }, [highlightedIndex, isOpen]);

    const close = useCallback(() => {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }, []);

    const handleTriggerClick = useCallback(
      (e: MouseEvent) => {
        e.stopPropagation();
        if (!disabled) {
          setIsOpen((o) => !o);
        }
      },
      [disabled],
    );

    const handleKeyDown = useCallback(
      (e: KeyboardEvent) => {
        if (disabled) return;

        switch (e.key) {
          case 'Enter':
          case ' ': {
            e.preventDefault();
            if (!isOpen) {
              setIsOpen(true);
              setHighlightedIndex(0);
            } else if (highlightedIndex >= 0 && enabledItems[highlightedIndex]) {
              const item = enabledItems[highlightedIndex]!;
              item.onClick?.();
              onItemClick?.(item.key);
              close();
            }
            break;
          }
          case 'ArrowDown': {
            e.preventDefault();
            if (!isOpen) {
              setIsOpen(true);
              setHighlightedIndex(0);
            } else {
              setHighlightedIndex((p) =>
                p < enabledItems.length - 1 ? p + 1 : 0,
              );
            }
            break;
          }
          case 'ArrowUp': {
            e.preventDefault();
            if (isOpen) {
              setHighlightedIndex((p) =>
                p > 0 ? p - 1 : enabledItems.length - 1,
              );
            }
            break;
          }
          case 'Escape': {
            e.preventDefault();
            close();
            break;
          }
          case 'Home': {
            if (isOpen) {
              e.preventDefault();
              setHighlightedIndex(0);
            }
            break;
          }
          case 'End': {
            if (isOpen) {
              e.preventDefault();
              setHighlightedIndex(enabledItems.length - 1);
            }
            break;
          }
        }
      },
      [disabled, isOpen, highlightedIndex, enabledItems, onItemClick, close],
    );

    // Track enabled item index for highlighting
    let enabledIndex = -1;

    return (
      <DropdownContext.Provider value={{ isOpen, close }}>
        <div
          ref={containerRef}
          className={cn('relative inline-block', className)}
          {...props}
        >
          {/* Trigger */}
          <div
            ref={ref}
            id={triggerId}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-haspopup="menu"
            aria-expanded={isOpen}
            aria-controls={isOpen ? menuId : undefined}
            aria-disabled={disabled}
            onClick={handleTriggerClick}
            onKeyDown={handleKeyDown}
            className={cn(disabled && 'pointer-events-none opacity-50')}
          >
            {trigger}
          </div>

          {/* Menu */}
          {isOpen && (
            <ul
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-labelledby={triggerId}
              className={cn(
                'absolute z-50 min-w-[12rem] overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-lg',
                'dark:border-zinc-700 dark:bg-zinc-900',
                'animate-in fade-in-0 zoom-in-95',
                side === 'bottom' && 'top-full mt-1',
                side === 'top' && 'bottom-full mb-1',
                align === 'start' && 'left-0',
                align === 'end' && 'right-0',
                align === 'center' && 'left-1/2 -translate-x-1/2',
              )}
            >
              {items.map((item) => {
                if (isDivider(item)) {
                  return (
                    <li
                      key={item.key}
                      role="separator"
                      className="my-1 h-px bg-zinc-200 dark:bg-zinc-700"
                    />
                  );
                }

                if (isLabel(item)) {
                  return (
                    <li
                      key={item.key}
                      role="presentation"
                      className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500"
                    >
                      {item.label}
                    </li>
                  );
                }

                if (!item.disabled) enabledIndex++;
                const currentEnabledIndex = item.disabled ? -1 : enabledIndex;
                const isHighlighted = currentEnabledIndex === highlightedIndex;

                return (
                  <li
                    key={item.key}
                    role="menuitem"
                    tabIndex={-1}
                    aria-disabled={item.disabled}
                    data-index={item.disabled ? undefined : currentEnabledIndex}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors',
                      isHighlighted && 'bg-zinc-100 dark:bg-zinc-800',
                      item.disabled &&
                        'cursor-not-allowed text-zinc-300 dark:text-zinc-600',
                      item.danger &&
                        !item.disabled &&
                        'text-red-600 dark:text-red-400',
                      !item.danger &&
                        !item.disabled &&
                        !isHighlighted &&
                        'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800',
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!item.disabled) {
                        item.onClick?.();
                        onItemClick?.(item.key);
                        close();
                      }
                    }}
                    onMouseEnter={() => {
                      if (!item.disabled) setHighlightedIndex(currentEnabledIndex);
                    }}
                  >
                    {item.icon && (
                      <span className="shrink-0 [&_svg]:h-4 [&_svg]:w-4">{item.icon}</span>
                    )}
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.shortcut && (
                      <span className="ml-4 text-xs text-zinc-400 dark:text-zinc-500">
                        {item.shortcut}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DropdownContext.Provider>
    );
  },
);
Dropdown.displayName = 'Dropdown';

/**
 * Hook to access dropdown context from child components.
 */
export function useDropdown(): DropdownContextValue {
  return useContext(DropdownContext);
}
