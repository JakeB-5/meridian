// Datasource sub-commands: list, add, test, schema, remove

import type { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { createApiClient, formatApiError } from '../api-client.js';
import { formatAsTable, formatAsKeyValue } from '../formatters/table.formatter.js';
import { formatAsJson } from '../formatters/json.formatter.js';
import { formatAsCsv } from '../formatters/csv.formatter.js';
import { createSpinner } from '../utils/spinner.js';
import { promptDatasourceDetails, confirmDeletion } from '../utils/prompts.js';

// ---------------------------------------------------------------------------
// Types (matching server API responses)
// ---------------------------------------------------------------------------

interface DataSource {
  id: string;
  name: string;
  type: string;
  status: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  lastTestedAt?: string;
}

interface PaginatedDatasources {
  data: DataSource[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs: number;
}

interface SchemaTable {
  name: string;
  schema?: string;
  type?: string;
  rowCount?: number;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerDatasourceCommands(program: Command): void {
  const ds = program
    .command('datasource')
    .alias('ds')
    .description('Manage data sources');

  // ── list ──────────────────────────────────────────────────────────

  ds.command('list')
    .description('List all data sources')
    .option('-f, --format <format>', 'Output format: table|json|csv', '')
    .option('--type <type>', 'Filter by database type')
    .option('--status <status>', 'Filter by status (active|inactive|error)')
    .action(async (opts: { format: string; type?: string; status?: string }) => {
      const config = loadConfig();
      const format = opts.format || config.outputFormat;
      const client = createApiClient(config);
      const spinner = createSpinner('Fetching data sources…').start();

      try {
        const params: Record<string, string> = {};
        if (opts.type) params['type'] = opts.type;
        if (opts.status) params['status'] = opts.status;

        const result = await client.get<PaginatedDatasources>('/api/datasources', { params });
        spinner.stop();

        if (result.data.length === 0) {
          console.log(chalk.yellow('No data sources found.'));
          return;
        }

        const rows = result.data.map((ds) => ({
          id: ds.id,
          name: ds.name,
          type: ds.type,
          status: colorizeStatus(ds.status),
          updated: formatDate(ds.updatedAt),
        }));

        outputFormatted(rows, format);
        console.log(chalk.gray(`\nShowing ${result.data.length} of ${result.total} data sources`));
      } catch (error) {
        spinner.fail('Failed to fetch data sources');
        console.error(chalk.red(formatApiError(error)));
        process.exit(1);
      }
    });

  // ── add ───────────────────────────────────────────────────────────

  ds.command('add')
    .description('Add a new data source (interactive)')
    .option('--type <type>', 'Database type (skips type prompt)')
    .action(async (opts: { type?: string }) => {
      try {
        const details = await promptDatasourceDetails(opts.type as import('@meridian/shared').DatabaseType | undefined);
        const config = loadConfig();
        const client = createApiClient(config);
        const spinner = createSpinner('Creating data source…').start();

        const body = {
          name: details.name,
          type: details.type,
          config: {
            host: details.host,
            port: details.port,
            database: details.database,
            username: details.username,
            password: details.password,
            ssl: details.ssl,
            filepath: details.filepath,
          },
        };

        const created = await client.post<DataSource>('/api/datasources', body);
        spinner.succeed(`Data source "${created.name}" created`);
        console.log();
        console.log(formatAsKeyValue({ id: created.id, name: created.name, type: created.type, status: created.status }));
      } catch (error) {
        console.error(chalk.red(formatApiError(error)));
        process.exit(1);
      }
    });

  // ── test ──────────────────────────────────────────────────────────

  ds.command('test <id>')
    .description('Test a data source connection')
    .action(async (id: string) => {
      const config = loadConfig();
      const client = createApiClient(config);
      const spinner = createSpinner(`Testing connection to data source ${id}…`).start();

      try {
        const result = await client.post<ConnectionTestResult>(`/api/datasources/${id}/test`);
        if (result.success) {
          spinner.succeed(
            chalk.green(`Connection successful`) + chalk.gray(` (${result.latencyMs}ms)`)
          );
        } else {
          spinner.fail(chalk.red(`Connection failed: ${result.message}`));
          process.exit(1);
        }
      } catch (error) {
        spinner.fail('Connection test failed');
        console.error(chalk.red(formatApiError(error)));
        process.exit(1);
      }
    });

  // ── schema ────────────────────────────────────────────────────────

  ds.command('schema <id>')
    .description('Show database schema for a data source')
    .option('-s, --schema <schema>', 'Filter by schema name')
    .option('-f, --format <format>', 'Output format: table|json', '')
    .action(async (id: string, opts: { schema?: string; format: string }) => {
      const config = loadConfig();
      const format = opts.format || config.outputFormat;
      const client = createApiClient(config);
      const spinner = createSpinner('Fetching schema…').start();

      try {
        const params: Record<string, string> = {};
        if (opts.schema) params['schema'] = opts.schema;

        const tables = await client.get<SchemaTable[]>(`/api/datasources/${id}/schema`, { params });
        spinner.stop();

        if (tables.length === 0) {
          console.log(chalk.yellow('No tables found.'));
          return;
        }

        const rows = tables.map((t) => ({
          schema: t.schema ?? 'public',
          table: t.name,
          type: t.type ?? 'table',
          rows: t.rowCount ?? '—',
        }));

        outputFormatted(rows, format);
        console.log(chalk.gray(`\n${tables.length} tables/views`));
      } catch (error) {
        spinner.fail('Failed to fetch schema');
        console.error(chalk.red(formatApiError(error)));
        process.exit(1);
      }
    });

  // ── remove ────────────────────────────────────────────────────────

  ds.command('remove <id>')
    .alias('delete')
    .description('Remove a data source')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (id: string, opts: { yes?: boolean }) => {
      const config = loadConfig();
      const client = createApiClient(config);

      try {
        // Get name for confirmation message
        let name = id;
        try {
          const ds = await client.get<DataSource>(`/api/datasources/${id}`);
          name = ds.name;
        } catch {
          // If fetch fails, just use ID
        }

        if (!opts.yes) {
          const confirmed = await confirmDeletion('data source', name);
          if (!confirmed) {
            console.log(chalk.gray('Cancelled.'));
            return;
          }
        }

        const spinner = createSpinner(`Removing data source "${name}"…`).start();
        await client.delete(`/api/datasources/${id}`);
        spinner.succeed(`Data source "${name}" removed`);
      } catch (error) {
        console.error(chalk.red(formatApiError(error)));
        process.exit(1);
      }
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function outputFormatted(rows: Record<string, unknown>[], format: string): void {
  switch (format) {
    case 'json':
      console.log(formatAsJson(rows, { colorize: true }));
      break;
    case 'csv':
      console.log(formatAsCsv(rows));
      break;
    default:
      console.log(formatAsTable(rows));
  }
}

function colorizeStatus(status: string): string {
  switch (status) {
    case 'active': return chalk.green(status);
    case 'error': return chalk.red(status);
    case 'testing': return chalk.yellow(status);
    default: return chalk.gray(status);
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
