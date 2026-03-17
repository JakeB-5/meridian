// Config sub-commands: set, get, list, init

import type { Command } from 'commander';
import chalk from 'chalk';
import {
  loadConfig,
  saveConfig,
  deleteConfig,
  getConfigFile,
  getConfigValue,
  setConfigValue,
  DEFAULT_CONFIG,
} from '../config.js';
import { formatAsTable } from '../formatters/table.formatter.js';
import { formatAsJson } from '../formatters/json.formatter.js';
import { promptConfigInit } from '../utils/prompts.js';
import { confirmAction } from '../utils/prompts.js';

// Valid config keys for help text
const VALID_KEYS = ['serverUrl', 'apiToken', 'outputFormat', 'color', 'timeoutMs'] as const;

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerConfigCommands(program: Command): void {
  const cfg = program
    .command('config')
    .description('Manage CLI configuration');

  // ── set ───────────────────────────────────────────────────────────

  cfg
    .command('set <key> <value>')
    .description(
      `Set a configuration value.\n  Valid keys: ${VALID_KEYS.join(', ')}`,
    )
    .action((key: string, value: string) => {
      try {
        setConfigValue(key, value);
        console.log(chalk.green(`✔ ${key} = ${value}`));
      } catch (error) {
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // ── get ───────────────────────────────────────────────────────────

  cfg
    .command('get <key>')
    .description('Get a single configuration value')
    .action((key: string) => {
      try {
        const value = getConfigValue(key as keyof ReturnType<typeof loadConfig>);
        if (value === undefined) {
          console.log(chalk.gray('(not set)'));
        } else {
          console.log(String(value));
        }
      } catch (error) {
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // ── list ──────────────────────────────────────────────────────────

  cfg
    .command('list')
    .alias('ls')
    .description('Show all configuration values')
    .option('--json', 'Output as JSON')
    .action((opts: { json?: boolean }) => {
      const config = loadConfig();

      // Mask token for display
      const display: Record<string, unknown> = {
        serverUrl: config.serverUrl,
        apiToken: config.apiToken
          ? maskToken(config.apiToken)
          : chalk.gray('(not set)'),
        outputFormat: config.outputFormat,
        color: config.color,
        timeoutMs: config.timeoutMs,
      };

      if (opts.json) {
        // Show raw (unmasked) values in JSON mode
        console.log(formatAsJson(config));
        return;
      }

      const rows = Object.entries(display).map(([key, value]) => ({
        key,
        value: String(value),
        default: String((DEFAULT_CONFIG as Record<string, unknown>)[key] ?? '—'),
      }));

      console.log(formatAsTable(rows));
      console.log(chalk.gray(`\nConfig file: ${getConfigFile()}`));
    });

  // ── init ──────────────────────────────────────────────────────────

  cfg
    .command('init')
    .description('Interactively initialise the CLI configuration')
    .option('--reset', 'Delete existing config before initialising')
    .action(async (opts: { reset?: boolean }) => {
      if (opts.reset) {
        const confirmed = await confirmAction('Delete existing config and start fresh?', false);
        if (!confirmed) {
          console.log(chalk.gray('Cancelled.'));
          return;
        }
        deleteConfig();
        console.log(chalk.gray('Existing config deleted.'));
      }

      try {
        const answers = await promptConfigInit();

        const updates: Parameters<typeof saveConfig>[0] = {
          serverUrl: answers.serverUrl,
          outputFormat: answers.outputFormat,
        };

        if (answers.apiToken && answers.apiToken.trim().length > 0) {
          updates.apiToken = answers.apiToken.trim();
        }

        saveConfig(updates);

        console.log();
        console.log(chalk.green('✔ Configuration saved!'));
        console.log(chalk.gray(`   File: ${getConfigFile()}`));
        console.log();

        // Verify connection if token is set
        if (updates.apiToken) {
          const { createApiClient } = await import('../api-client.js');
          const config = loadConfig();
          const client = createApiClient(config);

          try {
            await client.get('/health');
            console.log(chalk.green(`✔ Successfully connected to ${answers.serverUrl}`));
          } catch {
            console.log(
              chalk.yellow(`⚠ Could not reach server at ${answers.serverUrl}`) +
                chalk.gray(' — check your server URL'),
            );
          }
        }
      } catch (error) {
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });

  // ── reset ─────────────────────────────────────────────────────────

  cfg
    .command('reset')
    .description('Reset configuration to defaults')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (opts: { yes?: boolean }) => {
      if (!opts.yes) {
        const confirmed = await confirmAction(
          'Reset all configuration to defaults?',
          false,
        );
        if (!confirmed) {
          console.log(chalk.gray('Cancelled.'));
          return;
        }
      }

      deleteConfig();
      console.log(chalk.green('✔ Configuration reset to defaults.'));
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskToken(token: string): string {
  if (token.length <= 8) {
    return '••••••••';
  }
  return token.substring(0, 4) + '••••••••' + token.substring(token.length - 4);
}
