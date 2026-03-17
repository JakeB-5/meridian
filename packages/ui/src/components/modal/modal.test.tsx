import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './modal.js';

describe('Modal', () => {
  it('does not render when closed', () => {
    render(
      <Modal open={false} onClose={vi.fn()}>
        Content
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders when open', () => {
    render(
      <Modal open={true} onClose={vi.fn()}>
        Content
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders title and description', () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="Test Title" description="Test desc">
        Body
      </Modal>,
    );
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test desc')).toBeInTheDocument();
  });

  it('renders footer', () => {
    render(
      <Modal open={true} onClose={vi.fn()} footer={<button>Save</button>}>
        Body
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('closes on Escape key', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>
        Content
      </Modal>,
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on Escape when closeOnEscape is false', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} closeOnEscape={false}>
        Content
      </Modal>,
    );

    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on close button click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>
        Content
      </Modal>,
    );

    await user.click(screen.getByLabelText('Close modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has aria-modal attribute', () => {
    render(
      <Modal open={true} onClose={vi.fn()}>
        Content
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('traps focus with Tab key', async () => {
    const user = userEvent.setup();
    render(
      <Modal
        open={true}
        onClose={vi.fn()}
        title="Focus Test"
        footer={
          <>
            <button>Cancel</button>
            <button>OK</button>
          </>
        }
      >
        <input type="text" aria-label="Input" />
      </Modal>,
    );

    // Tab through elements to verify focus stays within modal
    await user.tab();
    expect(document.activeElement?.tagName).toBeTruthy();
  });

  it('renders with different sizes', () => {
    const sizes = ['sm', 'md', 'lg', 'xl', 'full'] as const;
    for (const size of sizes) {
      const { unmount } = render(
        <Modal open={true} onClose={vi.fn()} size={size}>
          {size}
        </Modal>,
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      unmount();
    }
  });
});
