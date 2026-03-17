import {
  createRouter,
  createRoute,
  createRootRoute,
  redirect,
  Outlet,
  useRouter,
  useMatch,
  useParams,
  useSearch,
  useNavigate,
  Navigate,
  Link,
} from '@tanstack/react-router';
import { AppLayout } from '@/components/layout/app-layout';
import { useAuthStore } from '@/stores/auth.store';

// Lazy-loaded page imports
import { LoginPage } from '@/pages/login.page';
import { RegisterPage } from '@/pages/register.page';
import { DashboardListPage } from '@/pages/dashboards/dashboard-list.page';
import { DashboardDetailPage } from '@/pages/dashboards/dashboard-detail.page';
import { DashboardEditorPage } from '@/pages/dashboards/dashboard-editor.page';
import { QuestionListPage } from '@/pages/questions/question-list.page';
import { QuestionBuilderPage } from '@/pages/questions/question-builder.page';
import { DatasourceListPage } from '@/pages/datasources/datasource-list.page';
import { DatasourceFormPage } from '@/pages/datasources/datasource-form.page';
import { DatasourceDetailPage } from '@/pages/datasources/datasource-detail.page';
import { UserListPage } from '@/pages/users/user-list.page';
import { SettingsPage } from '@/pages/settings/settings.page';

// ── Root route ───────────────────────────────────────────────────────

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

// ── Auth layout (no sidebar) ─────────────────────────────────────────

const authLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'auth-layout',
  component: () => (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--color-bg-secondary)' }}
    >
      <Outlet />
    </div>
  ),
});

const loginRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/login',
  component: LoginPage,
});

const registerRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/register',
  component: RegisterPage,
});

// ── App layout (with sidebar) ────────────────────────────────────────

function AuthenticatedLayout() {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  const currentPath = router.state.location.pathname;

  return (
    <AppLayout
      currentPath={currentPath}
      onNavigate={(path) => router.navigate({ to: path })}
    >
      <Outlet />
    </AppLayout>
  );
}

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app-layout',
  component: AuthenticatedLayout,
});

// ── Index redirect ───────────────────────────────────────────────────

const indexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/',
  component: () => <Navigate to="/dashboards" />,
});

// ── Dashboard routes ─────────────────────────────────────────────────

const dashboardsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/dashboards',
  component: DashboardListPage,
});

const dashboardDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/dashboards/$id',
  component: DashboardDetailPage,
});

const dashboardEditRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/dashboards/$id/edit',
  component: DashboardEditorPage,
});

// ── Question routes ──────────────────────────────────────────────────

const questionsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/questions',
  component: QuestionListPage,
});

const questionNewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/questions/new',
  component: QuestionBuilderPage,
});

const questionDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/questions/$id',
  component: QuestionBuilderPage,
});

const questionEditRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/questions/$id/edit',
  component: QuestionBuilderPage,
});

// ── Data source routes ───────────────────────────────────────────────

const datasourcesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/datasources',
  component: DatasourceListPage,
});

const datasourceNewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/datasources/new',
  component: DatasourceFormPage,
});

const datasourceDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/datasources/$id',
  component: DatasourceDetailPage,
});

// ── User routes ──────────────────────────────────────────────────────

const usersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/users',
  component: UserListPage,
});

// ── Settings route ───────────────────────────────────────────────────

const settingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/settings',
  component: SettingsPage,
});

// ── Build route tree ─────────────────────────────────────────────────

const routeTree = rootRoute.addChildren([
  authLayoutRoute.addChildren([loginRoute, registerRoute]),
  appLayoutRoute.addChildren([
    indexRoute,
    dashboardsRoute,
    dashboardDetailRoute,
    dashboardEditRoute,
    questionsRoute,
    questionNewRoute,
    questionDetailRoute,
    questionEditRoute,
    datasourcesRoute,
    datasourceNewRoute,
    datasourceDetailRoute,
    usersRoute,
    settingsRoute,
  ]),
]);

// ── Create router ────────────────────────────────────────────────────

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultNotFoundComponent: () => (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
        404 - Page Not Found
      </h2>
      <p style={{ color: 'var(--color-text-secondary)' }}>
        The page you are looking for does not exist.
      </p>
      <Link to="/dashboards" className="btn btn-primary">
        Go to Dashboards
      </Link>
    </div>
  ),
});

// ── Type augmentation ────────────────────────────────────────────────

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// Re-export useful hooks
export { useRouter, useParams, useNavigate, useSearch, Link, Navigate };
