# Group F4: apps/cli — Command-Line Interface

## Task
Build a CLI tool using Commander.js with chalk for colors and ora for spinners.

## Files to Create

### src/cli.ts
Main CLI entry:
```typescript
#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command()
  .name('meridian')
  .description('Meridian BI Platform CLI')
  .version('0.1.0');

// Register sub-commands
registerDatasourceCommands(program);
registerQueryCommands(program);
registerDashboardCommands(program);
registerUserCommands(program);
registerServerCommands(program);

program.parse();
```

### src/config.ts
CLI configuration:
- Config file at ~/.meridian/config.json
- Server URL, API token
- Default output format (table, json, csv)

### src/api-client.ts
HTTP client for CLI:
- Uses config for base URL and token
- Error formatting for terminal

### src/commands/datasource.commands.ts
```
meridian datasource list                 — List all datasources
meridian datasource add                  — Interactive datasource creation
meridian datasource test <id>            — Test connection
meridian datasource schema <id>          — Show database schema
meridian datasource remove <id>          — Remove datasource
```

### src/commands/query.commands.ts
```
meridian query run <sql> --datasource=<id>  — Execute raw SQL
meridian query export <question-id> --format=csv|json  — Export question results
```

### src/commands/dashboard.commands.ts
```
meridian dashboard list                  — List dashboards
meridian dashboard export <id> --output=<file>  — Export dashboard definition (JSON)
meridian dashboard import <file>         — Import dashboard from JSON
```

### src/commands/user.commands.ts
```
meridian user list                       — List users
meridian user create                     — Create user (interactive)
meridian user delete <id>                — Deactivate user
```

### src/commands/server.commands.ts
```
meridian server start                    — Start server (if installed locally)
meridian server status                   — Check server health
meridian server migrate                  — Run database migrations
```

### src/commands/config.commands.ts
```
meridian config set <key> <value>        — Set config value
meridian config get <key>                — Get config value
meridian config list                     — Show all config
meridian config init                     — Interactive config setup
```

### src/formatters/table.formatter.ts
Format data as ASCII table for terminal

### src/formatters/json.formatter.ts
Format as pretty-printed JSON

### src/formatters/csv.formatter.ts
Format as CSV

### src/utils/prompts.ts
Interactive prompts using inquirer:
- Datasource type selection
- Connection details input
- Confirmation prompts

### src/utils/spinner.ts
Ora spinner wrapper

### src/index.ts

## Tests
- src/commands/datasource.commands.test.ts
- src/commands/query.commands.test.ts
- src/formatters/table.formatter.test.ts
- src/formatters/csv.formatter.test.ts
- src/config.test.ts

## Dependencies
- @meridian/core, @meridian/shared
- commander, chalk, ora, inquirer

## Estimated LOC: ~3000 + ~800 tests
