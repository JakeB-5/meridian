import { useState, useCallback } from 'react';
import {
  useUsers,
  useDeleteUser,
  useInviteUser,
  useDeactivateUser,
  useReactivateUser,
  useUpdateUser,
  useRoles,
} from '@/api/hooks/use-users';
import { useNavigate } from '@/router';
import { useToast } from '@/components/common/toast';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useDebounce } from '@/hooks/use-debounce';
import { PageHeader } from '@/components/common/page-header';
import { SearchInput } from '@/components/common/search-input';
import { Pagination } from '@/components/common/pagination';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { ListPageSkeleton } from '@/components/common/skeleton';
import { Select } from '@/components/common/select';
import { cn } from '@/lib/utils';
import { formatRelativeTime, formatDate, getInitials } from '@/lib/utils';
import { PAGINATION } from '@/lib/constants';
import type { UserResponse, PaginatedRequest } from '@/api/types';

export function UserListPage() {
  useDocumentTitle('Users');

  const navigate = useNavigate();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(PAGINATION.DEFAULT_PAGE);
  const [deleteTarget, setDeleteTarget] = useState<UserResponse | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');

  const debouncedSearch = useDebounce(search, 300);

  const params: PaginatedRequest = {
    page,
    pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
    search: debouncedSearch || undefined,
    sortBy: 'name',
    sortDirection: 'asc',
  };

  const { data, isLoading, isError, error, refetch } = useUsers(params);
  const { data: roles } = useRoles();
  const deleteMutation = useDeleteUser();
  const inviteMutation = useInviteUser();
  const deactivateMutation = useDeactivateUser();
  const reactivateMutation = useReactivateUser();

  const handleDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success('User deleted');
        setDeleteTarget(null);
      },
      onError: (err) => toast.error('Failed to delete', err.message),
    });
  }, [deleteTarget, deleteMutation, toast]);

  const handleInvite = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!inviteEmail.trim()) {
        toast.warning('Please enter an email address');
        return;
      }

      inviteMutation.mutate(
        { email: inviteEmail.trim(), role: inviteRole },
        {
          onSuccess: () => {
            toast.success('Invitation sent', `An invite has been sent to ${inviteEmail}`);
            setShowInvite(false);
            setInviteEmail('');
            setInviteRole('viewer');
          },
          onError: (err) => toast.error('Failed to send invite', err.message),
        },
      );
    },
    [inviteEmail, inviteRole, inviteMutation, toast],
  );

  const handleToggleActive = useCallback(
    (user: UserResponse) => {
      if (user.status === 'active') {
        deactivateMutation.mutate(user.id, {
          onSuccess: () => toast.success(`${user.name} has been deactivated`),
          onError: (err) => toast.error('Failed to deactivate', err.message),
        });
      } else {
        reactivateMutation.mutate(user.id, {
          onSuccess: () => toast.success(`${user.name} has been reactivated`),
          onError: (err) => toast.error('Failed to reactivate', err.message),
        });
      }
    },
    [deactivateMutation, reactivateMutation, toast],
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <span className="badge badge-success">Active</span>;
      case 'inactive': return <span className="badge badge-danger">Inactive</span>;
      case 'pending': return <span className="badge badge-warning">Pending</span>;
      default: return <span className="badge badge-info">{status}</span>;
    }
  };

  const roleOptions = (roles ?? []).map((r) => ({ value: r.name, label: r.name }));
  if (roleOptions.length === 0) {
    roleOptions.push(
      { value: 'admin', label: 'Admin' },
      { value: 'editor', label: 'Editor' },
      { value: 'viewer', label: 'Viewer' },
    );
  }

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage team members and their access"
        actions={
          <button onClick={() => setShowInvite(true)} className="btn btn-primary">
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M11 5a3 3 0 11-6 0 3 3 0 016 0zM2.046 15.253c-.058.468.172.92.57 1.175A9.953 9.953 0 008 18c1.982 0 3.83-.578 5.384-1.573.398-.254.628-.707.57-1.175a6.001 6.001 0 00-11.908 0zM12.75 7.75a.75.75 0 000 1.5h1.5v1.5a.75.75 0 001.5 0v-1.5h1.5a.75.75 0 000-1.5h-1.5v-1.5a.75.75 0 00-1.5 0v1.5h-1.5z" />
            </svg>
            Invite User
          </button>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <SearchInput
          value={search}
          onChange={(val) => { setSearch(val); setPage(1); }}
          placeholder="Search users..."
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <ListPageSkeleton rows={6} columns={5} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          icon={
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          }
          title={debouncedSearch ? 'No users found' : 'No users yet'}
          description="Invite team members to get started"
          action={
            <button onClick={() => setShowInvite(true)} className="btn btn-primary">
              Invite User
            </button>
          }
        />
      ) : (
        <>
          <div className="card p-0 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider hidden md:table-cell" style={{ color: 'var(--color-text-secondary)' }}>Role</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider hidden md:table-cell" style={{ color: 'var(--color-text-secondary)' }}>Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider hidden lg:table-cell" style={{ color: 'var(--color-text-secondary)' }}>Last Login</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider hidden lg:table-cell" style={{ color: 'var(--color-text-secondary)' }}>Joined</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((user) => (
                  <tr
                    key={user.id}
                    className="group hover:bg-[var(--color-surface-hover)] transition-colors"
                    style={{ borderBottom: '1px solid var(--color-border-light)' }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold flex-shrink-0"
                          style={{
                            backgroundColor: 'var(--color-primary-light)',
                            color: 'var(--color-primary)',
                          }}
                        >
                          {getInitials(user.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                            {user.name}
                          </p>
                          <p className="text-xs truncate" style={{ color: 'var(--color-text-tertiary)' }}>
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-sm capitalize" style={{ color: 'var(--color-text)' }}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {getStatusBadge(user.status)}
                    </td>
                    <td className="px-4 py-3 text-sm hidden lg:table-cell" style={{ color: 'var(--color-text-tertiary)' }}>
                      {user.lastLoginAt ? formatRelativeTime(user.lastLoginAt) : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-sm hidden lg:table-cell" style={{ color: 'var(--color-text-tertiary)' }}>
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleToggleActive(user)}
                          className="btn btn-ghost btn-sm"
                          title={user.status === 'active' ? 'Deactivate' : 'Reactivate'}
                        >
                          {user.status === 'active' ? 'Deactivate' : 'Reactivate'}
                        </button>
                        <button
                          onClick={() => setDeleteTarget(user)}
                          className="btn btn-ghost btn-sm text-red-500"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.totalPages > 1 && (
            <div className="flex justify-center mt-6">
              <Pagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
            </div>
          )}
        </>
      )}

      {/* Invite dialog */}
      {showInvite && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowInvite(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div
              className="w-full max-w-md rounded-xl p-6 shadow-xl"
              style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
            >
              <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text)' }}>
                Invite User
              </h2>
              <form onSubmit={handleInvite} className="space-y-4">
                <div>
                  <label htmlFor="invite-email" className="label">Email address</label>
                  <input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="input"
                    placeholder="colleague@example.com"
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label htmlFor="invite-role" className="label">Role</label>
                  <Select
                    id="invite-role"
                    value={inviteRole}
                    onChange={setInviteRole}
                    options={roleOptions}
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowInvite(false)} className="btn btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={inviteMutation.isPending} className="btn btn-primary">
                    {inviteMutation.isPending ? 'Sending...' : 'Send Invite'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* Delete dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete User"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
