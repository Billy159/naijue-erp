import {isAbsolute} from 'node:path';
import {readProductionAdmission, type ProductionAdmission} from './production-admission.js';

export type DatabaseEnvironment = 'local' | 'stage' | 'qa' | 'production';
export interface DatabaseConfig {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly passfile: string | undefined;
  readonly sslmode: 'disable' | 'verify-full';
  readonly environment: DatabaseEnvironment;
  readonly instanceId: string;
  readonly clusterId: string;
  readonly schemas: {readonly source: string; readonly runtime: string; readonly auth: string; readonly control: string};
  readonly roles: {readonly app: string; readonly migrator: string; readonly source: string; readonly runtime: string; readonly auth: string; readonly control: string};
  readonly productionAdmission?: ProductionAdmission;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function databaseIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value) || value.startsWith('pg_')) throw new Error('INVALID_DATABASE_IDENTIFIER');
  return '"' + value + '"';
}
function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value || value !== value.trim()) throw new Error(`${key}_REQUIRED`);
  return value;
}
function name(env: NodeJS.ProcessEnv, key: string): string {
  const value = required(env, key); databaseIdentifier(value); return value;
}

/** No database, schema, login, OS user or credential fallback. */
export function readDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const environment = required(env, 'APP_ENV');
  if (!['local', 'stage', 'qa', 'production'].includes(environment)) throw new Error('INVALID_DATABASE_ENVIRONMENT');
  const host = required(env, 'POSTGRES_HOST');
  if ((!isAbsolute(host) && !/^[a-zA-Z0-9.:-]+$/.test(host)) || /[\s,=\0]/.test(host)) throw new Error('INVALID_POSTGRES_HOST');
  const portValue = required(env, 'POSTGRES_PORT');
  const port = Number(portValue);
  if (!/^\d+$/.test(portValue) || !Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_POSTGRES_PORT');
  const database = name(env, 'POSTGRES_DB');
  const user = name(env, 'POSTGRES_USER');
  const prefix = name(env, 'POSTGRES_ROLE_PREFIX');
  if (prefix.length > 40) throw new Error('ROLE_PREFIX_TOO_LONG');
  const roles = {app: prefix + '_app', migrator: prefix + '_migrator', source: prefix + '_source_owner', runtime: prefix + '_runtime_owner', auth: prefix + '_auth_owner', control: prefix + '_control_owner'};
  if (user !== roles.app) throw new Error('EXPLICIT_APPLICATION_ROLE_REQUIRED');
  const schemas = {source: name(env, 'POSTGRES_SOURCE_SCHEMA'), runtime: name(env, 'POSTGRES_RUNTIME_SCHEMA'), auth: name(env, 'POSTGRES_AUTH_SCHEMA'), control: name(env, 'POSTGRES_CONTROL_SCHEMA')};
  if (new Set(Object.values(schemas)).size !== 4 || Object.values(schemas).includes('public')) throw new Error('DISTINCT_PRIVATE_SCHEMAS_REQUIRED');
  const instanceId = required(env, 'POSTGRES_INSTANCE_ID');
  const clusterId = required(env, 'POSTGRES_CLUSTER_ID');
  if (!uuid.test(instanceId) || !/^[1-9][0-9]{0,19}$/.test(clusterId)) throw new Error('INVALID_DATABASE_IDENTITY');
  const passfile = env['POSTGRES_PASSFILE'] || undefined;
  if (env['POSTGRES_PASSWORD'] || env['POSTGRES_PASSWORD_FILE']) throw new Error('USE_POSTGRES_PASSFILE');
  if (passfile && !isAbsolute(passfile)) throw new Error('ABSOLUTE_PASSFILE_REQUIRED');
  const sslmode = env['POSTGRES_SSLMODE'] ?? (isAbsolute(host) ? 'disable' : 'verify-full');
  if (!['disable', 'verify-full'].includes(sslmode)) throw new Error('INVALID_SSLMODE');
  if (!isAbsolute(host) && !passfile) throw new Error('TCP_REQUIRES_PASSFILE');
  const config: DatabaseConfig = {host, port, database, user, passfile, sslmode: sslmode as DatabaseConfig['sslmode'], environment: environment as DatabaseEnvironment, instanceId, clusterId, schemas, roles};
  const admissionKeys = ['POSTGRES_PRODUCTION_ADMISSION_FILE','POSTGRES_PRODUCTION_AUTHORITY_FILE','POSTGRES_PRODUCTION_AUTHORITY_SHA256','POSTGRES_PRODUCTION_RELEASE_FILE'];
  if (admissionKeys.some(key => env[key] !== undefined)) {
    if (environment !== 'production') throw new Error('PRODUCTION_ADMISSION_REQUIRES_PRODUCTION_ENVIRONMENT');
    const productionAdmission = readProductionAdmission(config,{admissionFile:required(env,admissionKeys[0]!),authorityPublicKeyFile:required(env,admissionKeys[1]!),
      authorityPublicKeySha256:required(env,admissionKeys[2]!),releaseFile:required(env,admissionKeys[3]!)});
    return {...config,productionAdmission};
  }
  return config;
}

/** T08 maintenance is confined to explicitly named isolated databases. */
export function assertIsolatedTarget(config: DatabaseConfig): void {
  if (config.environment === 'production' || !/^demo_8877_[a-z0-9_]+$/.test(config.database)) throw new Error('ISOLATED_DATABASE_REQUIRED');
}
