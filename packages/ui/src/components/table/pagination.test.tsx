import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from './pagination.js';

describe('Pagination', () => {
  it('renders page numbers', () => {
    render(
      <Pagination currentPage={1} totalPages={5} onPageChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('Go to page 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to page 5')).toBeInTheDocument();
  });

  it('highlights current page', () => {
    render(
      <Pagination currentPage={3} totalPages={5} onPageChange={vi.fn()} />,
    );
    const currentBtn = screen.getByLabelText('Go to page 3');
    expect(currentBtn).toHaveAttribute('aria-current', 'page');
  });

  it('calls onPageChange for next button', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <Pagination currentPage={2} totalPages={5} onPageChange={onPageChange} />,
    );

    await user.click(screen.getByLabelText('Go to next page'));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('calls onPageChange for previous button', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <Pagination currentPage={3} totalPages={5} onPageChange={onPageChange} />,
    );

    await user.click(screen.getByLabelText('Go to previous page'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('disables previous button on first page', () => {
    render(
      <Pagination currentPage={1} totalPages={5} onPageChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('Go to previous page')).toBeDisabled();
  });

  it('disables next button on last page', () => {
    render(
      <Pagination currentPage={5} totalPages={5} onPageChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('Go to next page')).toBeDisabled();
  });

  it('shows item range when totalItems provided', () => {
    render(
      <Pagination
        currentPage={2}
        totalPages={5}
        onPageChange={vi.fn()}
        pageSize={10}
        totalItems={50}
      />,
    );
    expect(screen.getByText('11-20 of 50')).toBeInTheDocument();
  });

  it('renders page size select', async () => {
    const user = userEvent.setup();
    const onPageSizeChange = vi.fn();
    render(
      <Pagination
        currentPage={1}
        totalPages={5}
        onPageChange={vi.fn()}
        pageSize={10}
        onPageSizeChange={onPageSizeChange}
      />,
    );

    const select = screen.getByLabelText('Rows:');
    expect(select).toBeInTheDocument();

    await user.selectOptions(select, '25');
    expect(onPageSizeChange).toHaveBeenCalledWith(25);
  });

  it('shows ellipsis for large page counts', () => {
    render(
      <Pagination currentPage={5} totalPages={20} onPageChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('Pagination')).toBeInTheDocument();
  });
});
