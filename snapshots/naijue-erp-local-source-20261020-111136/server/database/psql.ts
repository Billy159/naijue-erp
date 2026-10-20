import {spawn} from 'node:child_process';
import {statSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import type {DatabaseConfig} from './config.js';

/** Maintenance only. T09 supplies the application's pg data access layer. */
export function maintenanceSql(config: DatabaseConfig, user: string, sql: string, binary: string): Promise<string> {
  if (!isAbsolute(binary)) throw new Error('ABSOLUTE_PSQL_BINARY_REQUIRED');
  if (config.passfile) {
    const stat = statSync(config.passfile);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error('PASSFILE_MUST_BE_PRIVATE');
  }
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ['-X', '-w', '-qAt', '--set=ON_ERROR_STOP=1', '--set=VERBOSITY=terse', '-h', config.host, '-p', String(config.port), '-U', user, '-d', config.database], {
      env: {PATH: process.env['PATH'], LANG: 'C', PGCONNECT_TIMEOUT: '5', PGAPPNAME: 'naijue-t08-maintenance', PGSSLMODE: config.sslmode,
        PGPASSFILE: config.passfile ?? '/dev/null', PGOPTIONS: '-c search_path=pg_catalog -c timezone=UTC -c statement_timeout=300000 -c lock_timeout=10000'},
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = ''; let errors = ''; let settled = false; let inputFailed = false;
    const finish = (error?: Error): void => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (error) reject(error); else resolve(output.trim());
    };
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish(new Error('MAINTENANCE_TIMEOUT')); }, 330_000);
    child.stdout.on('data', (bytes: Buffer) => { output += bytes.toString(); });
    child.stderr.on('data', (bytes: Buffer) => { errors += bytes.toString(); });
    child.on('error', () => finish(new Error('PSQL_START_FAILED')));
    // psql can reject a guard before consuming the remaining SQL. Wait for its diagnostic and exit.
    child.stdin.on('error', () => { inputFailed = true; });
    child.on('close', code => {
      // Never return SQL text, credential data, DETAIL or failing-row contents.
      const marker = errors.match(/\b(?:T08_[A-Z0-9_]+|IMMUTABLE_[A-Z0-9_]+)\b/)?.[0];
      finish(code === 0 && !inputFailed ? undefined : new Error(marker ?? (inputFailed ? 'PSQL_INPUT_FAILED' : 'MAINTENANCE_SQL_FAILED')));
    });
    child.stdin.end(sql + '\n');
  });
}
