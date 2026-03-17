// Dashboard sub-commands: list, export, import

import * as fs from 'node:fs';
import type { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { createApiClient, formatApiError } from '../api-client.js';
import { formatAsTable } from '../formatters/table.formatter.js';
import { formatAsJson } from '../formatters/json.formatter.js';
import { formatAsCsv } from '../formatters/csv.formatter.js';
import { createSpinner } from '../utils/spinner.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Dashboard {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

interface PaginatedDashboards {
  data: Dashboard[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface DashboardExport {
  version: string;
  exportedAt: string;
  dashboard: Dashboard;
  cards: unknown[];
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerDashboardCommands(program: Command): void {
  const dash = program
    .command('dashboard')
    .alias('db')
    .description('Manage dashboards');

  // ── list ──────────────────────────────────────────────────────────

  dash
    .command('list')
    .description('List all dashboards')
    .option('-f, --format <format>', 'Output format: table|json|csv', '')
    .option('--public', 'Show only public dashboards')
    .option('--search <term>', 'Search by name')
    .action(async (opts: { format: string; public?: boolean; search?: string }) => {
      const config = loadConfig();
      const format = opts.format || config.outputFormat;
      const client = createApiClient(config);
      const spinner = createSpinner('Fetching dashboards…').start();

      try {
        const params: Record<string, string | boolean> = {};
        if (opts.public) params['isPublic'] = true;
        if (opts.search) params['search'] = opts.search;

        const result = await client.get<PaginatedDashboards>('/api/dashboards', {
          params: params as Record<string, string>,
        });
        spinner.stop();

        if (result.data.length === 0) {
          console.log(chalk.yellow('No dashboards found.'));
          return;
        }

        const rows = result.data.map((d) => ({
          id: d.id,
          name: d.name,
          public: d.isPublic ? chalk.green('yes') : chalk.gray('no'),
          updated: formatDate(d.updatedAt),
        }));

        outputFormatted(rows, format);
        console.log(chalk.gray(`\nShowing ${result.data.length} of ${result.total} dashboards`));
      } catch (error) {
        spinner.fail('Failed to fetch dashboards');
        console.error(chalk.red(formatApiError(error)));
        process.exit(1);
      }
    });

  // ── export ────────────────────────────────────────────────────────

  dash
    .command('export <id>')
    .description('Export a dashboard definition to JSON')
    .option('-o, --output <file>', 'Output file path (default: stdout)')
    .option('--pretty', 'Pretty-print JSON with indentation', true)
    .action(async (id: string, opts: { output?: string; pretty: boolean }) => {
      const config = loadConfig();
      const client = createApiClient(config);
      const spinner = createSpinner(`Exporting dashboard ${id}…`).start();

      try {
        const data = await client.get<DashboardExport>(`/api/dashboards/${id}/export`);
        spinner.stop();

        const json = formatAsJson(data, { indent: opts.pretty ? 2 : 0 });

        if (opts.output) {
          fs.writeFileSync(opts.output, json + '\n', 'utf-8');
          console.log(chalk.green(`✔ Dashboard exported to ${opts.output}`));
        } else {
          console.log(json);
        }
      } catch (error) {
        spinner.fail('Export failed');
        console.error(chalk.red(formatApiError(error)));
        process.exit(1);
      }
    });

  // ── import ────────────────────────────────────────────────────────

  dash
    .command('import <file>')
    .description('Import a dashboard from a JSON file')
    .option('--overwrite', 'Overwrite if a dashboard with the same name exists', false)
    .action(async (file: string, opts: { overwrite: boolean }) => {
      if (!fs.existsSync(file)) {
        console.error(chalk.red(`File not found: ${file}`));
        process.exit(1);
      }

      let data: DashboardExport;
      try {
        const raw = fs.readFileSync(file, 'utf-8');
        data = JSON.parse(raw) as DashboardExport;
      } catch (error) {
        console.error(chalk.red(`Failed to parse JSON: ${(error as Error).message}`));
        process.exit(1);
      }

      const config = loadConfig();
      const client = createApiClient(config);
      const spinner = createSpinner(`Importing dashboard "${data.dashboard?.name}"…`).start();

      try {
        const result = await client.post<Dashboard>('/api/dashboards/import', {
          ...data,
          overwrite: opts.overwrite,
        });
        spinner.succeed(`Dashboard "${result.name}" imported (ID: ${result.id})`);
      } catch (error) {
        spinner.fail('Import failed');
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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
