import { useState, useCallback } from 'react';
import { useRegister } from '@/api/hooks/use-auth';
import { useAuthStore } from '@/stores/auth.store';
import { useNavigate, Link } from '@/router';
import { useToast } from '@/components/common/toast';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { LoadingSpinner } from '@/components/common/loading-spinner';

export function RegisterPage() {
  useDocumentTitle('Create Account');

  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const registerMutation = useRegister();
  const toast = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Redirect if already authenticated
  if (isAuthenticated) {
    navigate({ to: '/dashboards' });
    return null;
  }

  const validateForm = (): string | null => {
    if (!name.trim()) return 'Name is required';
    if (!email.trim()) return 'Email is required';
    if (!password) return 'Password is required';
    if (password.length < 8) return 'Password must be at least 8 characters';
    if (password !== confirmPassword) return 'Passwords do not match';
    if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter';
    if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter';
    if (!/\d/.test(password)) return 'Password must contain a number';
    return null;
  };

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const error = validateForm();
      if (error) {
        toast.warning(error);
        return;
      }

      registerMutation.mutate(
        {
          name: name.trim(),
          email: email.trim(),
          password,
          organizationName: organizationName.trim() || undefined,
        },
        {
          onSuccess: () => {
            toast.success('Account created successfully!');
            navigate({ to: '/dashboards' });
          },
          onError: (err) => {
            toast.error(
              'Registration failed',
              err.message || 'Please try again',
            );
          },
        },
      );
    },
    [name, email, password, confirmPassword, organizationName, registerMutation, navigate, toast],
  );

  const passwordStrength = getPasswordStrength(password);

  return (
    <div className="w-full max-w-md">
      {/* Logo */}
      <div className="text-center mb-8">
        <div
          className="inline-flex h-14 w-14 items-center justify-center rounded-xl text-white text-2xl font-bold mb-4"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          M
        </div>
        <h1
          className="text-2xl font-bold"
          style={{ color: 'var(--color-text)' }}
        >
          Create your account
        </h1>
        <p
          className="mt-2 text-sm"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Get started with Meridian
        </p>
      </div>

      {/* Form */}
      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="reg-name" className="label">
              Full name
            </label>
            <input
              id="reg-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="Jane Doe"
              autoComplete="name"
              autoFocus
              required
              disabled={registerMutation.isPending}
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="reg-email" className="label">
              Email address
            </label>
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@example.com"
              autoComplete="email"
              required
              disabled={registerMutation.isPending}
            />
          </div>

          {/* Organization (optional) */}
          <div>
            <label htmlFor="reg-org" className="label">
              Organization name{' '}
              <span style={{ color: 'var(--color-text-tertiary)' }}>(optional)</span>
            </label>
            <input
              id="reg-org"
              type="text"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              className="input"
              placeholder="Acme Inc."
              disabled={registerMutation.isPending}
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="reg-password" className="label">
              Password
            </label>
            <div className="relative">
              <input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pr-10"
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
                disabled={registerMutation.isPending}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1"
                style={{ color: 'var(--color-text-tertiary)' }}
                tabIndex={-1}
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                  <path
                    fillRule="evenodd"
                    d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
            {/* Password strength indicator */}
            {password.length > 0 && (
              <div className="mt-2">
                <div className="flex gap-1 mb-1">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className="h-1 flex-1 rounded-full"
                      style={{
                        backgroundColor:
                          level <= passwordStrength.level
                            ? passwordStrength.color
                            : 'var(--color-bg-tertiary)',
                      }}
                    />
                  ))}
                </div>
                <p className="text-xs" style={{ color: passwordStrength.color }}>
                  {passwordStrength.label}
                </p>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label htmlFor="reg-confirm" className="label">
              Confirm password
            </label>
            <input
              id="reg-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input"
              placeholder="Repeat your password"
              autoComplete="new-password"
              required
              disabled={registerMutation.isPending}
            />
            {confirmPassword && password !== confirmPassword && (
              <p className="text-xs mt-1 text-red-500">Passwords do not match</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={registerMutation.isPending}
          >
            {registerMutation.isPending ? (
              <>
                <LoadingSpinner size="sm" />
                Creating account...
              </>
            ) : (
              'Create account'
            )}
          </button>
        </form>
      </div>

      {/* Login link */}
      <p
        className="mt-6 text-center text-sm"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        Already have an account?{' '}
        <Link
          to="/login"
          className="font-medium hover:underline"
          style={{ color: 'var(--color-primary)' }}
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

// ── Password strength helper ─────────────────────────────────────────

function getPasswordStrength(password: string): {
  level: number;
  label: string;
  color: string;
} {
  if (!password) return { level: 0, label: '', color: '' };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { level: 1, label: 'Weak', color: '#ef4444' };
  if (score <= 2) return { level: 2, label: 'Fair', color: '#f59e0b' };
  if (score <= 3) return { level: 3, label: 'Good', color: '#22c55e' };
  return { level: 4, label: 'Strong', color: '#16a34a' };
}
