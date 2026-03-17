#!/usr/bin/env node
// Main CLI entry point for the Meridian BI Platform CLI tool.

import { Command } from 'commander';
import chalk from 'chalk';
import { registerDatasourceCommands } from './commands/datasource.commands.js';
import { registerQueryCommands } from './commands/query.commands.js';
import { registerDashboardCommands } from './commands/dashboard.commands.js';
import { registerUserCommands } from './commands/user.commands.js';
import { registerServerCommands } from './commands/server.commands.js';
import { registerConfigCommands } from './commands/config.commands.js';
import { loadConfig } from './config.js';

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

const program = new Command()
  .name('meridian')
  .description(
    [
      chalk.bold.cyan('Meridian BI Platform CLI'),
      '',
      'Manage your Meridian server, data sources, dashboards, and users',
      'from the command line.',
      '',
      chalk.gray('Configuration file: ~/.meridian/config.json'),
      chalk.gray('Run "meridian config init" to get started.'),
    ].join('\n'),
  )
  .version('0.1.0', '-v, --version', 'Display version number')
  .helpOption('-h, --help', 'Display help')
  // Global options
  .option('--server-url <url>', 'Override server URL for this command')
  .option('--token <token>', 'Override API token for this command')
  .option('--no-color', 'Disable colored output')
  .option('--format <format>', 'Default output format: table|json|csv');

// Apply global option overrides before any command runs
program.hook('preAction', (thisCommand) => {
  const opts = program.opts<{
    serverUrl?: string;
    token?: string;
    color?: boolean;
    format?: string;
  }>();

  // Override config with global options when provided
  if (opts.serverUrl || opts.token || opts.format) {
    const { saveConfig } = require('./config.js') as typeof import('./config.js');
    // These are runtime overrides — applied in-memory via environment for this invocation
    if (opts.serverUrl) process.env['MERIDIAN_SERVER_URL'] = opts.serverUrl;
    if (opts.token) process.env['MERIDIAN_API_TOKEN'] = opts.token;
  }

  if (opts.color === false) {
    // Disable chalk colors globally
    chalk.level = 0;
  }
});

// ---------------------------------------------------------------------------
// Register sub-commands
// ---------------------------------------------------------------------------

registerDatasourceCommands(program);
registerQueryCommands(program);
registerDashboardCommands(program);
registerUserCommands(program);
registerServerCommands(program);
registerConfigCommands(program);

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

program.configureOutput({
  writeErr: (str) => process.stderr.write(chalk.red(str)),
});

// Handle unknown commands
program.on('command:*', () => {
  console.error(chalk.red(`Unknown command: ${program.args.join(' ')}`));
  console.error(`Run ${chalk.cyan('meridian --help')} for usage.`);
  process.exit(1);
});

export { program };
