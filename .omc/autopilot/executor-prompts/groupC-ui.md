# Group C5: @meridian/ui — Shared React Component Library

## Task
Build a reusable React component library with TailwindCSS v4, class-variance-authority for variants, and accessible design.

## Files to Create

### src/utils/cn.ts
```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

### src/components/button/button.tsx
Button with CVA variants:
- Variants: default, primary, secondary, destructive, outline, ghost, link
- Sizes: sm, md, lg, icon
- States: disabled, loading (with spinner)
- Renders as <button> or <a> via asChild pattern
- Keyboard accessible

### src/components/input/input.tsx
Text input:
- States: default, error, disabled
- Sizes: sm, md, lg
- Support for prefix/suffix icons
- Label and error message slots

### src/components/select/select.tsx
Custom select dropdown:
- Single and multi-select
- Search/filter support
- Option groups
- Keyboard navigation

### src/components/modal/modal.tsx
Modal dialog:
- Portal-rendered
- Focus trap
- ESC to close
- Backdrop click to close (configurable)
- Sizes: sm, md, lg, full

### src/components/dropdown/dropdown.tsx
Dropdown menu:
- Trigger element
- Menu items with icons
- Dividers
- Keyboard navigation
- Sub-menus

### src/components/table/table.tsx
Data table:
- Column definitions with sorting
- Row selection (checkbox)
- Pagination
- Loading skeleton
- Empty state
- Responsive horizontal scroll

### src/components/table/pagination.tsx
Pagination controls: prev, next, page numbers, page size select

### src/components/card/card.tsx
Card with header, body, footer slots

### src/components/badge/badge.tsx
Badge with variants: default, success, warning, error, info

### src/components/avatar/avatar.tsx
Avatar with image fallback to initials

### src/components/toast/toast.tsx + toast-provider.tsx
Toast notification system:
- Types: success, error, warning, info
- Auto-dismiss with configurable duration
- Stack management (max visible)
- useToast() hook

### src/components/sidebar/sidebar.tsx
Collapsible sidebar:
- Navigation items with icons
- Nested groups
- Active state
- Collapse/expand animation

### src/components/header/header.tsx
App header:
- Logo slot, navigation slot, actions slot
- Responsive

### src/components/layout/layout.tsx
Page layout: sidebar + header + content area

### src/components/form/form-field.tsx
Form field wrapper:
- Label
- Description
- Error message
- Required indicator
- Zod validation integration via react-hook-form

### src/components/form/form.tsx
Form wrapper with react-hook-form + Zod resolver

### src/components/skeleton/skeleton.tsx
Loading skeleton placeholder

### src/components/spinner/spinner.tsx
Loading spinner with sizes

### src/components/tabs/tabs.tsx
Tab navigation with content panels

### src/components/code-editor/code-editor.tsx
Simple code editor for SQL (textarea-based with syntax highlighting hook)

### src/hooks/use-media-query.ts
### src/hooks/use-click-outside.ts
### src/hooks/use-debounce.ts
### src/hooks/use-local-storage.ts

### src/index.ts — re-exports all components and hooks

## Tests
- Each component gets a basic render test
- Interactive components (select, modal, dropdown): keyboard nav tests
- Toast: lifecycle tests
- Form: validation integration tests

## Dependencies
- @meridian/shared
- react, react-dom (peer)
- class-variance-authority, clsx, tailwind-merge
- @hookform/resolvers, react-hook-form, zod
- tailwindcss (peer)

## Estimated LOC: ~8000 + ~2000 tests
