import { useState, useCallback } from 'react';
import {
  useQuestions,
  useDeleteQuestion,
  useDuplicateQuestion,
  useToggleQuestionFavorite,
} from '@/api/hooks/use-questions';
import { useNavigate } from '@/router';
import { useToast } from '@/components/common/toast';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useDebounce } from '@/hooks/use-debounce';
import { PageHeader } from '@/components/common/page-header';
import { SearchInput } from '@/components/common/search-input';
import { Pagination } from '@/components/common/pagination';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { ListPageSkeleton } from '@/components/common/skeleton';
import { cn } from '@/lib/utils';
import { formatRelativeTime, truncate } from '@/lib/utils';
import { PAGINATION, CHART_TYPE_LABELS } from '@/lib/constants';
import type { QuestionResponse, PaginatedRequest } from '@/api/types';

export function QuestionListPage() {
  useDocumentTitle('Questions');

  const navigate = useNavigate();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(PAGINATION.DEFAULT_PAGE);
  const [sortBy, setSortBy] = useState<string>('updatedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [deleteTarget, setDeleteTarget] = useState<QuestionResponse | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  const params: PaginatedRequest = {
    page,
    pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
    search: debouncedSearch || undefined,
    sortBy,
    sortDirection,
  };

  const { data, isLoading, isError, error, refetch } = useQuestions(params);
  const deleteMutation = useDeleteQuestion();
  const duplicateMutation = useDuplicateQuestion();
  const favoriteMutation = useToggleQuestionFavorite();

  const handleDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success('Question deleted');
        setDeleteTarget(null);
      },
      onError: (err) => toast.error('Failed to delete', err.message),
    });
  }, [deleteTarget, deleteMutation, toast]);

  const handleDuplicate = useCallback(
    (id: string) => {
      duplicateMutation.mutate(id, {
        onSuccess: () => toast.success('Question duplicated'),
        onError: (err) => toast.error('Failed to duplicate', err.message),
      });
    },
    [duplicateMutation, toast],
  );

  const handleToggleFavorite = useCallback(
    (id: string, current: boolean) => {
      favoriteMutation.mutate({ id, isFavorite: !current });
    },
    [favoriteMutation],
  );

  return (
    <div>
      <PageHeader
        title="Questions"
        description="Create and manage your data questions"
        actions={
          <button
            onClick={() => navigate({ to: '/questions/new' })}
            className="btn btn-primary"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            New Question
          </button>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <SearchInput
          value={search}
          onChange={(val) => { setSearch(val); setPage(1); }}
          placeholder="Search questions..."
        />
        <div className="flex items-center gap-2 ml-auto">
          <select
            value={`${sortBy}:${sortDirection}`}
            onChange={(e) => {
              const [field, dir] = e.target.value.split(':');
              setSortBy(field);
              setSortDirection(dir as 'asc' | 'desc');
            }}
            className="input text-sm"
            style={{ width: 'auto' }}
          >
            <option value="updatedAt:desc">Recently updated</option>
            <option value="createdAt:desc">Newest first</option>
            <option value="createdAt:asc">Oldest first</option>
            <option value="name:asc">Name A-Z</option>
            <option value="name:desc">Name Z-A</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <ListPageSkeleton rows={8} columns={5} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          icon={
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          }
          title={debouncedSearch ? 'No questions found' : 'No questions yet'}
          description={
            debouncedSearch
              ? 'Try adjusting your search term'
              : 'Create your first question to start querying data'
          }
          action={
            !debouncedSearch && (
              <button
                onClick={() => navigate({ to: '/questions/new' })}
                className="btn btn-primary"
              >
                Create Question
              </button>
            )
          }
        />
      ) : (
        <>
          {/* Questions table */}
          <div className="card p-0 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider hidden md:table-cell" style={{ color: 'var(--color-text-secondary)' }}>
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider hidden lg:table-cell" style={{ color: 'var(--color-text-secondary)' }}>
                    Visualization
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider hidden md:table-cell" style={{ color: 'var(--color-text-secondary)' }}>
                    Data Source
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider hidden lg:table-cell" style={{ color: 'var(--color-text-secondary)' }}>
                    Updated
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((question) => (
                  <QuestionRow
                    key={question.id}
                    question={question}
                    onView={() => navigate({ to: '/questions/$id', params: { id: question.id } })}
                    onEdit={() => navigate({ to: '/questions/$id/edit', params: { id: question.id } })}
                    onDuplicate={() => handleDuplicate(question.id)}
                    onDelete={() => setDeleteTarget(question)}
                    onToggleFavorite={() => handleToggleFavorite(question.id, !!question.isFavorite)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex justify-center mt-6">
              <Pagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
            </div>
          )}
        </>
      )}

      {/* Delete dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Question"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This will also remove it from any dashboards.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

// ── Question Row ─────────────────────────────────────────────────────

interface QuestionRowProps {
  question: QuestionResponse;
  onView: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}

function QuestionRow({
  question,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleFavorite,
}: QuestionRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <tr
      className="group cursor-pointer transition-colors hover:bg-[var(--color-surface-hover)]"
      style={{ borderBottom: '1px solid var(--color-border-light)' }}
      onClick={onView}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            className="flex-shrink-0"
            style={{ color: question.isFavorite ? '#f59e0b' : 'var(--color-text-tertiary)' }}
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill={question.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.5}>
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </button>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
              {question.name}
            </p>
            {question.description && (
              <p className="text-xs truncate mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                {truncate(question.description, 60)}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        <span
          className={cn(
            'badge',
            question.type === 'sql' ? 'badge-info' : 'badge-success',
          )}
        >
          {question.type === 'sql' ? 'SQL' : 'Visual'}
        </span>
      </td>
      <td className="px-4 py-3 text-sm hidden lg:table-cell" style={{ color: 'var(--color-text-secondary)' }}>
        {CHART_TYPE_LABELS[question.visualization.type] ?? question.visualization.type}
      </td>
      <td className="px-4 py-3 text-sm hidden md:table-cell" style={{ color: 'var(--color-text-secondary)' }}>
        {question.dataSourceName ?? '-'}
      </td>
      <td className="px-4 py-3 text-sm hidden lg:table-cell" style={{ color: 'var(--color-text-tertiary)' }}>
        {formatRelativeTime(question.updatedAt)}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="relative inline-block">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="btn btn-ghost btn-icon btn-sm opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM8.5 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM15.5 8.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
            </svg>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
              <div
                className="absolute right-0 top-full mt-1 w-36 rounded-lg py-1 shadow-lg z-20"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(); }}
                  className="w-full px-3 py-1.5 text-sm text-left hover:bg-[var(--color-bg-tertiary)]"
                  style={{ color: 'var(--color-text)' }}
                >
                  Edit
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDuplicate(); }}
                  className="w-full px-3 py-1.5 text-sm text-left hover:bg-[var(--color-bg-tertiary)]"
                  style={{ color: 'var(--color-text)' }}
                >
                  Duplicate
                </button>
                <div className="border-t my-1" style={{ borderColor: 'var(--color-border)' }} />
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                  className="w-full px-3 py-1.5 text-sm text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
