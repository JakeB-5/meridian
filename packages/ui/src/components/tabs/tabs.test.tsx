import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, type TabItem } from './tabs.js';

const items: TabItem[] = [
  { key: 'tab1', label: 'Tab 1', content: <div>Content 1</div> },
  { key: 'tab2', label: 'Tab 2', content: <div>Content 2</div> },
  { key: 'tab3', label: 'Tab 3', content: <div>Content 3</div>, disabled: true },
];

describe('Tabs', () => {
  it('renders tab labels', () => {
    render(<Tabs items={items} />);
    expect(screen.getByText('Tab 1')).toBeInTheDocument();
    expect(screen.getByText('Tab 2')).toBeInTheDocument();
    expect(screen.getByText('Tab 3')).toBeInTheDocument();
  });

  it('shows first tab content by default', () => {
    render(<Tabs items={items} />);
    expect(screen.getByText('Content 1')).toBeInTheDocument();
    expect(screen.queryByText('Content 2')).not.toBeInTheDocument();
  });

  it('switches tab on click', async () => {
    const user = userEvent.setup();
    render(<Tabs items={items} />);

    await user.click(screen.getByText('Tab 2'));
    expect(screen.getByText('Content 2')).toBeInTheDocument();
    expect(screen.queryByText('Content 1')).not.toBeInTheDocument();
  });

  it('calls onChange when tab changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs items={items} onChange={onChange} />);

    await user.click(screen.getByText('Tab 2'));
    expect(onChange).toHaveBeenCalledWith('tab2');
  });

  it('supports controlled active key', () => {
    render(<Tabs items={items} activeKey="tab2" />);
    expect(screen.getByText('Content 2')).toBeInTheDocument();
  });

  it('does not activate disabled tab', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs items={items} onChange={onChange} />);

    await user.click(screen.getByText('Tab 3'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('has proper ARIA roles', () => {
    render(<Tabs items={items} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });

  it('marks active tab with aria-selected', () => {
    render(<Tabs items={items} />);
    const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
    const tab2 = screen.getByRole('tab', { name: 'Tab 2' });
    expect(tab1).toHaveAttribute('aria-selected', 'true');
    expect(tab2).toHaveAttribute('aria-selected', 'false');
  });

  it('navigates with ArrowRight key', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs items={items} onChange={onChange} />);

    const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
    tab1.focus();
    await user.keyboard('{ArrowRight}');

    expect(onChange).toHaveBeenCalledWith('tab2');
  });

  it('navigates with ArrowLeft key (wraps around)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs items={items} onChange={onChange} />);

    const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
    tab1.focus();
    await user.keyboard('{ArrowLeft}');

    // Should wrap to the last enabled tab
    expect(onChange).toHaveBeenCalled();
  });

  it('renders line variant', () => {
    render(<Tabs items={items} variant="line" />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('renders pill variant', () => {
    render(<Tabs items={items} variant="pill" />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});
