import {constants, openSync, fstatSync, readFileSync, closeSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import type {DatabaseConfig} from '../database/config.js';
import {assertIsolatedTarget, databaseIdentifier as ident} from '../database/config.js';
import {identityRecord} from '../database/identity.js';
import type {DataAccess} from '../database/access.js';
import {assertProductionAdmission, assertProductionSession, productionTarget, type ProductionAdmission} from '../database/production-admission.js';
import {SessionKeys, type SecurityConfig} from './config.js';
import {SecurityError, identifier, object} from './errors.js';
import {SecurityRepository, roleOf, type AccountRow} from './repository.js';
import {firstPasswordCredential} from './passwords.js';
import {approvedInitialEmployees, approvedInitialEmployeePlanSha256, type ApprovedInitialEmployee, type ApprovedInitialEmployeePlan} from './approved-initial-employees.js';
import {assertFirstRealAdministratorState, registerApprovedEmployees, type ApprovedEmployeeRegistration} from './first-real-administrator.js';

interface Binding {readonly personKey: string; readonly employeeId: string; readonly hallId: string | null}
interface Approval {readonly target: string; readonly maintenanceAccountId: string; readonly bindings: ReadonlyMap<string, Binding>; readonly roster: ReadonlyMap<string, ApprovedInitialEmployee>; readonly admission: ProductionAdmission | undefined}
const grantBrand: unique symbol = Symbol('T37-first-initialization');
export interface FirstInitializationGrant {readonly [grantBrand]: true}
const grants = new WeakMap<FirstInitializationGrant, Approval>();

function reject(code: string, status = 403): never {throw new SecurityError(code, status, '首次账号初始化条件未满足，请核对维护授权与目标绑定');}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + canonical(record[key])).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}
function exactFields(record: Record<string, unknown>, fields: readonly string[]): void {
  if (Object.keys(record).sort().join(',') !== [...fields].sort().join(',')) reject('INVALID_INITIALIZATION_BINDING', 400);
}
function allowedTarget(config: DatabaseConfig, admission?: ProductionAdmission): void {
  if (config.environment === 'production') {
    if (!admission) reject('EXPLICIT_PRODUCTION_INITIALIZATION_ADMISSION_REQUIRED');
    assertProductionAdmission(config, admission, 'employee-initialization', approvedInitialEmployeePlanSha256);
    return;
  }
  assertIsolatedTarget(config); // Preserve the existing T08/T09 admission; no production bypass.
  if (config.environment !== 'qa' && config.environment !== 'stage') reject('INITIALIZATION_TARGET_NOT_ADMITTED');
}
export function firstInitializationTarget(config: DatabaseConfig): Record<string, unknown> {
  if (config.environment === 'production') return productionTarget(config);
  return {...identityRecord(config), host: config.host, port: config.port, user: config.user, sslmode: config.sslmode};
}
/** Both binding and secret request files must be explicit, private, owned regular files. */
export function readFirstInitializationFile(path: string): unknown {
  let fd: number | undefined;
  try {
    if (!isAbsolute(path)) reject('PRIVATE_INITIALIZATION_FILE_REQUIRED');
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0 || stat.size < 2 || stat.size > 262144)
      reject('PRIVATE_INITIALIZATION_FILE_REQUIRED');
    return JSON.parse(readFileSync(fd, 'utf8')) as unknown;
  } catch (error) {
    if (error instanceof SecurityError) throw error;
    return reject('PRIVATE_INITIALIZATION_FILE_REQUIRED');
  } finally {if (fd !== undefined) closeSync(fd);}
}
/** This capability cannot be supplied by an HTTP request. Only this file loader issues one. */
export function readFirstInitializationGrant(path: string, config: DatabaseConfig, plan: ApprovedInitialEmployeePlan, admission?: ProductionAdmission): FirstInitializationGrant {
  allowedTarget(config, admission);
  const roster = new Map(approvedInitialEmployees(plan).map(row => [row.personKey, row]));
  const input = object(readFirstInitializationFile(path));
  exactFields(input, ['schemaVersion', 'approvedPlanSha256', 'maintenanceAccountId', 'target', 'employees']);
  if (input['schemaVersion'] !== 'T37-FIRST-INITIALIZATION-BINDING-v1' || input['approvedPlanSha256'] !== approvedInitialEmployeePlanSha256)
    reject('UNAPPROVED_INITIALIZATION_ROSTER');
  const target = canonical(firstInitializationTarget(config));
  if (canonical(input['target']) !== target) reject('INITIALIZATION_TARGET_MISMATCH');
  const maintenanceAccountId = identifier(input['maintenanceAccountId']);
  const entries = input['employees'];
  if (!Array.isArray(entries) || entries.length !== roster.size) reject('UNAPPROVED_INITIALIZATION_ROSTER');
  const bindings = new Map<string, Binding>(), ids = new Set<string>();
  for (const value of entries) {
    const entry = object(value);
    exactFields(entry, ['personKey', 'employeeId', 'hallId']);
    const expected = typeof entry['personKey'] === 'string' ? roster.get(entry['personKey']) : undefined;
    if (!expected || bindings.has(expected.personKey)) reject('UNAPPROVED_INITIALIZATION_ROSTER');
    const employeeId = identifier(entry['employeeId'], true);
    if (ids.has(employeeId) || expected.retainedEmployeeId && expected.retainedEmployeeId !== employeeId)
      reject('INITIALIZATION_EMPLOYEE_BINDING_MISMATCH');
    const hallId = entry['hallId'] === null ? null : identifier(entry['hallId'], true);
    if ((expected.hallCode === null) !== (hallId === null)) reject('INITIALIZATION_HALL_BINDING_MISMATCH');
    ids.add(employeeId);
    bindings.set(expected.personKey, Object.freeze({personKey: expected.personKey, employeeId, hallId}));
  }
  if (config.environment === 'production' && ![...bindings.values()].some(binding => binding.employeeId === maintenanceAccountId && roster.get(binding.personKey)?.role === 'ADMIN'))
    reject('INITIALIZATION_REAL_ADMIN_BINDING_REQUIRED');
  const grant: FirstInitializationGrant = Object.freeze({[grantBrand]: true as const});
  grants.set(grant, Object.freeze({target, maintenanceAccountId, bindings, roster, admission}));
  return grant;
}

/** Maintenance-only credential attachment to already registered, source-bound employee records. */
export class FirstEmployeeInitializer {
  #config: DatabaseConfig;
  #keys: SessionKeys;
  #admission: ProductionAdmission | undefined;
  constructor(private readonly access: DataAccess, config: DatabaseConfig, security: SecurityConfig, admission?: ProductionAdmission) {
    allowedTarget(config, admission);
    this.#admission = admission;
    this.#config = Object.freeze({...config, schemas: Object.freeze({...config.schemas}), roles: Object.freeze({...config.roles})});
    this.#keys = new SessionKeys(security, this.#config);
  }
  async initialize(grant: FirstInitializationGrant, maintenanceToken: string, input: unknown): Promise<{initialized: number; personKeys: string[]}> {
    this.#approval(grant);
    if (typeof maintenanceToken !== 'string' || !/^[a-f0-9]{64}$/.test(maintenanceToken)) reject('UNAUTHENTICATED', 401);
    return this.#initialize(grant, input, this.#keys.sessionDigest(maintenanceToken));
  }
  async registerApprovedEmployees(grant: FirstInitializationGrant, registration: ApprovedEmployeeRegistration): Promise<{registered: number; existing: number}> {
    if (this.#config.environment !== 'production' || !this.#admission) reject('FIRST_REAL_ADMIN_PRODUCTION_ONLY');
    const approval = this.#approval(grant);
    return this.access.transaction(async session => {
      await session.lock([{scope: 'reference', key: 'authorization-objects'}, {scope: 'reference', key: 'auth-accounts'}]);
      await assertProductionSession(session, this.#config, this.#admission!, 'employee-initialization', approvedInitialEmployeePlanSha256);
      return registerApprovedEmployees(session, this.#config, [...approval.bindings.values()].map(binding => ({...binding, expected: approval.roster.get(binding.personKey)!})), registration, approval.maintenanceAccountId, this.#admission!);
    });
  }
  /** Dedicated maintenance bootstrap: only the bound approved real ADMIN, without manufacturing a session/account. */
  async initializeFirstRealAdministrator(grant: FirstInitializationGrant, initialPassword: unknown): Promise<{initialized: number; personKeys: string[]}> {
    if (this.#config.environment !== 'production' || !this.#admission) reject('FIRST_REAL_ADMIN_PRODUCTION_ONLY');
    const approval = this.#approval(grant);
    const binding = [...approval.bindings.values()].find(row => row.employeeId === approval.maintenanceAccountId && approval.roster.get(row.personKey)?.role === 'ADMIN');
    if (!binding) reject('INITIALIZATION_REAL_ADMIN_BINDING_REQUIRED');
    return this.#initialize(grant, {personKeys: [binding.personKey], initialPassword}, null);
  }
  #approval(grant: FirstInitializationGrant): Approval {
    const approval = grants.get(grant);
    if (!approval || approval.target !== canonical(firstInitializationTarget(this.#config)) || approval.admission !== this.#admission) reject('UNAUTHORIZED_FIRST_INITIALIZATION');
    allowedTarget(this.#config, this.#admission);
    return approval;
  }
  async #initialize(grant: FirstInitializationGrant, input: unknown, digest: string | null): Promise<{initialized: number; personKeys: string[]}> {
    const approval = this.#approval(grant);
    const roster = approval.roster;
    const request = object(input);
    exactFields(request, ['personKeys', 'initialPassword']);
    const password = request['initialPassword'], keys = request['personKeys'];
    if (typeof password !== 'string' || password.length !== 6 || Buffer.byteLength(password) > 1024) reject('INITIAL_PASSWORD_POLICY', 400);
    if (!Array.isArray(keys) || keys.length < 1 || keys.length > roster.size || new Set(keys).size !== keys.length)
      reject('UNAPPROVED_INITIALIZATION_ROSTER');
    const selected = keys.map(key => {
      const expected = typeof key === 'string' ? roster.get(key) : undefined;
      const binding = expected && approval.bindings.get(expected.personKey);
      if (!expected || !binding) return reject('UNAPPROVED_INITIALIZATION_ROSTER');
      return {expected, binding};
    });
    const validation = digest === null ? [...roster.values()].map(expected => ({expected, binding: approval.bindings.get(expected.personKey)!})) : selected;
    return this.access.transaction(async session => {
      await session.lock([{scope: 'reference', key: 'authorization-objects'}, {scope: 'reference', key: 'auth-accounts'},
        ...(digest === null ? [] : [{scope: 'reference' as const, key: 'auth-session:' + digest}])]);
      allowedTarget(this.#config, this.#admission); // Recheck signed capability after any lock wait, before writes.
      if (this.#admission) await assertProductionSession(session, this.#config, this.#admission, 'employee-initialization', approvedInitialEmployeePlanSha256);
      const repo = new SecurityRepository(session, this.#config);
      const live = (await session.query<{database: string; user: string; identity: unknown}>(`SELECT current_database() AS database,current_user AS "user",
        (SELECT identity FROM ${ident(this.#config.schemas.control)}.environment_identity WHERE singleton) AS identity`)).rows[0];
      if (!live || live.database !== this.#config.database || live.user !== this.#config.user || canonical(live.identity) !== canonical(identityRecord(this.#config)))
        reject('INITIALIZATION_TARGET_MISMATCH');
      let actorId: string;
      if (digest === null) {
        await assertFirstRealAdministratorState(session, this.#config, [...approval.bindings.values()].map(binding => binding.employeeId));
        actorId = approval.maintenanceAccountId;
      } else {
        const actor = await repo.actor(await repo.sessionAccount(digest, true));
        if (actor.role !== 'ADMIN' || actor.id !== approval.maintenanceAccountId) reject('FORBIDDEN');
        actorId = actor.id;
      }
      const pending: {expected: ApprovedInitialEmployee; binding: Binding; row: AccountRow; phone: string}[] = [];
      const phones = new Set<string>();
      // Validate the whole request before generating credentials or writing any account.
      for (const {expected, binding} of validation) {
        const row = (await session.query<AccountRow>(`SELECT id,login_name,body,password_salt,password_hash,version
          FROM ${repo.auth}.employee_login WHERE id=$1 FOR UPDATE`, [binding.employeeId])).rows[0];
        if (!row) reject('INITIALIZATION_EMPLOYEE_NOT_REGISTERED', 409);
        if (row.password_salt !== null || row.password_hash !== null) reject('ALREADY_INITIALIZED', 409);
        if (row.body['employmentStatus'] !== '在职' || row.body['enabled'] === false || row.body['loginEnabled'] === true || roleOf(row.body['role']) !== expected.role)
          reject('INITIALIZATION_EMPLOYEE_STATE_MISMATCH', 409);
        const hallId = row.body['hallId'] ?? row.body['storeId'] ?? null;
        if (hallId !== binding.hallId || row.body['storeId'] && row.body['storeId'] !== hallId) reject('INITIALIZATION_HALL_BINDING_MISMATCH');
        const source = (await session.query<{source_code: string | null}>(`SELECT source_code FROM ${repo.source}.tplus_employee WHERE id=$1::uuid`, [row.id])).rows;
        if (expected.retainedEmployeeId ? !source.length || source.some(item => item.source_code !== expected.sourceEmployeeCode) || row.body['code'] !== expected.sourceEmployeeCode : source.length > 0)
          reject('INITIALIZATION_EMPLOYEE_BINDING_MISMATCH');
        if (binding.hallId) {
          const hall = (await session.query<{code: string | null}>(`SELECT coalesce(
            (SELECT body->>'code' FROM ${repo.runtime}.master_data_entity WHERE kind='halls' AND id=$1),
            (SELECT source_code FROM ${repo.source}.tplus_hall WHERE id=$1::uuid ORDER BY batch_id DESC LIMIT 1)) AS code`, [binding.hallId])).rows[0];
          if (hall?.code !== expected.hallCode || !await repo.hallExists(binding.hallId)) reject('INITIALIZATION_HALL_BINDING_MISMATCH');
        }
        const phone = row.body['phone'];
        if (typeof phone !== 'string' || !/^1[3-9][0-9]{9}$/.test(phone) || phones.has(phone) || typeof row.body['name'] !== 'string' || !row.body['name'].trim())
          reject('INITIALIZATION_EMPLOYEE_INPUT_INVALID', 409);
        if (row.login_name && row.login_name !== phone) reject('INITIALIZATION_LOGIN_CONFLICT', 409);
        if ((await session.query(`SELECT id FROM ${repo.auth}.employee_login WHERE id<>$2
          AND (login_name=$1 OR (id=ANY($3::text[]) AND body->>'phone'=$1))`,
          [phone, row.id, [...approval.bindings.values()].map(item => item.employeeId)])).rowCount)
          reject('INITIALIZATION_LOGIN_CONFLICT', 409);
        phones.add(phone);
        pending.push({expected, binding, row, phone});
      }
      const writes = digest === null ? pending.filter(item => item.expected.personKey === selected[0]?.expected.personKey) : pending;
      if (digest === null && (writes.length !== 1 || writes[0]?.expected.role !== 'ADMIN' || writes[0].row.id !== actorId)) reject('INITIALIZATION_REAL_ADMIN_BINDING_REQUIRED');
      for (const {expected, binding, row, phone} of writes) {
        const credential = await firstPasswordCredential(password);
        const body: Record<string, unknown> = {...row.body, loginEnabled: true, loginName: phone, hallId: binding.hallId, storeId: binding.hallId};
        await session.query(`UPDATE ${repo.auth}.employee_login SET login_name=$2,body=$3::jsonb,password_salt=$4,password_hash=$5,version=version+1,updated_at=now() WHERE id=$1`,
          [row.id, phone, JSON.stringify(body), credential.salt, credential.hash]);
        await session.query(`DELETE FROM ${repo.auth}.employee_session WHERE employee_id=$1`, [row.id]);
        await session.query(`INSERT INTO ${repo.runtime}.operator(id,name,role,enabled) VALUES($1,$2,$3,true)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,enabled=true`, [row.id, String(body['name']), expected.role]);
        await session.query(`INSERT INTO ${repo.auth}.employee_account_audit(actor_id,employee_id,action,changes) VALUES($1,$2,$3,$4::jsonb)`,
          [actorId, row.id, digest === null ? '首个真实管理员初始化登录' : '首次初始化登录', JSON.stringify([{field: 'credential', before: null, after: '已初始化'}, {field: 'loginEnabled', before: false, after: true}])]);
      }
      return {initialized: writes.length, personKeys: writes.map(item => item.expected.personKey)};
    });
  }
}
