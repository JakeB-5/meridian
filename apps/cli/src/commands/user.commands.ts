// User sub-commands: list, create, delete

import type { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { createApiClient, formatApiError } from '../api-client.js';
import { formatAsTable } from '../formatters/table.formatter.js';
import { formatAsJson } from '../formatters/json.formatter.js';
import { formatAsCsv } from '../formatters/csv.formatter.js';
import { createSpinner } from '../utils/spinner.js';
import { promptNewUser, confirmDeletion } from '../utils/prompts.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface User {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'inactive' | 'pending';
  role?: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

interface PaginatedUsers {
  data: User[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerUserCommands(program: Command): void {
  const user = program
    .command('user')
    .description('Manage users');

  // ── list ──────────────────────────────────────────────────────────

  user
    .command('list')
    .description('List all users')
    .option('-f, --format <format>', 'Output format: table|json|csv', '')
    .option('--status <status>', 'Filter by status: active|inactive|pending')
    .option('--search <term>', 'Search by name or email')
    .action(async (opts: { format: string; status?: string; search?: string }) => {
      const config = loadConfig();
      const format = opts.format || config.outputFormat;
      const client = createApiClient(config);
      const spinner = createSpinner('Fetching users…').start();

      try {
        const params: Record<string, string> = {};
        if (opts.status) params['status'] = opts.status;
        if (opts.search) params['search'] = opts.search;

        const result = await client.get<PaginatedUsers>('/api/users', { params });
        spinner.stop();

        if (result.data.length === 0) {
          console.log(chalk.yellow('No users found.'));
          return;
        }

        const rows = result.data.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role ?? '—',
          status: colorizeUserStatus(u.status),
          created: formatDate(u.createdAt),
        }));

        outputFormatted(rows, format);
        console.log(chalk.gray(`\nShowing ${result.data.length} of ${result.total} users`));
      } catch (error) {
        spinner.fail('Failed to fetch users');
        console.error(chalk.red(formatApiError(error)));
        process.exit(1);
      }
    });

  // ── create ────────────────────────────────────────────────────────

  user
    .command('create')
    .description('Create a new user (interactive)')
    .action(async () => {
      try {
        const details = await promptNewUser();
        const config = loadConfig();
        const client = createApiClient(config);
        const spinner = createSpinner('Creating user…').start();

        const created = await client.post<User>('/api/users', {
          name: details.name,
          email: details.email,
          password: details.password,
          role: details.role,
        });

        spinner.succeed(`User "${created.name}" created`);
        console.log();
        console.log(
          formatAsTable([
            { id: created.id, name: created.name, email: created.email, status: created.status },
          ]),
        );
      } catch (error) {
        console.error(chalk.red(formatApiError(error)));
        process.exit(1);
      }
    });

  // ── delete ────────────────────────────────────────────────────────

  user
    .command('delete <id>')
    .description('Deactivate a user account')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (id: string, opts: { yes?: boolean }) => {
      const config = loadConfig();
      const client = createApiClient(config);

      try {
        // Fetch user details for the confirmation message
        let name = id;
        try {
          const u = await client.get<User>(`/api/users/${id}`);
          name = `${u.name} (${u.email})`;
        } catch {
          // Ignore fetch failure — use ID in message
        }

        if (!opts.yes) {
          const confirmed = await confirmDeletion('user', name);
          if (!confirmed) {
            console.log(chalk.gray('Cancelled.'));
            return;
          }
        }

        const spinner = createSpinner(`Deactivating user "${name}"…`).start();
        await client.patch(`/api/users/${id}`, { status: 'inactive' });
        spinner.succeed(`User "${name}" deactivated`);
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

function colorizeUserStatus(status: string): string {
  switch (status) {
    case 'active': return chalk.green(status);
    case 'inactive': return chalk.gray(status);
    case 'pending': return chalk.yellow(status);
    default: return status;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
