import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select, type SelectOption } from './select.js';

const options: SelectOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'disabled', label: 'Disabled Option', disabled: true },
];

describe('Select', () => {
  it('renders with placeholder', () => {
    render(<Select options={options} placeholder="Pick a fruit" />);
    expect(screen.getByText('Pick a fruit')).toBeInTheDocument();
  });

  it('renders with label', () => {
    render(<Select options={options} label="Fruit" />);
    expect(screen.getByText('Fruit')).toBeInTheDocument();
  });

  it('opens dropdown on click', async () => {
    const user = userEvent.setup();
    render(<Select options={options} />);

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Banana')).toBeInTheDocument();
  });

  it('selects a value on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select options={options} onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('Banana'));

    expect(onChange).toHaveBeenCalledWith('banana');
  });

  it('shows selected value', () => {
    render(<Select options={options} value="cherry" />);
    expect(screen.getByText('Cherry')).toBeInTheDocument();
  });

  it('shows error message', () => {
    render(<Select options={options} error="Required" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });

  it('supports keyboard navigation - ArrowDown opens', async () => {
    const user = userEvent.setup();
    render(<Select options={options} />);

    const combobox = screen.getByRole('combobox');
    combobox.focus();
    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('supports keyboard navigation - Escape closes', async () => {
    const user = userEvent.setup();
    render(<Select options={options} />);

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('supports keyboard selection with Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select options={options} onChange={onChange} />);

    const combobox = screen.getByRole('combobox');
    combobox.focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith('apple');
  });

  it('navigates through options with ArrowDown/ArrowUp', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select options={options} onChange={onChange} />);

    const combobox = screen.getByRole('combobox');
    combobox.focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith('banana');
  });

  it('supports disabled state', () => {
    render(<Select options={options} disabled />);
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-disabled', 'true');
  });

  it('handles multi-select mode', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select options={options} multiple value={[]} onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('Apple'));

    expect(onChange).toHaveBeenCalledWith(['apple']);
  });

  it('toggles selection in multi-select mode', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select options={options} multiple value={['apple']} onChange={onChange} />,
    );

    await user.click(screen.getByRole('combobox'));
    // In multi-select with value=['apple'], "Apple" appears in both combobox text and listbox.
    // Click the option in the listbox.
    const listbox = screen.getByRole('listbox');
    const appleOption = listbox.querySelector('[role="option"][aria-selected="true"]')!;
    await user.click(appleOption);

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('shows "No options found" when search yields no results', async () => {
    const user = userEvent.setup();
    render(<Select options={options} searchable />);

    await user.click(screen.getByRole('combobox'));
    const searchInput = screen.getByLabelText('Search options');
    await user.type(searchInput, 'xyz');

    expect(screen.getByText('No options found')).toBeInTheDocument();
  });
});
