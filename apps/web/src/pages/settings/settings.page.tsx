import { useState, useCallback, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeStore, type Theme } from '@/stores/theme.store';
import { useUpdateProfile, useChangePassword } from '@/api/hooks/use-auth';
import { useToast } from '@/components/common/toast';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { PageHeader } from '@/components/common/page-header';
import { Tabs, TabPanel } from '@/components/common/tabs';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/utils';

export function SettingsPage() {
  useDocumentTitle('Settings');

  const [activeTab, setActiveTab] = useState('profile');

  const tabs = [
    { id: 'profile', label: 'Profile' },
    { id: 'password', label: 'Password' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'organization', label: 'Organization' },
  ];

  return (
    <div>
      <PageHeader title="Settings" description="Manage your account and preferences" />

      <div className="max-w-3xl">
        <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

        {activeTab === 'profile' && <ProfileTab />}
        {activeTab === 'password' && <PasswordTab />}
        {activeTab === 'appearance' && <AppearanceTab />}
        {activeTab === 'organization' && <OrganizationTab />}
      </div>
    </div>
  );
}

// ── Profile Tab ──────────────────────────────────────────────────────

function ProfileTab() {
  const { user } = useAuthStore();
  const updateMutation = useUpdateProfile();
  const toast = useToast();

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user]);

  const handleSave = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) {
        toast.warning('Name is required');
        return;
      }

      updateMutation.mutate(
        { name: name.trim(), email: email.trim() },
        {
          onSuccess: () => toast.success('Profile updated'),
          onError: (err) => toast.error('Failed to update profile', err.message),
        },
      );
    },
    [name, email, updateMutation, toast],
  );

  const isDirty = name !== (user?.name ?? '') || email !== (user?.email ?? '');

  return (
    <TabPanel>
      <div className="space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold"
            style={{
              backgroundColor: 'var(--color-primary-light)',
              color: 'var(--color-primary)',
            }}
          >
            {user ? getInitials(user.name) : '?'}
          </div>
          <div>
            <p className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
              {user?.name}
            </p>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {user?.email}
            </p>
            <p className="text-xs capitalize mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
              {user?.role}
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4 max-w-md">
          <div>
            <label htmlFor="settings-name" className="label">Full Name</label>
            <input
              id="settings-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="Your name"
              required
            />
          </div>
          <div>
            <label htmlFor="settings-email" className="label">Email Address</label>
            <input
              id="settings-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@example.com"
              required
            />
          </div>

          <button
            type="submit"
            disabled={updateMutation.isPending || !isDirty}
            className="btn btn-primary"
          >
            {updateMutation.isPending ? (
              <>
                <LoadingSpinner size="sm" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </form>
      </div>
    </TabPanel>
  );
}

// ── Password Tab ─────────────────────────────────────────────────────

function PasswordTab() {
  const changePasswordMutation = useChangePassword();
  const toast = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      if (!currentPassword) {
        toast.warning('Please enter your current password');
        return;
      }
      if (newPassword.length < 8) {
        toast.warning('New password must be at least 8 characters');
        return;
      }
      if (newPassword !== confirmPassword) {
        toast.warning('Passwords do not match');
        return;
      }

      changePasswordMutation.mutate(
        { currentPassword, newPassword },
        {
          onSuccess: () => {
            toast.success('Password changed successfully');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
          },
          onError: (err) => toast.error('Failed to change password', err.message),
        },
      );
    },
    [currentPassword, newPassword, confirmPassword, changePasswordMutation, toast],
  );

  return (
    <TabPanel>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div>
          <label htmlFor="pw-current" className="label">Current Password</label>
          <input
            id="pw-current"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="input"
            placeholder="Enter current password"
            autoComplete="current-password"
            required
          />
        </div>
        <div>
          <label htmlFor="pw-new" className="label">New Password</label>
          <input
            id="pw-new"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="input"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            required
          />
        </div>
        <div>
          <label htmlFor="pw-confirm" className="label">Confirm New Password</label>
          <input
            id="pw-confirm"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input"
            placeholder="Repeat new password"
            autoComplete="new-password"
            required
          />
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="text-xs mt-1 text-red-500">Passwords do not match</p>
          )}
        </div>

        <button
          type="submit"
          disabled={changePasswordMutation.isPending}
          className="btn btn-primary"
        >
          {changePasswordMutation.isPending ? (
            <>
              <LoadingSpinner size="sm" />
              Changing...
            </>
          ) : (
            'Change Password'
          )}
        </button>
      </form>
    </TabPanel>
  );
}

// ── Appearance Tab ───────────────────────────────────────────────────

function AppearanceTab() {
  const { theme, setTheme, resolvedTheme } = useThemeStore();

  const themeOptions: Array<{ value: Theme; label: string; description: string }> = [
    { value: 'light', label: 'Light', description: 'Use light theme' },
    { value: 'dark', label: 'Dark', description: 'Use dark theme' },
    { value: 'system', label: 'System', description: 'Follow your system preferences' },
  ];

  return (
    <TabPanel>
      <div className="space-y-6 max-w-md">
        <div>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
            Theme
          </h3>
          <div className="space-y-2">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
                  theme === option.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary)]',
                )}
              >
                {/* Theme preview */}
                <div
                  className="flex h-10 w-14 items-center justify-center rounded-md border text-xs font-mono"
                  style={{
                    backgroundColor: option.value === 'dark' || (option.value === 'system' && resolvedTheme === 'dark') ? '#0f172a' : '#ffffff',
                    color: option.value === 'dark' || (option.value === 'system' && resolvedTheme === 'dark') ? '#f1f5f9' : '#111827',
                    borderColor: option.value === 'dark' || (option.value === 'system' && resolvedTheme === 'dark') ? '#334155' : '#e5e7eb',
                  }}
                >
                  Aa
                </div>
                <div>
                  <p
                    className="text-sm font-medium"
                    style={{ color: theme === option.value ? 'var(--color-primary)' : 'var(--color-text)' }}
                  >
                    {option.label}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {option.description}
                  </p>
                </div>
                {theme === option.value && (
                  <svg className="h-5 w-5 ml-auto flex-shrink-0" style={{ color: 'var(--color-primary)' }} viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </TabPanel>
  );
}

// ── Organization Tab ─────────────────────────────────────────────────

function OrganizationTab() {
  const { user } = useAuthStore();
  const toast = useToast();

  const [orgName, setOrgName] = useState('');

  return (
    <TabPanel>
      <div className="space-y-6 max-w-md">
        <div>
          <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text)' }}>
            Organization
          </h3>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
            Manage your organization settings
          </p>
        </div>

        <div>
          <label htmlFor="org-id" className="label">Organization ID</label>
          <input
            id="org-id"
            type="text"
            value={user?.organizationId ?? ''}
            className="input font-mono"
            disabled
          />
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
            This is a read-only identifier
          </p>
        </div>

        <div>
          <label htmlFor="org-name" className="label">Organization Name</label>
          <input
            id="org-name"
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            className="input"
            placeholder="Your Organization"
          />
        </div>

        <div
          className="p-4 rounded-lg"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
          }}
        >
          <h4 className="text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
            Danger Zone
          </h4>
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-secondary)' }}>
            Deleting your organization will remove all data, including dashboards, questions, and data source connections. This action is irreversible.
          </p>
          <button
            onClick={() => toast.warning('Organization deletion is not yet available')}
            className="btn btn-danger btn-sm"
          >
            Delete Organization
          </button>
        </div>
      </div>
    </TabPanel>
  );
}
