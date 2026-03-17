import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton, SkeletonText } from './skeleton.js';

describe('Skeleton', () => {
  it('renders with default props', () => {
    render(<Skeleton />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('applies custom width and height', () => {
    render(<Skeleton width={200} height={40} />);
    const el = screen.getByRole('status');
    expect(el.style.width).toBe('200px');
    expect(el.style.height).toBe('40px');
  });

  it('supports string width/height', () => {
    render(<Skeleton width="50%" height="2rem" />);
    const el = screen.getByRole('status');
    expect(el.style.width).toBe('50%');
    expect(el.style.height).toBe('2rem');
  });

  it('renders circular variant', () => {
    const { container } = render(<Skeleton variant="circular" />);
    expect(container.firstChild).toHaveClass('rounded-full');
  });

  it('renders text variant', () => {
    const { container } = render(<Skeleton variant="text" />);
    expect(container.firstChild).toHaveClass('rounded-sm');
  });

  it('has aria-busy attribute', () => {
    render(<Skeleton />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });
});

describe('SkeletonText', () => {
  it('renders default 3 lines', () => {
    render(<SkeletonText />);
    const statuses = screen.getAllByRole('status');
    // Parent + 3 child skeletons
    expect(statuses.length).toBeGreaterThanOrEqual(3);
  });

  it('renders specified number of lines', () => {
    render(<SkeletonText lines={5} />);
    const container = screen.getByLabelText('Loading text...');
    expect(container).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<SkeletonText className="my-skeleton" />);
    expect(container.firstChild).toHaveClass('my-skeleton');
  });
});
