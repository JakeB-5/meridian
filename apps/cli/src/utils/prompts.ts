// Interactive CLI prompts using inquirer

import inquirer from 'inquirer';
import type { DatabaseType } from '@meridian/shared';

// ---------------------------------------------------------------------------
// Database type selection
// ---------------------------------------------------------------------------

const DATABASE_TYPE_CHOICES = [
  { name: 'PostgreSQL', value: 'postgresql' },
  { name: 'MySQL', value: 'mysql' },
  { name: 'SQLite', value: 'sqlite' },
  { name: 'ClickHouse', value: 'clickhouse' },
  { name: 'BigQuery', value: 'bigquery' },
  { name: 'Snowflake', value: 'snowflake' },
  { name: 'DuckDB', value: 'duckdb' },
];

export async function promptDatabaseType(): Promise<DatabaseType> {
  const { type } = await inquirer.prompt<{ type: DatabaseType }>([
    {
      type: 'list',
      name: 'type',
      message: 'Select database type:',
      choices: DATABASE_TYPE_CHOICES,
    },
  ]);
  return type;
}

// ---------------------------------------------------------------------------
// Datasource creation
// ---------------------------------------------------------------------------

export interface DatasourceConnectionDetails {
  name: string;
  type: DatabaseType;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  filepath?: string; // for SQLite/DuckDB
}

export async function promptDatasourceDetails(
  type?: DatabaseType,
): Promise<DatasourceConnectionDetails> {
  const dbType = type ?? (await promptDatabaseType());

  const baseQuestions = [
    {
      type: 'input',
      name: 'name',
      message: 'Datasource name:',
      validate: (v: string) => (v.trim().length > 0 ? true : 'Name is required'),
    },
  ];

  const fileBasedTypes: DatabaseType[] = ['sqlite', 'duckdb'];

  if (fileBasedTypes.includes(dbType)) {
    const answers = await inquirer.prompt<{ name: string; filepath: string; ssl: boolean }>([
      ...baseQuestions,
      {
        type: 'input',
        name: 'filepath',
        message: 'Database file path:',
        default: dbType === 'sqlite' ? './data.db' : './data.duckdb',
        validate: (v: string) => (v.trim().length > 0 ? true : 'File path is required'),
      },
    ]);

    return {
      name: answers.name,
      type: dbType,
      filepath: answers.filepath,
    };
  }

  // Network-based databases
  const defaultPorts: Record<string, number> = {
    postgresql: 5432,
    mysql: 3306,
    clickhouse: 8123,
    bigquery: 443,
    snowflake: 443,
  };

  const answers = await inquirer.prompt<{
    name: string;
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl: boolean;
  }>([
    ...baseQuestions,
    {
      type: 'input',
      name: 'host',
      message: 'Host:',
      default: 'localhost',
      validate: (v: string) => (v.trim().length > 0 ? true : 'Host is required'),
    },
    {
      type: 'number',
      name: 'port',
      message: 'Port:',
      default: defaultPorts[dbType] ?? 5432,
      validate: (v: number) =>
        v > 0 && v <= 65535 ? true : 'Port must be between 1 and 65535',
    },
    {
      type: 'input',
      name: 'database',
      message: 'Database name:',
      validate: (v: string) => (v.trim().length > 0 ? true : 'Database name is required'),
    },
    {
      type: 'input',
      name: 'username',
      message: 'Username:',
      validate: (v: string) => (v.trim().length > 0 ? true : 'Username is required'),
    },
    {
      type: 'password',
      name: 'password',
      message: 'Password:',
    },
    {
      type: 'confirm',
      name: 'ssl',
      message: 'Use SSL?',
      default: false,
    },
  ]);

  return {
    name: answers.name,
    type: dbType,
    host: answers.host,
    port: answers.port,
    database: answers.database,
    username: answers.username,
    password: answers.password,
    ssl: answers.ssl,
  };
}

// ---------------------------------------------------------------------------
// Confirmation prompts
// ---------------------------------------------------------------------------

export async function confirmAction(message: string, defaultValue = false): Promise<boolean> {
  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: defaultValue,
    },
  ]);
  return confirmed;
}

export async function confirmDeletion(resourceType: string, identifier: string): Promise<boolean> {
  return confirmAction(
    `Are you sure you want to delete ${resourceType} "${identifier}"? This cannot be undone.`,
    false,
  );
}

// ---------------------------------------------------------------------------
// User creation
// ---------------------------------------------------------------------------

export interface NewUserDetails {
  name: string;
  email: string;
  password: string;
  role?: string;
}

export async function promptNewUser(): Promise<NewUserDetails> {
  const answers = await inquirer.prompt<NewUserDetails>([
    {
      type: 'input',
      name: 'name',
      message: 'Full name:',
      validate: (v: string) => (v.trim().length > 0 ? true : 'Name is required'),
    },
    {
      type: 'input',
      name: 'email',
      message: 'Email address:',
      validate: (v: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(v) ? true : 'Please enter a valid email address';
      },
    },
    {
      type: 'password',
      name: 'password',
      message: 'Password:',
      validate: (v: string) =>
        v.length >= 8 ? true : 'Password must be at least 8 characters',
    },
    {
      type: 'list',
      name: 'role',
      message: 'Role:',
      choices: [
        { name: 'Viewer', value: 'viewer' },
        { name: 'Editor', value: 'editor' },
        { name: 'Admin', value: 'admin' },
      ],
      default: 'viewer',
    },
  ]);

  return answers;
}

// ---------------------------------------------------------------------------
// Config init
// ---------------------------------------------------------------------------

export interface InitConfigAnswers {
  serverUrl: string;
  apiToken: string;
  outputFormat: 'table' | 'json' | 'csv';
}

export async function promptConfigInit(): Promise<InitConfigAnswers> {
  return inquirer.prompt<InitConfigAnswers>([
    {
      type: 'input',
      name: 'serverUrl',
      message: 'Meridian server URL:',
      default: 'http://localhost:3001',
      validate: (v: string) => {
        try {
          new URL(v);
          return true;
        } catch {
          return 'Please enter a valid URL';
        }
      },
    },
    {
      type: 'input',
      name: 'apiToken',
      message: 'API token (leave blank to set later):',
      default: '',
    },
    {
      type: 'list',
      name: 'outputFormat',
      message: 'Default output format:',
      choices: [
        { name: 'Table (ASCII)', value: 'table' },
        { name: 'JSON', value: 'json' },
        { name: 'CSV', value: 'csv' },
      ],
      default: 'table',
    },
  ]);
}
