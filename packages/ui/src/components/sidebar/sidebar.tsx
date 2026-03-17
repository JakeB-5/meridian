import {
  forwardRef,
  useState,
  createContext,
  useContext,
  useCallback,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '../../utils/cn.js';

// ---- Types ----

export interface SidebarNavItem {
  key: string;
  label: string;
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  badge?: ReactNode;
  disabled?: boolean;
  children?: SidebarNavItem[];
}

export interface SidebarSection {
  key: string;
  title?: string;
  items: SidebarNavItem[];
}

// ---- Context ----

interface SidebarContextValue {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  setCollapsed: () => {},
  toggle: () => {},
});

export function useSidebar(): SidebarContextValue {
  return useContext(SidebarContext);
}

// ---- Icons ----

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-4', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

// ---- Nav Item Component ----

function NavItemComponent({
  item,
  collapsed,
  depth = 0,
}: {
  item: SidebarNavItem;
  collapsed: boolean;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = item.children && item.children.length > 0;

  const handleClick = () => {
    if (hasChildren) {
      setExpanded((prev) => !prev);
    }
    item.onClick?.();
  };

  const content = (
    <>
      {item.icon && (
        <span className="shrink-0 [&_svg]:h-5 [&_svg]:w-5">{item.icon}</span>
      )}
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge && <span className="shrink-0">{item.badge}</span>}
          {hasChildren && (
            <ChevronRightIcon
              className={cn(
                'shrink-0 transition-transform duration-200',
                expanded && 'rotate-90',
              )}
            />
          )}
        </>
      )}
    </>
  );

  const baseClass = cn(
    'group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    item.active
      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
      : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
    item.disabled && 'pointer-events-none opacity-50',
    collapsed && 'justify-center px-2',
    depth > 0 && !collapsed && 'ml-4 pl-4',
  );

  const Tag = item.href ? 'a' : 'button';
  const linkProps = item.href ? { href: item.href } : { type: 'button' as const };

  return (
    <li>
      <Tag
        {...linkProps}
        className={baseClass}
        onClick={handleClick}
        aria-current={item.active ? 'page' : undefined}
        aria-disabled={item.disabled}
        aria-expanded={hasChildren ? expanded : undefined}
        title={collapsed ? item.label : undefined}
      >
        {content}
      </Tag>
      {hasChildren && expanded && !collapsed && (
        <ul className="mt-1 space-y-0.5" role="group">
          {item.children!.map((child) => (
            <NavItemComponent
              key={child.key}
              item={child}
              collapsed={collapsed}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// ---- Sidebar Props ----

export interface SidebarProps extends HTMLAttributes<HTMLElement> {
  /** Navigation sections */
  sections: SidebarSection[];
  /** Initial collapsed state */
  defaultCollapsed?: boolean;
  /** Controlled collapsed state */
  collapsed?: boolean;
  /** Controlled collapse handler */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Header content (e.g., logo) */
  header?: ReactNode;
  /** Footer content */
  footer?: ReactNode;
  /** Width when expanded */
  width?: number;
  /** Width when collapsed */
  collapsedWidth?: number;
}

/**
 * Collapsible sidebar navigation with sections, nested items, and active states.
 * Includes toggle button and smooth width transition.
 */
export const Sidebar = forwardRef<HTMLElement, SidebarProps>(
  (
    {
      sections,
      defaultCollapsed = false,
      collapsed: controlledCollapsed,
      onCollapsedChange,
      header,
      footer,
      width = 256,
      collapsedWidth = 64,
      className,
      ...props
    },
    ref,
  ) => {
    const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
    const isControlled = controlledCollapsed !== undefined;
    const collapsed = isControlled ? controlledCollapsed : internalCollapsed;

    const setCollapsed = useCallback(
      (value: boolean) => {
        if (!isControlled) {
          setInternalCollapsed(value);
        }
        onCollapsedChange?.(value);
      },
      [isControlled, onCollapsedChange],
    );

    const toggle = useCallback(() => {
      setCollapsed(!collapsed);
    }, [collapsed, setCollapsed]);

    return (
      <SidebarContext.Provider value={{ collapsed, setCollapsed, toggle }}>
        <aside
          ref={ref}
          className={cn(
            'flex h-full flex-col border-r border-zinc-200 bg-white transition-[width] duration-200 ease-in-out',
            'dark:border-zinc-800 dark:bg-zinc-950',
            className,
          )}
          style={{ width: collapsed ? collapsedWidth : width }}
          aria-label="Sidebar navigation"
          {...props}
        >
          {/* Header */}
          {header && (
            <div className={cn('flex items-center border-b border-zinc-200 px-4 py-3 dark:border-zinc-800', collapsed && 'justify-center px-2')}>
              {header}
            </div>
          )}

          {/* Toggle button */}
          <div className={cn('flex px-3 py-2', collapsed ? 'justify-center' : 'justify-end')}>
            <button
              type="button"
              onClick={toggle}
              className={cn(
                'rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600',
                'dark:hover:bg-zinc-800 dark:hover:text-zinc-300',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              )}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <MenuIcon />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-2">
            {sections.map((section) => (
              <div key={section.key} className="mb-4">
                {section.title && !collapsed && (
                  <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    {section.title}
                  </h3>
                )}
                <ul className="space-y-0.5" role="list">
                  {section.items.map((item) => (
                    <NavItemComponent
                      key={item.key}
                      item={item}
                      collapsed={collapsed}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          {/* Footer */}
          {footer && (
            <div className={cn('border-t border-zinc-200 px-4 py-3 dark:border-zinc-800', collapsed && 'px-2')}>
              {footer}
            </div>
          )}
        </aside>
      </SidebarContext.Provider>
    );
  },
);
Sidebar.displayName = 'Sidebar';
