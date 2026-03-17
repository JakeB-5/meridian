import { useState, useCallback, useMemo } from 'react';
import { useDatasourceSchema } from '@/api/hooks/use-datasources';
import { Select } from '@/components/common/select';
import { cn } from '@/lib/utils';
import { AGGREGATION_LABELS, FILTER_OPERATOR_LABELS } from '@/lib/constants';
import type {
  VisualQuery,
  FilterClause,
  SortClause,
  AggregationClause,
  FilterOperator,
  AggregationType,
  SortDirection,
} from '@meridian/shared';

interface VisualBuilderProps {
  dataSourceId: string;
  query: VisualQuery;
  onChange: (query: VisualQuery) => void;
}

export function VisualBuilder({ dataSourceId, query, onChange }: VisualBuilderProps) {
  const { data: schemas, isLoading: isLoadingSchema } = useDatasourceSchema(dataSourceId);

  // Flatten all tables from all schemas
  const allTables = useMemo(() => {
    if (!schemas) return [];
    return schemas.flatMap((schema) =>
      schema.tables.map((table) => ({
        name: table.name,
        schema: table.schema,
        fullName: schema.name !== 'public' ? `${schema.name}.${table.name}` : table.name,
        columns: table.columns,
        rowCount: table.rowCount,
      })),
    );
  }, [schemas]);

  const selectedTable = useMemo(
    () => allTables.find((t) => t.fullName === query.table || t.name === query.table),
    [allTables, query.table],
  );

  const columnNames = useMemo(
    () => selectedTable?.columns.map((c) => c.name) ?? [],
    [selectedTable],
  );

  const tableOptions = allTables.map((t) => ({
    value: t.fullName,
    label: `${t.fullName}${t.rowCount !== undefined ? ` (~${t.rowCount} rows)` : ''}`,
  }));

  const columnOptions = columnNames.map((c) => ({ value: c, label: c }));

  if (!dataSourceId) {
    return (
      <div className="text-center py-12">
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Select a data source to start building your query
        </p>
      </div>
    );
  }

  if (isLoadingSchema) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Table selector */}
      <Section title="Table">
        <Select
          value={query.table}
          onChange={(table) =>
            onChange({ ...query, table, columns: [], filters: [], sorts: [], aggregations: [], groupBy: [] })
          }
          options={tableOptions}
          placeholder="Select a table..."
        />
      </Section>

      {selectedTable && (
        <>
          {/* Column picker */}
          <Section title="Columns">
            <div className="flex flex-wrap gap-2">
              {columnNames.map((col) => {
                const isSelected = query.columns.includes(col);
                const colMeta = selectedTable.columns.find((c) => c.name === col);
                return (
                  <button
                    key={col}
                    onClick={() => {
                      const columns = isSelected
                        ? query.columns.filter((c) => c !== col)
                        : [...query.columns, col];
                      onChange({ ...query, columns });
                    }}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                      isSelected
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                        : 'border-[var(--color-border)] hover:border-[var(--color-primary)]',
                    )}
                    style={{
                      color: isSelected ? 'var(--color-primary)' : 'var(--color-text)',
                    }}
                    title={colMeta ? `${col} (${colMeta.type}${colMeta.nullable ? ', nullable' : ''})` : col}
                  >
                    {col}
                    <span className="text-xs ml-1 opacity-60">
                      {colMeta?.type ?? ''}
                    </span>
                  </button>
                );
              })}
            </div>
            {query.columns.length === 0 && (
              <p className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
                No columns selected (all columns will be included)
              </p>
            )}
          </Section>

          {/* Filters */}
          <Section
            title="Filters"
            action={
              <button
                onClick={() => {
                  const newFilter: FilterClause = {
                    column: columnNames[0] ?? '',
                    operator: 'eq',
                    value: '',
                  };
                  onChange({ ...query, filters: [...query.filters, newFilter] });
                }}
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--color-primary)' }}
              >
                + Add Filter
              </button>
            }
          >
            {query.filters.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                No filters applied
              </p>
            ) : (
              <div className="space-y-2">
                {query.filters.map((filter, index) => (
                  <FilterRow
                    key={index}
                    filter={filter}
                    columns={columnOptions}
                    onChange={(updated) => {
                      const filters = [...query.filters];
                      filters[index] = updated;
                      onChange({ ...query, filters });
                    }}
                    onRemove={() => {
                      onChange({
                        ...query,
                        filters: query.filters.filter((_, i) => i !== index),
                      });
                    }}
                  />
                ))}
              </div>
            )}
          </Section>

          {/* Aggregations */}
          <Section
            title="Aggregations"
            action={
              <button
                onClick={() => {
                  const newAgg: AggregationClause = {
                    column: columnNames[0] ?? '',
                    aggregation: 'count',
                  };
                  onChange({ ...query, aggregations: [...query.aggregations, newAgg] });
                }}
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--color-primary)' }}
              >
                + Add Aggregation
              </button>
            }
          >
            {query.aggregations.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                No aggregations (raw data)
              </p>
            ) : (
              <div className="space-y-2">
                {query.aggregations.map((agg, index) => (
                  <AggregationRow
                    key={index}
                    agg={agg}
                    columns={columnOptions}
                    onChange={(updated) => {
                      const aggregations = [...query.aggregations];
                      aggregations[index] = updated;
                      onChange({ ...query, aggregations });
                    }}
                    onRemove={() => {
                      onChange({
                        ...query,
                        aggregations: query.aggregations.filter((_, i) => i !== index),
                      });
                    }}
                  />
                ))}
              </div>
            )}
          </Section>

          {/* Group By */}
          {query.aggregations.length > 0 && (
            <Section title="Group By">
              <div className="flex flex-wrap gap-2">
                {columnNames.map((col) => {
                  const isSelected = query.groupBy.includes(col);
                  return (
                    <button
                      key={col}
                      onClick={() => {
                        const groupBy = isSelected
                          ? query.groupBy.filter((c) => c !== col)
                          : [...query.groupBy, col];
                        onChange({ ...query, groupBy });
                      }}
                      className={cn(
                        'px-3 py-1 rounded-lg text-xs border transition-colors',
                        isSelected
                          ? 'border-[var(--color-secondary)] bg-purple-50 dark:bg-purple-900/20'
                          : 'border-[var(--color-border)] hover:border-[var(--color-secondary)]',
                      )}
                      style={{
                        color: isSelected ? 'var(--color-secondary)' : 'var(--color-text-secondary)',
                      }}
                    >
                      {col}
                    </button>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Sorts */}
          <Section
            title="Sort"
            action={
              <button
                onClick={() => {
                  const newSort: SortClause = {
                    column: columnNames[0] ?? '',
                    direction: 'asc',
                  };
                  onChange({ ...query, sorts: [...query.sorts, newSort] });
                }}
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--color-primary)' }}
              >
                + Add Sort
              </button>
            }
          >
            {query.sorts.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                Default ordering
              </p>
            ) : (
              <div className="space-y-2">
                {query.sorts.map((sort, index) => (
                  <SortRow
                    key={index}
                    sort={sort}
                    columns={columnOptions}
                    onChange={(updated) => {
                      const sorts = [...query.sorts];
                      sorts[index] = updated;
                      onChange({ ...query, sorts });
                    }}
                    onRemove={() => {
                      onChange({
                        ...query,
                        sorts: query.sorts.filter((_, i) => i !== index),
                      });
                    }}
                  />
                ))}
              </div>
            )}
          </Section>

          {/* Limit */}
          <Section title="Limit">
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={query.limit ?? ''}
                onChange={(e) => {
                  const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                  onChange({ ...query, limit: val });
                }}
                className="input"
                placeholder="No limit"
                style={{ maxWidth: '150px' }}
                min={1}
                max={100000}
              />
              <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                rows
              </span>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          {title}
        </h4>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── Filter Row ───────────────────────────────────────────────────────

const filterOperators: Array<{ value: FilterOperator; label: string }> = Object.entries(
  FILTER_OPERATOR_LABELS,
).map(([value, label]) => ({ value: value as FilterOperator, label }));

function FilterRow({
  filter,
  columns,
  onChange,
  onRemove,
}: {
  filter: FilterClause;
  columns: Array<{ value: string; label: string }>;
  onChange: (filter: FilterClause) => void;
  onRemove: () => void;
}) {
  const needsValue = !['is_null', 'is_not_null'].includes(filter.operator);

  return (
    <div className="flex items-center gap-2">
      <Select
        value={filter.column}
        onChange={(column) => onChange({ ...filter, column })}
        options={columns}
        placeholder="Column"
      />
      <Select
        value={filter.operator}
        onChange={(op) => onChange({ ...filter, operator: op as FilterOperator })}
        options={filterOperators}
        placeholder="Operator"
      />
      {needsValue && (
        <input
          type="text"
          value={String(filter.value ?? '')}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
          className="input"
          placeholder="Value"
        />
      )}
      <button onClick={onRemove} className="btn btn-ghost btn-icon btn-sm text-red-500 flex-shrink-0">
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  );
}

// ── Aggregation Row ──────────────────────────────────────────────────

const aggregationOptions: Array<{ value: AggregationType; label: string }> = Object.entries(
  AGGREGATION_LABELS,
).map(([value, label]) => ({ value: value as AggregationType, label }));

function AggregationRow({
  agg,
  columns,
  onChange,
  onRemove,
}: {
  agg: AggregationClause;
  columns: Array<{ value: string; label: string }>;
  onChange: (agg: AggregationClause) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Select
        value={agg.aggregation}
        onChange={(aggregation) => onChange({ ...agg, aggregation: aggregation as AggregationType })}
        options={aggregationOptions}
        placeholder="Function"
      />
      <Select
        value={agg.column}
        onChange={(column) => onChange({ ...agg, column })}
        options={agg.aggregation === 'count' ? [{ value: '*', label: '* (all)' }, ...columns] : columns}
        placeholder="Column"
      />
      <input
        type="text"
        value={agg.alias ?? ''}
        onChange={(e) => onChange({ ...agg, alias: e.target.value || undefined })}
        className="input"
        placeholder="Alias (optional)"
        style={{ maxWidth: '150px' }}
      />
      <button onClick={onRemove} className="btn btn-ghost btn-icon btn-sm text-red-500 flex-shrink-0">
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  );
}

// ── Sort Row ─────────────────────────────────────────────────────────

function SortRow({
  sort,
  columns,
  onChange,
  onRemove,
}: {
  sort: SortClause;
  columns: Array<{ value: string; label: string }>;
  onChange: (sort: SortClause) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Select
        value={sort.column}
        onChange={(column) => onChange({ ...sort, column })}
        options={columns}
        placeholder="Column"
      />
      <Select
        value={sort.direction}
        onChange={(direction) => onChange({ ...sort, direction: direction as SortDirection })}
        options={[
          { value: 'asc', label: 'Ascending' },
          { value: 'desc', label: 'Descending' },
        ]}
      />
      <button onClick={onRemove} className="btn btn-ghost btn-icon btn-sm text-red-500 flex-shrink-0">
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  );
}
