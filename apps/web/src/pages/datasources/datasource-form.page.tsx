import { useState, useCallback, useMemo } from 'react';
import { useCreateDatasource, useTestConnection } from '@/api/hooks/use-datasources';
import { useNavigate } from '@/router';
import { useToast } from '@/components/common/toast';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { PageHeader } from '@/components/common/page-header';
import { Select } from '@/components/common/select';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils';
import {
  DATABASE_TYPE_LABELS,
  DATABASE_DEFAULT_PORTS,
} from '@/lib/constants';
import type { DatabaseType } from '@meridian/shared';
import type { CreateDataSourceRequest, ConnectionTestResult } from '@/api/types';

// ── Field definitions per database type ──────────────────────────────

interface FieldDef {
  name: string;
  label: string;
  type: 'text' | 'number' | 'password' | 'checkbox';
  placeholder?: string;
  required?: boolean;
  defaultValue?: string | number | boolean;
}

const commonFields: FieldDef[] = [
  { name: 'name', label: 'Display Name', type: 'text', placeholder: 'My Production Database', required: true },
];

const hostBasedFields: FieldDef[] = [
  { name: 'host', label: 'Host', type: 'text', placeholder: 'localhost', required: true },
  { name: 'port', label: 'Port', type: 'number', required: true },
  { name: 'database', label: 'Database', type: 'text', placeholder: 'mydb', required: true },
  { name: 'username', label: 'Username', type: 'text', placeholder: 'postgres' },
  { name: 'password', label: 'Password', type: 'password', placeholder: 'Enter password' },
  { name: 'ssl', label: 'Use SSL', type: 'checkbox', defaultValue: false },
];

const sqliteFields: FieldDef[] = [
  { name: 'database', label: 'Database Path', type: 'text', placeholder: '/path/to/db.sqlite', required: true },
];

const bigqueryFields: FieldDef[] = [
  { name: 'database', label: 'Project ID', type: 'text', placeholder: 'my-gcp-project', required: true },
];

const duckdbFields: FieldDef[] = [
  { name: 'database', label: 'Database Path', type: 'text', placeholder: '/path/to/db.duckdb or :memory:', required: true },
];

function getFieldsForType(type: DatabaseType): FieldDef[] {
  switch (type) {
    case 'sqlite': return [...commonFields, ...sqliteFields];
    case 'bigquery': return [...commonFields, ...bigqueryFields];
    case 'duckdb': return [...commonFields, ...duckdbFields];
    default: return [...commonFields, ...hostBasedFields];
  }
}

// ── Component ────────────────────────────────────────────────────────

export function DatasourceFormPage() {
  useDocumentTitle('Add Data Source');

  const navigate = useNavigate();
  const toast = useToast();
  const createMutation = useCreateDatasource();
  const testMutation = useTestConnection();

  const [dbType, setDbType] = useState<DatabaseType>('postgresql');
  const [formData, setFormData] = useState<Record<string, string | number | boolean>>({
    name: '',
    host: 'localhost',
    port: DATABASE_DEFAULT_PORTS['postgresql'] ?? 5432,
    database: '',
    username: '',
    password: '',
    ssl: false,
  });
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  const fields = useMemo(() => getFieldsForType(dbType), [dbType]);

  const handleTypeChange = useCallback(
    (type: string) => {
      const newType = type as DatabaseType;
      setDbType(newType);
      setTestResult(null);

      // Reset port to default for new type
      const defaultPort = DATABASE_DEFAULT_PORTS[newType];
      setFormData((prev) => ({
        ...prev,
        port: defaultPort ?? '',
        host: newType === 'sqlite' || newType === 'duckdb' || newType === 'bigquery' ? '' : (prev.host || 'localhost'),
      }));
    },
    [],
  );

  const updateField = useCallback((name: string, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setTestResult(null); // Clear test result when form changes
  }, []);

  const handleTest = useCallback(() => {
    testMutation.mutate(
      {
        type: dbType,
        host: formData.host as string || undefined,
        port: formData.port ? Number(formData.port) : undefined,
        database: formData.database as string,
        username: formData.username as string || undefined,
        password: formData.password as string || undefined,
        ssl: formData.ssl as boolean || undefined,
      },
      {
        onSuccess: (result) => {
          setTestResult(result);
          if (result.success) {
            toast.success('Connection successful', `Latency: ${formatDuration(result.latencyMs)}`);
          } else {
            toast.error('Connection failed', result.message);
          }
        },
        onError: (err) => {
          setTestResult({ success: false, message: err.message, latencyMs: 0 });
          toast.error('Connection test failed', err.message);
        },
      },
    );
  }, [dbType, formData, testMutation, toast]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      if (!formData.name) {
        toast.warning('Please enter a display name');
        return;
      }
      if (!formData.database) {
        toast.warning('Please enter a database name');
        return;
      }

      const payload: CreateDataSourceRequest = {
        name: formData.name as string,
        type: dbType,
        host: (formData.host as string) || undefined,
        port: formData.port ? Number(formData.port) : undefined,
        database: formData.database as string,
        username: (formData.username as string) || undefined,
        password: (formData.password as string) || undefined,
        ssl: (formData.ssl as boolean) || undefined,
      };

      createMutation.mutate(payload, {
        onSuccess: (created) => {
          toast.success('Data source created');
          navigate({ to: '/datasources/$id', params: { id: created.id } });
        },
        onError: (err) => toast.error('Failed to create data source', err.message),
      });
    },
    [formData, dbType, createMutation, navigate, toast],
  );

  const typeOptions = Object.entries(DATABASE_TYPE_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  return (
    <div>
      <PageHeader
        title="Add Data Source"
        description="Connect to a database to start querying data"
        breadcrumbs={[
          { label: 'Data Sources', href: '/datasources' },
          { label: 'New' },
        ]}
      />

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Database type selector */}
          <div>
            <label className="label">Database Type</label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {typeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleTypeChange(opt.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 p-3 rounded-lg border text-sm transition-all',
                    dbType === opt.value
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] font-medium'
                      : 'border-[var(--color-border)] hover:border-[var(--color-primary)]',
                  )}
                  style={{
                    color: dbType === opt.value ? 'var(--color-primary)' : 'var(--color-text)',
                  }}
                >
                  <span className="text-lg font-bold opacity-60">
                    {getDatabaseIcon(opt.value)}
                  </span>
                  <span className="text-xs">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic fields */}
          {fields.map((field) => (
            <div key={field.name}>
              {field.type === 'checkbox' ? (
                <div className="flex items-center gap-2">
                  <input
                    id={`ds-${field.name}`}
                    type="checkbox"
                    checked={!!formData[field.name]}
                    onChange={(e) => updateField(field.name, e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <label htmlFor={`ds-${field.name}`} className="text-sm" style={{ color: 'var(--color-text)' }}>
                    {field.label}
                  </label>
                </div>
              ) : (
                <>
                  <label htmlFor={`ds-${field.name}`} className="label">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <input
                    id={`ds-${field.name}`}
                    type={field.type}
                    value={formData[field.name] as string ?? field.defaultValue ?? ''}
                    onChange={(e) => updateField(
                      field.name,
                      field.type === 'number' ? parseInt(e.target.value, 10) || '' : e.target.value,
                    )}
                    className="input"
                    placeholder={field.placeholder}
                    required={field.required}
                    disabled={createMutation.isPending}
                  />
                </>
              )}
            </div>
          ))}

          {/* Test connection result */}
          {testResult && (
            <div
              className={cn(
                'flex items-center gap-3 p-4 rounded-lg border',
                testResult.success
                  ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                  : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
              )}
            >
              {testResult.success ? (
                <svg className="h-5 w-5 text-green-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-red-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              <div>
                <p className={cn('text-sm font-medium', testResult.success ? 'text-green-700' : 'text-red-700')}>
                  {testResult.success ? 'Connection successful' : 'Connection failed'}
                </p>
                <p className={cn('text-xs', testResult.success ? 'text-green-600' : 'text-red-600')}>
                  {testResult.message}
                  {testResult.success && ` (${formatDuration(testResult.latencyMs)})`}
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate({ to: '/datasources' })}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={testMutation.isPending}
              className="btn btn-secondary"
            >
              {testMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" />
                  Testing...
                </>
              ) : (
                'Test Connection'
              )}
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="btn btn-primary"
            >
              {createMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" />
                  Saving...
                </>
              ) : (
                'Save Data Source'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function getDatabaseIcon(type: string): string {
  switch (type) {
    case 'postgresql': return 'PG';
    case 'mysql': return 'My';
    case 'sqlite': return 'SL';
    case 'clickhouse': return 'CH';
    case 'bigquery': return 'BQ';
    case 'snowflake': return 'SF';
    case 'duckdb': return 'DK';
    default: return 'DB';
  }
}
