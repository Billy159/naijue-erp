import {readDatabaseConfig, type DatabaseConfig} from './database/config.js';
import {readSecurityConfig, type SecurityConfig} from './security/config.js';
import {readMediaConfig, type MediaConfig} from './media/config.js';
import {readSyntheticFundAccountConfig, type SyntheticFundAccountConfig} from './security/synthetic-fund-accounts.js';

export type AppEnvironment = 'local' | 'stage' | 'qa' | 'production';
export interface AppConfig {
  readonly environment: AppEnvironment;
  readonly host: string;
  readonly port: number;
  readonly database: DatabaseConfig | null;
  readonly security: SecurityConfig | null;
  readonly media: MediaConfig;
  readonly syntheticFundAccounts?: SyntheticFundAccountConfig;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const environment = env['APP_ENV'] ?? 'local';
  if (!['local', 'stage', 'qa', 'production'].includes(environment)) throw new Error('APP_ENV must be local, stage, qa or production');
  const rawPort = env['APP_PORT'] ?? '18878';
  if (!/^\d+$/.test(rawPort)) throw new Error('APP_PORT must be an integer');
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('APP_PORT is outside 1..65535');
  const host = env['APP_HOST'] ?? '127.0.0.1';
  if (!host.trim() || /\s/.test(host)) throw new Error('APP_HOST must be a host or bind address');
  const mode = env['APP_DATABASE_MODE'] ?? (environment === 'local' && !Object.keys(env).some(key => key.startsWith('POSTGRES_')) ? 'disabled' : 'required');
  if (!['disabled', 'required'].includes(mode) || (mode === 'disabled' && environment !== 'local')) throw new Error('INVALID_DATABASE_MODE');
  if (mode === 'disabled' && Object.keys(env).some(key => key.startsWith('POSTGRES_'))) throw new Error('DISABLED_DATABASE_HAS_CONFIGURATION');
  const database = mode === 'required' ? readDatabaseConfig({...env, APP_ENV: environment}) : null;
  const security = readSecurityConfig(env, database);
  const syntheticFundAccounts=readSyntheticFundAccountConfig(env,database);
  const media = readMediaConfig(env, environment as AppEnvironment, database?.instanceId ?? 'local', process.cwd());
  return {environment: environment as AppEnvironment, host, port, database, security, media,...(syntheticFundAccounts?{syntheticFundAccounts}:{})};
}
