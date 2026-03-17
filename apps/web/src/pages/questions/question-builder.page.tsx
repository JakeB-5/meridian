import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  useQuestion,
  useCreateQuestion,
  useUpdateQuestion,
  useExecuteQuestion,
} from '@/api/hooks/use-questions';
import { useAllDatasources } from '@/api/hooks/use-datasources';
import { useParams, useNavigate } from '@/router';
import { useToast } from '@/components/common/toast';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState } from '@/components/common/error-state';
import { PageLoading, LoadingSpinner } from '@/components/common/loading-spinner';
import { Tabs, TabPanel } from '@/components/common/tabs';
import { Select } from '@/components/common/select';
import { VisualBuilder } from '@/components/query-builder/visual-builder';
import { SqlEditor } from '@/components/query-builder/sql-editor';
import { ResultTable } from '@/components/query-builder/result-table';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils';
import { CHART_TYPE_LABELS } from '@/lib/constants';
import type {
  VisualQuery,
  VisualizationConfig,
  QueryResult,
  ChartType,
  CreateQuestionRequest,
  UpdateQuestionRequest,
} from '@/api/types';

// ── Default values ───────────────────────────────────────────────────

const defaultVisualQuery: VisualQuery = {
  dataSourceId: '',
  table: '',
  columns: [],
  filters: [],
  sorts: [],
  aggregations: [],
  groupBy: [],
  limit: 1000,
};

const defaultVisualization: VisualizationConfig = {
  type: 'table',
  tooltip: true,
  legend: { show: true, position: 'bottom' },
};

// ── Component ────────────────────────────────────────────────────────

export function QuestionBuilderPage() {
  const params = useParams({ strict: false });
  const questionId = (params as { id?: string }).id;
  const isNew = !questionId;
  const isEdit = !!questionId;

  const navigate = useNavigate();
  const toast = useToast();

  // Fetch existing question data
  const {
    data: existingQuestion,
    isLoading: isLoadingQuestion,
    isError: isQuestionError,
    error: questionError,
  } = useQuestion(questionId ?? '');

  const { data: datasources } = useAllDatasources();

  const createMutation = useCreateQuestion();
  const updateMutation = useUpdateQuestion(questionId ?? '');
  const executeMutation = useExecuteQuestion();

  // Local state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [queryType, setQueryType] = useState<'visual' | 'sql'>('visual');
  const [dataSourceId, setDataSourceId] = useState('');
  const [visualQuery, setVisualQuery] = useState<VisualQuery>(defaultVisualQuery);
  const [sqlQuery, setSqlQuery] = useState('');
  const [visualization, setVisualization] = useState<VisualizationConfig>(defaultVisualization);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [activeTab, setActiveTab] = useState<string>('query');

  useDocumentTitle(isNew ? 'New Question' : (existingQuestion?.name ?? 'Question'));

  // Initialize from existing question
  useEffect(() => {
    if (existingQuestion) {
      setName(existingQuestion.name);
      setDescription(existingQuestion.description ?? '');
      setQueryType(existingQuestion.type);
      setDataSourceId(existingQuestion.dataSourceId);
      setVisualization(existingQuestion.visualization);

      if (existingQuestion.type === 'visual' && typeof existingQuestion.query === 'object') {
        setVisualQuery(existingQuestion.query);
      } else if (existingQuestion.type === 'sql' && typeof existingQuestion.query === 'string') {
        setSqlQuery(existingQuestion.query);
      }
    }
  }, [existingQuestion]);

  // Update visual query data source ID when dataSourceId changes
  useEffect(() => {
    if (queryType === 'visual') {
      setVisualQuery((prev) => ({ ...prev, dataSourceId }));
    }
  }, [dataSourceId, queryType]);

  const handleExecute = useCallback(() => {
    if (!dataSourceId) {
      toast.warning('Please select a data source');
      return;
    }

    const query = queryType === 'visual' ? visualQuery : sqlQuery;

    if (queryType === 'sql' && !sqlQuery.trim()) {
      toast.warning('Please enter a SQL query');
      return;
    }

    if (queryType === 'visual' && !visualQuery.table) {
      toast.warning('Please select a table');
      return;
    }

    executeMutation.mutate(
      {
        questionId: questionId ?? undefined,
        type: queryType,
        dataSourceId,
        query,
      },
      {
        onSuccess: (queryResult) => {
          setResult(queryResult);
          setActiveTab('results');
          toast.success(
            `Query completed in ${formatDuration(queryResult.executionTimeMs)}`,
            `${queryResult.rowCount} rows returned${queryResult.truncated ? ' (truncated)' : ''}`,
          );
        },
        onError: (err) => {
          toast.error('Query failed', err.message);
        },
      },
    );
  }, [dataSourceId, queryType, visualQuery, sqlQuery, questionId, executeMutation, toast]);

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      toast.warning('Please enter a question name');
      return;
    }
    if (!dataSourceId) {
      toast.warning('Please select a data source');
      return;
    }

    const query = queryType === 'visual' ? visualQuery : sqlQuery;
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      type: queryType,
      dataSourceId,
      query,
      visualization,
    };

    if (isNew) {
      createMutation.mutate(payload as CreateQuestionRequest, {
        onSuccess: (created) => {
          toast.success('Question saved');
          navigate({ to: '/questions/$id', params: { id: created.id } });
        },
        onError: (err) => toast.error('Failed to save', err.message),
      });
    } else {
      updateMutation.mutate(payload as UpdateQuestionRequest, {
        onSuccess: () => toast.success('Question updated'),
        onError: (err) => toast.error('Failed to update', err.message),
      });
    }
  }, [name, description, queryType, dataSourceId, visualQuery, sqlQuery, visualization, isNew, createMutation, updateMutation, navigate, toast]);

  if (!isNew && isLoadingQuestion) {
    return <PageLoading message="Loading question..." />;
  }

  if (!isNew && isQuestionError) {
    return <ErrorState error={questionError} />;
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isExecuting = executeMutation.isPending;

  const datasourceOptions = (datasources ?? []).map((ds) => ({
    value: ds.id,
    label: `${ds.name} (${ds.type})`,
  }));

  const chartTypeOptions = Object.entries(CHART_TYPE_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const queryTabs = [
    { id: 'query', label: queryType === 'visual' ? 'Visual Builder' : 'SQL Editor' },
    { id: 'results', label: `Results${result ? ` (${result.rowCount})` : ''}` },
    { id: 'visualization', label: 'Visualization' },
  ];

  return (
    <div>
      <PageHeader
        title={isNew ? 'New Question' : 'Edit Question'}
        breadcrumbs={[
          { label: 'Questions', href: '/questions' },
          { label: isNew ? 'New' : (existingQuestion?.name ?? 'Edit') },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => navigate({ to: '/questions' })} className="btn btn-secondary btn-sm">
              Cancel
            </button>
            <button onClick={handleExecute} disabled={isExecuting} className="btn btn-secondary btn-sm">
              {isExecuting ? (
                <>
                  <LoadingSpinner size="sm" />
                  Running...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                  </svg>
                  Run
                </>
              )}
            </button>
            <button onClick={handleSave} disabled={isSaving} className="btn btn-primary btn-sm">
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        }
      />

      {/* Question metadata */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="md:col-span-2">
          <label htmlFor="q-name" className="label">Name</label>
          <input
            id="q-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="e.g. Monthly Revenue by Region"
          />
        </div>
        <div>
          <label htmlFor="q-ds" className="label">Data Source</label>
          <Select
            id="q-ds"
            value={dataSourceId}
            onChange={setDataSourceId}
            options={datasourceOptions}
            placeholder="Select data source..."
          />
        </div>
        <div>
          <label className="label">Query Type</label>
          <div className="flex gap-2">
            <button
              onClick={() => setQueryType('visual')}
              className={cn('btn btn-sm flex-1', queryType === 'visual' ? 'btn-primary' : 'btn-secondary')}
            >
              Visual
            </button>
            <button
              onClick={() => setQueryType('sql')}
              className={cn('btn btn-sm flex-1', queryType === 'sql' ? 'btn-primary' : 'btn-secondary')}
            >
              SQL
            </button>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="mb-6">
        <label htmlFor="q-desc" className="label">Description (optional)</label>
        <input
          id="q-desc"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input"
          placeholder="Describe what this question answers..."
        />
      </div>

      {/* Tabs */}
      <Tabs tabs={queryTabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Query Tab */}
      {activeTab === 'query' && (
        <TabPanel>
          {queryType === 'visual' ? (
            <VisualBuilder
              dataSourceId={dataSourceId}
              query={visualQuery}
              onChange={setVisualQuery}
            />
          ) : (
            <SqlEditor
              value={sqlQuery}
              onChange={setSqlQuery}
              onExecute={handleExecute}
              isExecuting={isExecuting}
            />
          )}
        </TabPanel>
      )}

      {/* Results Tab */}
      {activeTab === 'results' && (
        <TabPanel>
          {result ? (
            <ResultTable result={result} />
          ) : (
            <div className="text-center py-16">
              <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                No results yet. Run the query to see results.
              </p>
              <button onClick={handleExecute} disabled={isExecuting} className="btn btn-primary">
                Run Query
              </button>
            </div>
          )}
        </TabPanel>
      )}

      {/* Visualization Tab */}
      {activeTab === 'visualization' && (
        <TabPanel>
          <VisualizationConfigPanel
            config={visualization}
            onChange={setVisualization}
            result={result}
            chartTypeOptions={chartTypeOptions}
          />
        </TabPanel>
      )}
    </div>
  );
}

// ── Visualization Config Panel ───────────────────────────────────────

interface VisualizationConfigPanelProps {
  config: VisualizationConfig;
  onChange: (config: VisualizationConfig) => void;
  result: QueryResult | null;
  chartTypeOptions: Array<{ value: string; label: string }>;
}

function VisualizationConfigPanel({
  config,
  onChange,
  result,
  chartTypeOptions,
}: VisualizationConfigPanelProps) {
  const columns = result?.columns.map((c) => c.name) ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Config form */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          Chart Settings
        </h3>

        {/* Chart type */}
        <div>
          <label className="label">Chart Type</label>
          <div className="grid grid-cols-4 gap-2">
            {(['table', 'bar', 'line', 'area', 'pie', 'donut', 'scatter', 'number'] as ChartType[]).map((type) => (
              <button
                key={type}
                onClick={() => onChange({ ...config, type })}
                className={cn(
                  'px-2 py-2 rounded-lg text-xs font-medium border transition-colors',
                  config.type === type
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary)]',
                )}
                style={{
                  color: config.type === type ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                }}
              >
                {CHART_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label htmlFor="viz-title" className="label">Title</label>
          <input
            id="viz-title"
            type="text"
            value={config.title ?? ''}
            onChange={(e) => onChange({ ...config, title: e.target.value || undefined })}
            className="input"
            placeholder="Chart title (optional)"
          />
        </div>

        {/* X-axis */}
        {!['table', 'number', 'pie', 'donut'].includes(config.type) && (
          <div>
            <label htmlFor="viz-x" className="label">X-Axis</label>
            <Select
              id="viz-x"
              value={config.xAxis?.label ?? ''}
              onChange={(val) => onChange({ ...config, xAxis: { ...config.xAxis, label: val } })}
              options={columns.map((c) => ({ value: c, label: c }))}
              placeholder="Select column..."
            />
          </div>
        )}

        {/* Y-axis */}
        {!['table', 'number', 'pie', 'donut'].includes(config.type) && (
          <div>
            <label htmlFor="viz-y" className="label">Y-Axis</label>
            <Select
              id="viz-y"
              value={config.yAxis?.label ?? ''}
              onChange={(val) => onChange({ ...config, yAxis: { ...config.yAxis, label: val } })}
              options={columns.map((c) => ({ value: c, label: c }))}
              placeholder="Select column..."
            />
          </div>
        )}

        {/* Stacked toggle */}
        {['bar', 'area', 'line'].includes(config.type) && (
          <div className="flex items-center gap-2">
            <input
              id="viz-stacked"
              type="checkbox"
              checked={config.stacked ?? false}
              onChange={(e) => onChange({ ...config, stacked: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="viz-stacked" className="text-sm" style={{ color: 'var(--color-text)' }}>
              Stacked
            </label>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-2">
          <input
            id="viz-legend"
            type="checkbox"
            checked={config.legend?.show ?? true}
            onChange={(e) =>
              onChange({
                ...config,
                legend: { ...config.legend, show: e.target.checked, position: config.legend?.position ?? 'bottom' },
              })
            }
            className="h-4 w-4 rounded border-gray-300"
          />
          <label htmlFor="viz-legend" className="text-sm" style={{ color: 'var(--color-text)' }}>
            Show Legend
          </label>
        </div>
      </div>

      {/* Preview */}
      <div>
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
          Preview
        </h3>
        <div
          className="rounded-xl p-4 min-h-[300px] flex items-center justify-center"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
          }}
        >
          {result ? (
            <div className="w-full h-full">
              <p className="text-sm text-center mb-4" style={{ color: 'var(--color-text)' }}>
                {config.title ?? CHART_TYPE_LABELS[config.type]}
              </p>
              {config.type === 'table' ? (
                <ResultTable result={result} compact />
              ) : config.type === 'number' ? (
                <div className="text-center">
                  <p className="text-5xl font-bold" style={{ color: 'var(--color-primary)' }}>
                    {result.rows[0]
                      ? (() => { const v = Object.values(result.rows[0])[0]; return typeof v === 'number' ? v.toLocaleString() : String(v ?? '-'); })()
                      : '-'}
                  </p>
                  <p className="text-sm mt-2" style={{ color: 'var(--color-text-secondary)' }}>
                    {result.columns[0]?.name ?? ''}
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-center h-48">
                  <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                    {CHART_TYPE_LABELS[config.type]} chart preview
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                    (ECharts rendering via @meridian/viz)
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              Run a query to see the visualization preview
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
