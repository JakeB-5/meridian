# Group F3: apps/web — React Dashboard Application

## Task
Build the main web application: a React 19 + Vite 6 dashboard with TanStack Router and TanStack Query.

## Files to Create

### Root Setup
- vite.config.ts — React plugin, proxy to API server, TailwindCSS
- index.html — SPA entry
- tailwind.config.ts — extends @meridian/config preset
- postcss.config.js

### src/main.tsx
App entry: render RouterProvider

### src/app.tsx
Root app with providers: QueryClientProvider, ThemeProvider, ToastProvider

### src/router.ts
TanStack Router setup with routes:
```
/ → redirect to /dashboards
/login
/register
/dashboards
/dashboards/:id
/dashboards/:id/edit
/questions
/questions/new
/questions/:id
/questions/:id/edit
/datasources
/datasources/new
/datasources/:id
/users
/users/:id
/settings
```

### src/api/client.ts
API client using fetch:
- Base URL from env
- Auth token injection
- Error handling

### src/api/hooks/use-auth.ts
Auth hooks: useLogin, useRegister, useLogout, useCurrentUser

### src/api/hooks/use-datasources.ts
TanStack Query hooks for datasource CRUD

### src/api/hooks/use-questions.ts
### src/api/hooks/use-dashboards.ts
### src/api/hooks/use-users.ts

### src/stores/auth.store.ts
Zustand auth store: user, tokens, isAuthenticated

### src/stores/theme.store.ts
Zustand theme store: light/dark mode

### src/pages/login.page.tsx
Login form with email/password

### src/pages/register.page.tsx
Registration form

### src/pages/dashboards/dashboard-list.page.tsx
Grid of dashboard cards with search, filter, create button

### src/pages/dashboards/dashboard-detail.page.tsx
Dashboard viewer:
- Grid layout with dashboard cards
- Each card renders a ChartRenderer from @meridian/viz
- Filter bar
- Auto-refresh via WebSocket

### src/pages/dashboards/dashboard-editor.page.tsx
Dashboard editor:
- Drag-and-drop card positioning
- Add/remove cards
- Configure filters
- Save/publish

### src/pages/questions/question-list.page.tsx
Question list with search, filter, sort

### src/pages/questions/question-builder.page.tsx
Question builder:
- Tab: Visual Query Builder
  - Table selector (from datasource schema)
  - Column picker
  - Filter builder
  - Aggregation selector
  - Sort/limit controls
- Tab: SQL Editor
  - Code editor with syntax highlighting
  - Run button
  - Result table
- Visualization config panel (chart type, axes, colors)
- Save button

### src/pages/datasources/datasource-list.page.tsx
Datasource list with status indicators

### src/pages/datasources/datasource-form.page.tsx
Create/edit datasource form:
- Type selector
- Connection fields (dynamic based on type)
- Test connection button
- Save

### src/pages/datasources/datasource-detail.page.tsx
Datasource detail: schema browser (tables → columns)

### src/pages/users/user-list.page.tsx
User management: list, invite, role assignment

### src/pages/settings/settings.page.tsx
Organization settings, profile settings

### src/components/layout/app-layout.tsx
Main layout: sidebar + header + content (uses @meridian/ui)

### src/components/layout/sidebar-nav.tsx
Navigation items: Dashboards, Questions, Data Sources, Users, Settings

### src/components/query-builder/visual-builder.tsx
Visual query builder component

### src/components/query-builder/sql-editor.tsx
SQL editor with basic highlighting (textarea + syntax highlight)

### src/components/query-builder/result-table.tsx
Query result display table

### src/components/dashboard/dashboard-grid.tsx
CSS Grid / react-grid-layout based dashboard canvas

### src/components/dashboard/dashboard-card-wrapper.tsx
Card wrapper: renders question visualization + card controls

### src/hooks/use-websocket.ts
WebSocket hook for real-time updates

### src/index.ts

## Tests (Vitest + React Testing Library)
- src/pages/login.page.test.tsx
- src/pages/dashboards/dashboard-list.page.test.tsx
- src/components/query-builder/visual-builder.test.tsx
- src/api/hooks/use-auth.test.ts
- src/stores/auth.store.test.ts

## Dependencies
- @meridian/ui, @meridian/viz, @meridian/shared, @meridian/sdk
- react, react-dom, @tanstack/react-query, @tanstack/react-router
- zustand, tailwindcss, react-grid-layout

## Estimated LOC: ~15000 + ~3000 tests
