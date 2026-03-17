import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge.js';

describe('Badge', () => {
  it('renders with text', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders all variants', () => {
    const variants = ['default', 'success', 'warning', 'error', 'info'] as const;
    for (const variant of variants) {
      const { unmount } = render(<Badge variant={variant}>{variant}</Badge>);
      expect(screen.getByText(variant)).toBeInTheDocument();
      unmount();
    }
  });

  it('renders all sizes', () => {
    const sizes = ['sm', 'md', 'lg'] as const;
    for (const size of sizes) {
      const { unmount } = render(<Badge size={size}>Badge</Badge>);
      expect(screen.getByText('Badge')).toBeInTheDocument();
      unmount();
    }
  });

  it('renders with dot indicator', () => {
    const { container } = render(<Badge variant="success" dot>Online</Badge>);
    expect(screen.getByText('Online')).toBeInTheDocument();
    // Dot is a span with aria-hidden
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Badge className="my-badge">Custom</Badge>);
    expect(screen.getByText('Custom')).toHaveClass('my-badge');
  });
});
