import {runDatabaseCommand} from './cli.js';

try { await runDatabaseCommand(process.argv.slice(2)); }
catch (error) {
  console.error(error instanceof Error ? error.message : 'DATABASE_MAINTENANCE_FAILED');
  process.exitCode = 1;
}
