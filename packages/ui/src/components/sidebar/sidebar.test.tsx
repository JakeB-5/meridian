import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar, type SidebarSection } from './sidebar.js';

const sections: SidebarSection[] = [
  {
    key: 'main',
    title: 'Main',
    items: [
      { key: 'dashboard', label: 'Dashboard', active: true },
      { key: 'queries', label: 'Queries' },
      {
        key: 'settings',
        label: 'Settings',
        children: [
          { key: 'general', label: 'General' },
          { key: 'team', label: 'Team' },
        ],
      },
    ],
  },
];

describe('Sidebar', () => {
  it('renders navigation items', () => {
    render(<Sidebar sections={sections} />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Queries')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders section titles', () => {
    render(<Sidebar sections={sections} />);
    expect(screen.getByText('Main')).toBeInTheDocument();
  });

  it('marks active item', () => {
    render(<Sidebar sections={sections} />);
    const dashboard = screen.getByText('Dashboard').closest('button, a');
    expect(dashboard).toHaveAttribute('aria-current', 'page');
  });

  it('toggles collapse on button click', async () => {
    const user = userEvent.setup();
    const onCollapsedChange = vi.fn();
    render(
      <Sidebar sections={sections} onCollapsedChange={onCollapsedChange} />,
    );

    const toggleBtn = screen.getByLabelText('Collapse sidebar');
    await user.click(toggleBtn);
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it('renders header slot', () => {
    render(
      <Sidebar sections={sections} header={<div>Logo</div>} />,
    );
    expect(screen.getByText('Logo')).toBeInTheDocument();
  });

  it('renders footer slot', () => {
    render(
      <Sidebar sections={sections} footer={<div>Footer</div>} />,
    );
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('expands nested items on click', async () => {
    const user = userEvent.setup();
    render(<Sidebar sections={sections} />);

    // Children should not be visible initially
    expect(screen.queryByText('General')).not.toBeInTheDocument();

    // Click Settings to expand
    await user.click(screen.getByText('Settings'));
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Team')).toBeInTheDocument();
  });

  it('starts collapsed when defaultCollapsed is true', () => {
    render(<Sidebar sections={sections} defaultCollapsed />);
    // Section titles should be hidden when collapsed
    expect(screen.queryByText('Main')).not.toBeInTheDocument();
  });

  it('has aria-label on navigation', () => {
    render(<Sidebar sections={sections} />);
    expect(screen.getByLabelText('Sidebar navigation')).toBeInTheDocument();
  });
});
