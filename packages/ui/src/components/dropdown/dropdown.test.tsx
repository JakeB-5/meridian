import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dropdown, type DropdownMenuItem } from './dropdown.js';

const items: DropdownMenuItem[] = [
  { key: 'edit', label: 'Edit' },
  { key: 'duplicate', label: 'Duplicate' },
  { key: 'sep1', type: 'divider' },
  { key: 'delete', label: 'Delete', danger: true },
  { key: 'disabled', label: 'Disabled Item', disabled: true },
];

describe('Dropdown', () => {
  it('renders trigger element', () => {
    render(<Dropdown items={items} trigger={<button>Open</button>} />);
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('does not show menu initially', () => {
    render(<Dropdown items={items} trigger={<button>Open</button>} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens menu on click', async () => {
    const user = userEvent.setup();
    render(<Dropdown items={items} trigger={<button>Open</button>} />);

    await user.click(screen.getByText('Open'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('closes menu on Escape', async () => {
    const user = userEvent.setup();
    render(<Dropdown items={items} trigger={<button>Open</button>} />);

    const trigger = screen.getByText('Open').closest('[role="button"]')!;
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('calls onItemClick when item is clicked', async () => {
    const user = userEvent.setup();
    const onItemClick = vi.fn();
    render(
      <Dropdown items={items} trigger={<button>Open</button>} onItemClick={onItemClick} />,
    );

    await user.click(screen.getByText('Open'));
    await user.click(screen.getByText('Edit'));

    expect(onItemClick).toHaveBeenCalledWith('edit');
  });

  it('calls individual item onClick handler', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const itemsWithHandler: DropdownMenuItem[] = [
      { key: 'custom', label: 'Custom', onClick },
    ];
    render(
      <Dropdown items={itemsWithHandler} trigger={<button>Open</button>} />,
    );

    await user.click(screen.getByText('Open'));
    await user.click(screen.getByText('Custom'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('supports keyboard navigation with ArrowDown', async () => {
    const user = userEvent.setup();
    const onItemClick = vi.fn();
    render(
      <Dropdown items={items} trigger={<button>Open</button>} onItemClick={onItemClick} />,
    );

    const trigger = screen.getByText('Open').closest('[role="button"]')!;
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(onItemClick).toHaveBeenCalledWith('duplicate');
  });

  it('does not activate disabled items', async () => {
    const user = userEvent.setup();
    const onItemClick = vi.fn();
    render(
      <Dropdown items={items} trigger={<button>Open</button>} onItemClick={onItemClick} />,
    );

    await user.click(screen.getByText('Open'));
    await user.click(screen.getByText('Disabled Item'));

    expect(onItemClick).not.toHaveBeenCalled();
  });

  it('renders dividers', async () => {
    const user = userEvent.setup();
    render(<Dropdown items={items} trigger={<button>Open</button>} />);

    await user.click(screen.getByText('Open'));
    const separators = screen.getAllByRole('separator');
    expect(separators).toHaveLength(1);
  });

  it('supports disabled dropdown', () => {
    render(<Dropdown items={items} trigger={<button>Open</button>} disabled />);
    const trigger = screen.getByText('Open').closest('[role="button"]')!;
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
  });
});
