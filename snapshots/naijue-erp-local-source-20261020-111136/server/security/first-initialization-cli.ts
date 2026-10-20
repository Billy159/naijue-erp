import {readDatabaseConfig} from '../database/config.js';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {PgDataAccess} from '../database/access.js';
import {readProductionAdmission, type ProductionAdmission} from '../database/production-admission.js';
import {readSecurityConfig} from './config.js';
import {object, SecurityError} from './errors.js';
import {FirstEmployeeInitializer, readFirstInitializationFile, readFirstInitializationGrant} from './first-initialization.js';
import {readApprovedInitialEmployeePlan, approvedInitialEmployeePlanSha256} from './approved-initial-employees.js';
import {firstRealAdministratorRequest, readApprovedEmployeeRegistration} from './first-real-administrator.js';

/** Secret values are read only from a private file; never from argv/env or stdout. */
export async function runFirstEmployeeInitialization(env: NodeJS.ProcessEnv): Promise<{initialized: number; personKeys: string[]} | {registered: number; existing: number}> {
  const config = readDatabaseConfig(env), security = readSecurityConfig(env, config);
  const bindingFile = env['T37_BINDING_FILE'], requestFile = env['T37_REQUEST_FILE'], planFile = env['T37_APPROVED_EMPLOYEE_PLAN_FILE'];
  if (!security || !bindingFile || !requestFile || !planFile) throw new SecurityError('EXPLICIT_INITIALIZATION_CONFIGURATION_REQUIRED');
  let admission: ProductionAdmission | undefined;
  if (config.environment === 'production') {
    const admissionFile = env['POSTGRES_PRODUCTION_ADMISSION_FILE'], authorityPublicKeyFile = env['POSTGRES_PRODUCTION_AUTHORITY_FILE'];
    const authorityPublicKeySha256 = env['POSTGRES_PRODUCTION_AUTHORITY_SHA256'], releaseFile = env['POSTGRES_PRODUCTION_RELEASE_FILE'];
    if (!admissionFile || !authorityPublicKeyFile || !authorityPublicKeySha256 || !releaseFile) throw new SecurityError('EXPLICIT_PRODUCTION_INITIALIZATION_ADMISSION_REQUIRED');
    admission = readProductionAdmission(config, {admissionFile, authorityPublicKeyFile, authorityPublicKeySha256, releaseFile});
  }
  const plan = readApprovedInitialEmployeePlan(planFile);
  const grant = readFirstInitializationGrant(bindingFile, config, plan, admission);
  const request = object(readFirstInitializationFile(requestFile));
  const bootstrap = request['operation'] === 'first-real-administrator';
  const registration = request['operation'] === 'register-approved-employees';
  if ((bootstrap || registration) && config.environment !== 'production') throw new SecurityError('FIRST_REAL_ADMIN_PRODUCTION_ONLY');
  if (registration && Object.keys(request).join(',') !== 'operation') throw new SecurityError('INVALID_EMPLOYEE_REGISTRATION_REQUEST');
  const registrationInput = registration ? readApprovedEmployeeRegistration(planFile) : undefined;
  const firstPassword = bootstrap ? firstRealAdministratorRequest(request) : undefined;
  if (!bootstrap && !registration && (Object.keys(request).sort().join(',') !== ['initialPassword','maintenanceToken','personKeys'].sort().join(',') || typeof request['maintenanceToken'] !== 'string'))
    throw new SecurityError('INVALID_INITIALIZATION_REQUEST');
  const access = new PgDataAccess(config, {}, admission ? {admission, operation: 'employee-initialization', sourceSha256: approvedInitialEmployeePlanSha256} : undefined);
  try {
    const initializer = new FirstEmployeeInitializer(access, config, security, admission);
    if (registrationInput) return await initializer.registerApprovedEmployees(grant, registrationInput);
    if (bootstrap) return await initializer.initializeFirstRealAdministrator(grant, firstPassword);
    return await initializer.initialize(grant, request['maintenanceToken'] as string,
      {personKeys: request['personKeys'], initialPassword: request['initialPassword']});
  } finally {await access.close();}
}

export async function firstInitializationMain(): Promise<void> {
  try {
    if (process.argv.length !== 2) throw new Error('NO_INITIALIZATION_ARGUMENTS');
    const result = await runFirstEmployeeInitialization(process.env);
    if ('registered' in result) process.stdout.write(JSON.stringify({status: 'REGISTERED_APPROVED_EMPLOYEES', ...result}) + '\n');
    else {
      const detail = process.env['APP_ENV'] === 'production' ? {initialized: result.initialized} : result;
      process.stdout.write(JSON.stringify({status: 'INITIALIZED_APPROVED_EMPLOYEES', ...detail}) + '\n');
    }
  } catch (error) {
    const candidate = error && typeof error === 'object' && 'code' in error ? error.code : 'INITIALIZATION_FAILED';
    const code = typeof candidate === 'string' && /^[A-Z_]{1,80}$/.test(candidate) ? candidate : 'INITIALIZATION_FAILED';
    process.stderr.write(JSON.stringify({status: 'INITIALIZATION_REFUSED_OR_UNCONFIRMED', code, automaticRetry: false}) + '\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await firstInitializationMain();
