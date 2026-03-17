// Query sub-commands: run, export

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

interface QueryResult {
  columns: Array<{ name: string; type: string }>;
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
  truncated: boolean;
}

interface ExportJobResult {
  jobId: string;
  status: string;
  filePath?: string;
  downloadUrl?: string;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerQueryCommands(program: Command): void {
  const query = program
    .command('query')
    .alias('q')
    .description('Execute and export queries');

  // ── run ───────────────────────────────────────────────────────────

  query
    .command('run <sql>')
    .description('Execute raw SQL against a data source')
    .requiredOption('--datasource <id>', 'Data source ID to run the query against')
    .option('-f, --format <format>', 'Output format: table|json|csv', '')
    .option('--limit <n>', 'Maximum rows to return', '100')
    .option('-o, --output <file>', 'Write results to a file instead of stdout')
    .action(
      async (
        sql: string,
        opts: { datasource: string; format: string; limit: string; output?: string },
      ) => {
        const config = loadConfig();
        const format = opts.output
          ? guessFormatFromFilename(opts.output)
          : (opts.format || config.outputFormat);
        const client = createApiClient(config);
        const spinner = createSpinner('Executing query…').start();

        try {
          const result = await client.post<QueryResult>('/api/query/run', {
            sql,
            datasourceId: opts.datasource,
            limit: parseInt(opts.limit, 10),
          });

          spinner.stop();

          const output = renderQueryResult(result, format);

          if (opts.output) {
            fs.writeFileSync(opts.output, output, 'utf-8');
            console.log(
              chalk.green(`✔ Written to ${opts.output}`) +
                chalk.gray(` (${result.rowCount} rows, ${result.executionTimeMs}ms)`),
            );
          } else {
            console.log(output);
            printQueryStats(result);
          }
        } catch (error) {
          spinner.fail('Query failed');
          console.error(chalk.red(formatApiError(error)));
          process.exit(1);
        }
      },
    );

  // ── export ────────────────────────────────────────────────────────

  query
    .command('export <question-id>')
    .description('Export question results as csv or json')
    .option('-f, --format <format>', 'Export format: csv|json', 'csv')
    .option('-o, --output <file>', 'Output file path (default: stdout)')
    .action(async (questionId: string, opts: { format: string; output?: string }) => {
      const config = loadConfig();
      const client = createApiClient(config);
      const spinner = createSpinner(`Exporting question ${questionId}…`).start();

      try {
        // Enqueue export job
        const job = await client.post<ExportJobResult>('/api/questions/export', {
          questionId,
          format: opts.format,
        });

        spinner.setText(`Export job ${job.jobId} queued, waiting for result…`);

        // Poll for completion
        const result = await pollJobCompletion(
          client,
          job.jobId,
          (status) => spinner.setText(`Export status: ${status}…`),
        );

        spinner.succeed(`Export complete`);

        // Download or stream result
        if (result.downloadUrl) {
          if (opts.output) {
            spinner.start('Downloading…');
            await downloadFile(result.downloadUrl, opts.output, config);
            spinner.succeed(`Saved to ${opts.output}`);
          } else {
            // Fetch and print to stdout
            const content = await client.get<string>(result.downloadUrl);
            console.log(content);
          }
        } else if (opts.output) {
          console.log(chalk.yellow(`Export job completed but no download URL was returned.`));
          console.log(chalk.gray(`Job ID: ${job.jobId}`));
        }
      } catch (error) {
        spinner.fail('Export failed');
        console.error(chalk.red(formatApiError(error)));
        process.exit(1);
      }
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderQueryResult(result: QueryResult, format: string): string {
  const rows = result.rows;

  switch (format) {
    case 'json':
      return formatAsJson({ columns: result.columns, rows, rowCount: result.rowCount });
    case 'csv':
      return formatAsCsv(rows);
    default:
      return formatAsTable(rows);
  }
}

function printQueryStats(result: QueryResult): void {
  const parts: string[] = [
    chalk.gray(`${result.rowCount} row${result.rowCount !== 1 ? 's' : ''}`),
    chalk.gray(`${result.executionTimeMs}ms`),
  ];
  if (result.truncated) {
    parts.push(chalk.yellow('(results truncated)'));
  }
  console.log('\n' + parts.join(' · '));
}

function guessFormatFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'json') return 'json';
  if (ext === 'csv') return 'csv';
  return 'table';
}

interface JobStatus {
  jobId: string;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  result?: ExportJobResult;
  error?: string;
}

async function pollJobCompletion(
  client: ReturnType<typeof createApiClient>,
  jobId: string,
  onStatus: (status: string) => void,
  maxWaitMs = 120_000,
  intervalMs = 2_000,
): Promise<ExportJobResult> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const status = await client.get<JobStatus>(`/api/jobs/${jobId}`);
    onStatus(status.status);

    if (status.status === 'completed') {
      return status.result ?? { jobId, status: 'completed' };
    }
    if (status.status === 'failed') {
      throw new Error(status.error ?? `Export job ${jobId} failed`);
    }

    await delay(intervalMs);
  }

  throw new Error(`Export job ${jobId} timed out after ${maxWaitMs / 1000}s`);
}

async function downloadFile(
  url: string,
  outputPath: string,
  config: ReturnType<typeof loadConfig>,
): Promise<void> {
  const client = createApiClient(config);
  const content = await client.get<string>(url);
  fs.writeFileSync(outputPath, typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf-8');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
