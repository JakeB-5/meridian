import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Avatar } from './avatar.js';

describe('Avatar', () => {
  it('renders with image', () => {
    const { container } = render(<Avatar src="https://example.com/avatar.jpg" alt="User" />);
    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
  });

  it('shows initials when no image', () => {
    render(<Avatar name="John Doe" />);
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('shows single initial for single name', () => {
    render(<Avatar name="Alice" />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('shows fallback for no name and no image', () => {
    render(<Avatar />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('falls back to initials on image error', () => {
    const { container } = render(<Avatar src="https://broken.com/404.jpg" name="Jane Smith" />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    fireEvent.error(img!);
    expect(screen.getByText('JS')).toBeInTheDocument();
  });

  it('renders all sizes', () => {
    const sizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
    for (const size of sizes) {
      const { unmount } = render(<Avatar name="Test" size={size} />);
      expect(screen.getByRole('img')).toBeInTheDocument();
      unmount();
    }
  });

  it('uses name for aria-label', () => {
    render(<Avatar name="John Doe" />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'John Doe');
  });

  it('prefers alt over name for aria-label', () => {
    render(<Avatar name="John Doe" alt="Custom Alt" />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Custom Alt');
  });
});
