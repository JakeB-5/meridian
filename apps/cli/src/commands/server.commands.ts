// Server sub-commands: start, status, migrate

import { execSync, spawn } from 'node:child_process';
import * as path from 'node:path';
import type { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { createApiClient, formatApiError } from '../api-client.js';
import { formatAsKeyValue } from '../formatters/table.formatter.js';
import { createSpinner } from '../utils/spinner.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HealthResponse {
  status: string;
  uptime?: number;
  version?: string;
  timestamp?: string;
  database?: { ok: boolean; latencyMs: number };
  redis?: { ok: boolean; latencyMs: number };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerServerCommands(program: Command): void {
  const server = program
    .command('server')
    .description('Manage the Meridian server process');

  // ── start ─────────────────────────────────────────────────────────

  server
    .command('start')
    .description('Start the Meridian server (must be installed locally)')
    .option('--port <port>', 'Server port', '3001')
    .option('--host <host>', 'Bind host', '0.0.0.0')
    .option('--log-level <level>', 'Log level: debug|info|warn|error', 'info')
    .option('--daemon', 'Run in background (detached)')
    .action(
      async (opts: { port: string; host: string; logLevel: string; daemon?: boolean }) => {
        // Try to locate the server binary
        let serverBin: string;
        try {
          serverBin = resolveServerBin();
        } catch {
          console.error(
            chalk.red(
              'Could not locate the Meridian server. ' +
                'Make sure @meridian/server is installed and built.',
            ),
          );
          process.exit(1);
        }

        const env = {
          ...process.env,
          PORT: opts.port,
          HOST: opts.host,
          LOG_LEVEL: opts.logLevel,
        };

        if (opts.daemon) {
          const child = spawn(process.execPath, [serverBin], {
            detached: true,
            stdio: 'ignore',
            env,
          });
          child.unref();
          console.log(
            chalk.green(`Server started in background (PID: ${child.pid})`) +
              chalk.gray(` on port ${opts.port}`),
          );
        } else {
          console.log(chalk.cyan(`Starting Meridian server on port ${opts.port}…`));
          const child = spawn(process.execPath, [serverBin], {
            stdio: 'inherit',
            env,
          });

          child.on('exit', (code) => {
            if (code !== 0) {
              console.error(chalk.red(`Server exited with code ${code}`));
              process.exit(code ?? 1);
            }
          });

          // Forward signals to child
          for (const sig of ['SIGTERM', 'SIGINT'] as const) {
            process.on(sig, () => child.kill(sig));
          }
        }
      },
    );

  // ── status ────────────────────────────────────────────────────────

  server
    .command('status')
    .description('Check the health of the Meridian server')
    .action(async () => {
      const config = loadConfig();
      const client = createApiClient(config);
      const spinner = createSpinner(`Checking server at ${config.serverUrl}…`).start();

      try {
        const health = await client.get<HealthResponse>('/health');
        spinner.stop();

        const statusColor =
          health.status === 'ok' ? chalk.green : chalk.yellow;

        console.log(statusColor(`● Server status: ${health.status.toUpperCase()}`));
        console.log();

        const info: Record<string, unknown> = {
          url: config.serverUrl,
          status: health.status,
        };

        if (health.version) info['version'] = health.version;
        if (health.uptime !== undefined) info['uptime'] = `${health.uptime}s`;
        if (health.timestamp) info['timestamp'] = health.timestamp;
        if (health.database) {
          info['database'] = health.database.ok
            ? chalk.green(`ok (${health.database.latencyMs}ms)`)
            : chalk.red('error');
        }
        if (health.redis) {
          info['redis'] = health.redis.ok
            ? chalk.green(`ok (${health.redis.latencyMs}ms)`)
            : chalk.red('error');
        }

        console.log(formatAsKeyValue(info));
      } catch (error) {
        spinner.fail(`Cannot reach server at ${config.serverUrl}`);
        console.error(chalk.red(formatApiError(error)));
        process.exit(1);
      }
    });

  // ── migrate ───────────────────────────────────────────────────────

  server
    .command('migrate')
    .description('Run pending database migrations')
    .option('--dry-run', 'Show pending migrations without applying them')
    .action(async (opts: { dryRun?: boolean }) => {
      const config = loadConfig();
      const client = createApiClient(config);
      const spinner = createSpinner('Running database migrations…').start();

      try {
        const result = await client.post<{
          applied: string[];
          pending: string[];
          status: string;
        }>('/api/admin/migrate', { dryRun: opts.dryRun ?? false });

        spinner.stop();

        if (opts.dryRun) {
          if (result.pending.length === 0) {
            console.log(chalk.green('✔ No pending migrations.'));
          } else {
            console.log(chalk.yellow(`Pending migrations (${result.pending.length}):`));
            for (const m of result.pending) {
              console.log(`  ${chalk.cyan('→')} ${m}`);
            }
          }
        } else {
          if (result.applied.length === 0) {
            console.log(chalk.green('✔ No migrations needed — database is up to date.'));
          } else {
            console.log(chalk.green(`✔ Applied ${result.applied.length} migration(s):`));
            for (const m of result.applied) {
              console.log(`  ${chalk.cyan('✔')} ${m}`);
            }
          }
        }
      } catch (error) {
        spinner.fail('Migration failed');
        console.error(chalk.red(formatApiError(error)));
        process.exit(1);
      }
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveServerBin(): string {
  // Try to find the compiled server entry point relative to the monorepo
  const candidates = [
    path.resolve(process.cwd(), 'apps/server/dist/index.js'),
    path.resolve(process.cwd(), '../../apps/server/dist/index.js'),
  ];

  for (const p of candidates) {
    try {
      execSync(`test -f "${p}"`, { stdio: 'ignore' });
      return p;
    } catch {
      // Try next
    }
  }

  throw new Error('Server binary not found');
}
