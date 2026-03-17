import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, type ColumnDef } from './table.js';

interface TestRow {
  id: string;
  name: string;
  email: string;
}

const columns: ColumnDef<TestRow>[] = [
  { key: 'name', header: 'Name', cell: (row) => row.name, sortable: true },
  { key: 'email', header: 'Email', cell: (row) => row.email },
];

const data: TestRow[] = [
  { id: '1', name: 'Alice', email: 'alice@test.com' },
  { id: '2', name: 'Bob', email: 'bob@test.com' },
  { id: '3', name: 'Charlie', email: 'charlie@test.com' },
];

describe('DataTable', () => {
  it('renders column headers', () => {
    render(<DataTable columns={columns} data={data} rowKey={(r) => r.id} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('renders row data', () => {
    render(<DataTable columns={columns} data={data} rowKey={(r) => r.id} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('bob@test.com')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<DataTable columns={columns} data={[]} rowKey={(r) => r.id} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('shows custom empty state', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        rowKey={(r) => r.id}
        emptyState={<div>Nothing here</div>}
      />,
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('shows loading skeletons', () => {
    render(
      <DataTable columns={columns} data={[]} rowKey={(r) => r.id} loading skeletonRows={3} />,
    );
    const statuses = screen.getAllByRole('status');
    expect(statuses.length).toBeGreaterThan(0);
  });

  it('handles sort click on sortable column', async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={data}
        rowKey={(r) => r.id}
        sort={{ column: '', direction: null }}
        onSortChange={onSortChange}
      />,
    );

    await user.click(screen.getByText('Name'));
    expect(onSortChange).toHaveBeenCalledWith({ column: 'name', direction: 'asc' });
  });

  it('cycles sort direction asc -> desc -> null', async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();

    const { rerender } = render(
      <DataTable
        columns={columns}
        data={data}
        rowKey={(r) => r.id}
        sort={{ column: 'name', direction: 'asc' }}
        onSortChange={onSortChange}
      />,
    );

    await user.click(screen.getByText('Name'));
    expect(onSortChange).toHaveBeenCalledWith({ column: 'name', direction: 'desc' });
  });

  it('supports row selection', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={data}
        rowKey={(r) => r.id}
        selectable
        selectedKeys={new Set<string>()}
        onSelectionChange={onSelectionChange}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    // First checkbox is "select all", rest are per-row
    expect(checkboxes).toHaveLength(4);

    await user.click(checkboxes[1]!);
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(['1']));
  });

  it('supports select all', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={data}
        rowKey={(r) => r.id}
        selectable
        selectedKeys={new Set<string>()}
        onSelectionChange={onSelectionChange}
      />,
    );

    const selectAllCheckbox = screen.getAllByRole('checkbox')[0]!;
    await user.click(selectAllCheckbox);

    expect(onSelectionChange).toHaveBeenCalledWith(new Set(['1', '2', '3']));
  });

  it('handles row click', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={data}
        rowKey={(r) => r.id}
        onRowClick={onRowClick}
      />,
    );

    await user.click(screen.getByText('Alice'));
    expect(onRowClick).toHaveBeenCalledWith(data[0], 0);
  });
});
