import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header, HeaderNavLink } from './header.js';

describe('Header', () => {
  it('renders with logo', () => {
    render(<Header logo={<div>Meridian</div>} />);
    expect(screen.getByText('Meridian')).toBeInTheDocument();
  });

  it('renders with navigation', () => {
    render(
      <Header
        nav={
          <>
            <HeaderNavLink active>Dashboard</HeaderNavLink>
            <HeaderNavLink>Queries</HeaderNavLink>
          </>
        }
      />,
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Queries')).toBeInTheDocument();
  });

  it('renders with actions', () => {
    render(
      <Header actions={<button>Profile</button>} />,
    );
    expect(screen.getByRole('button', { name: 'Profile' })).toBeInTheDocument();
  });

  it('has banner role', () => {
    render(<Header />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('renders all sizes', () => {
    const sizes = ['sm', 'md', 'lg'] as const;
    for (const size of sizes) {
      const { unmount } = render(<Header size={size} />);
      expect(screen.getByRole('banner')).toBeInTheDocument();
      unmount();
    }
  });
});

describe('HeaderNavLink', () => {
  it('renders as a link', () => {
    render(<HeaderNavLink href="/dashboard">Dashboard</HeaderNavLink>);
    const link = screen.getByRole('link', { name: 'Dashboard' });
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('marks active link', () => {
    render(<HeaderNavLink active>Active</HeaderNavLink>);
    expect(screen.getByText('Active').closest('a')).toHaveAttribute('aria-current', 'page');
  });
});
