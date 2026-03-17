import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodeEditor } from './code-editor.js';

describe('CodeEditor', () => {
  it('renders with value', () => {
    render(<CodeEditor value="SELECT * FROM users" onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('SELECT * FROM users')).toBeInTheDocument();
  });

  it('renders with label', () => {
    render(<CodeEditor value="" onChange={vi.fn()} label="SQL Query" />);
    expect(screen.getByText('SQL Query')).toBeInTheDocument();
  });

  it('renders with placeholder', () => {
    render(<CodeEditor value="" onChange={vi.fn()} placeholder="Type SQL here" />);
    expect(screen.getByPlaceholderText('Type SQL here')).toBeInTheDocument();
  });

  it('calls onChange on input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CodeEditor value="" onChange={onChange} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'S');

    expect(onChange).toHaveBeenCalledWith('S');
  });

  it('shows error message', () => {
    render(<CodeEditor value="" onChange={vi.fn()} error="Invalid SQL" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid SQL');
  });

  it('sets aria-invalid when error present', () => {
    render(<CodeEditor value="" onChange={vi.fn()} error="Error" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('renders line numbers', () => {
    render(<CodeEditor value={'line1\nline2\nline3'} onChange={vi.fn()} lineNumbers />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('hides line numbers when disabled', () => {
    const { container } = render(<CodeEditor value="SELECT 1" onChange={vi.fn()} lineNumbers={false} />);
    // Line number gutter should not exist
    const gutter = container.querySelector('[aria-hidden="true"].select-none');
    expect(gutter).not.toBeInTheDocument();
  });

  it('supports read-only mode', () => {
    render(<CodeEditor value="SELECT 1" onChange={vi.fn()} readOnly />);
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly');
  });

  it('supports disabled mode', () => {
    render(<CodeEditor value="SELECT 1" onChange={vi.fn()} disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('has spellcheck disabled', () => {
    render(<CodeEditor value="" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('spellcheck', 'false');
  });
});
