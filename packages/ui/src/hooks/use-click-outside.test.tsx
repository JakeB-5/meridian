import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { useClickOutside } from './use-click-outside.js';

function TestComponent({ handler, enabled }: { handler: () => void; enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, handler, enabled);

  return (
    <div>
      <div ref={ref} data-testid="inside">Inside</div>
      <div data-testid="outside">Outside</div>
    </div>
  );
}

describe('useClickOutside', () => {
  it('calls handler when clicking outside', () => {
    const handler = vi.fn();
    render(<TestComponent handler={handler} />);

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not call handler when clicking inside', () => {
    const handler = vi.fn();
    render(<TestComponent handler={handler} />);

    fireEvent.mouseDown(screen.getByTestId('inside'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not call handler when disabled', () => {
    const handler = vi.fn();
    render(<TestComponent handler={handler} enabled={false} />);

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('responds to touchstart events', () => {
    const handler = vi.fn();
    render(<TestComponent handler={handler} />);

    fireEvent.touchStart(screen.getByTestId('outside'));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
