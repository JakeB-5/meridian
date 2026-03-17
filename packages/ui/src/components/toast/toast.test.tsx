import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ToastProvider, useToast } from './toast-provider.js';

// Test component to trigger toasts
function ToastTrigger() {
  const { success, error, warning, info, dismissAll } = useToast();

  return (
    <div>
      <button onClick={() => success('Success!', 'It worked')}>Show Success</button>
      <button onClick={() => error('Error!', 'Something broke')}>Show Error</button>
      <button onClick={() => warning('Warning!')}>Show Warning</button>
      <button onClick={() => info('Info!')}>Show Info</button>
      <button onClick={() => dismissAll()}>Dismiss All</button>
    </div>
  );
}

function renderWithProvider(maxVisible?: number) {
  return render(
    <ToastProvider maxVisible={maxVisible}>
      <ToastTrigger />
    </ToastProvider>,
  );
}

describe('Toast System', () => {
  it('renders ToastProvider without crashing', () => {
    renderWithProvider();
    expect(screen.getByText('Show Success')).toBeInTheDocument();
  });

  it('shows a success toast', () => {
    renderWithProvider();
    fireEvent.click(screen.getByText('Show Success'));
    expect(screen.getByText('Success!')).toBeInTheDocument();
    expect(screen.getByText('It worked')).toBeInTheDocument();
  });

  it('shows an error toast', () => {
    renderWithProvider();
    fireEvent.click(screen.getByText('Show Error'));
    expect(screen.getByText('Error!')).toBeInTheDocument();
    expect(screen.getByText('Something broke')).toBeInTheDocument();
  });

  it('shows a warning toast', () => {
    renderWithProvider();
    fireEvent.click(screen.getByText('Show Warning'));
    expect(screen.getByText('Warning!')).toBeInTheDocument();
  });

  it('shows an info toast', () => {
    renderWithProvider();
    fireEvent.click(screen.getByText('Show Info'));
    expect(screen.getByText('Info!')).toBeInTheDocument();
  });

  it('dismisses all toasts', () => {
    renderWithProvider();

    fireEvent.click(screen.getByText('Show Success'));
    fireEvent.click(screen.getByText('Show Error'));
    expect(screen.getByText('Success!')).toBeInTheDocument();
    expect(screen.getByText('Error!')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Dismiss All'));
    expect(screen.queryByText('Success!')).not.toBeInTheDocument();
    expect(screen.queryByText('Error!')).not.toBeInTheDocument();
  });

  it('auto-dismisses toast after duration', () => {
    vi.useFakeTimers();

    renderWithProvider();
    fireEvent.click(screen.getByText('Show Info'));
    expect(screen.getByText('Info!')).toBeInTheDocument();

    // Default duration is 5000ms, plus 150ms exit animation
    act(() => {
      vi.advanceTimersByTime(5200);
    });

    expect(screen.queryByText('Info!')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('manual dismiss via close button', () => {
    vi.useFakeTimers();

    renderWithProvider();
    fireEvent.click(screen.getByText('Show Warning'));
    expect(screen.getByText('Warning!')).toBeInTheDocument();

    const dismissBtn = screen.getByLabelText('Dismiss notification');
    fireEvent.click(dismissBtn);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByText('Warning!')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('respects maxVisible', () => {
    renderWithProvider(2);

    fireEvent.click(screen.getByText('Show Success'));
    fireEvent.click(screen.getByText('Show Error'));
    fireEvent.click(screen.getByText('Show Warning'));

    // Only 2 should be visible (Warning and Error since newest first)
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(2);
  });

  it('renders toast with correct role', () => {
    renderWithProvider();
    fireEvent.click(screen.getByText('Show Success'));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveAttribute('aria-atomic', 'true');
  });

  it('throws error when useToast is used outside provider', () => {
    // Suppress console.error for this test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function BadComponent() {
      useToast();
      return null;
    }

    expect(() => render(<BadComponent />)).toThrow(
      'useToast must be used within a ToastProvider',
    );

    spy.mockRestore();
  });
});
