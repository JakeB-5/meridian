import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { router } from '@/router';
import { ToastProvider } from '@/components/common/toast';
import { useCurrentUser } from '@/api/hooks/use-auth';
import { useAuthStore } from '@/stores/auth.store';
import { useEffect } from 'react';

// ── Query Client ─────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
    mutations: {
      retry: 0,
    },
  },
});

// ── Auth Initializer ─────────────────────────────────────────────────
// Loads the current user on mount if tokens exist

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, setLoading } = useAuthStore();
  const { isLoading, isError } = useCurrentUser();

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
    }
  }, [isAuthenticated, setLoading]);

  return <>{children}</>;
}

// ── App Component ────────────────────────────────────────────────────

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthInitializer>
          <RouterProvider router={router} />
        </AuthInitializer>
      </ToastProvider>
    </QueryClientProvider>
  );
}
