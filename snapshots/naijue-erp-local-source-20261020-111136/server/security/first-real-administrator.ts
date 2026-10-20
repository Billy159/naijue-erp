import type {DatabaseConfig} from '../database/config.js';
import {databaseIdentifier as ident} from '../database/config.js';
import type {DataSession} from '../database/session.js';
import {object, SecurityError} from './errors.js';
import {constants, openSync, fstatSync, readFileSync, closeSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {isAbsolute} from 'node:path';
import {approvedInitialEmployees, approvedInitialEmployeePlanSha256, approvedInitialPrivateResourceSha256, readApprovedInitialEmployeePlan, type ApprovedInitialEmployee} from './approved-initial-employees.js';
import {SecurityRepository, roleOf, type AccountRow} from './repository.js';
import {assertProductionAdmission, type ProductionAdmission} from '../database/production-admission.js';

interface RegistrationInput {readonly name: string; readonly phone: string; readonly expected: ApprovedInitialEmployee}
const registrationBrand: unique symbol = Symbol('approved-employee-registration');
export interface ApprovedEmployeeRegistration {readonly [registrationBrand]: true}
const registrations = new WeakMap<ApprovedEmployeeRegistration, ReadonlyMap<string, RegistrationInput>>();

/** Read only the already pinned complete original plan, never request-supplied employee data. */
export function readApprovedEmployeeRegistration(path: string): ApprovedEmployeeRegistration {
  const plan = readApprovedInitialEmployeePlan(path), roster = approvedInitialEmployees(plan);
  let fd: number | undefined;
  try {
    if (!isAbsolute(path)) throw new Error();
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0 || stat.size > 2097152) throw new Error();
    const bytes = readFileSync(fd);
    if (createHash('sha256').update(bytes).digest('hex') !== approvedInitialPrivateResourceSha256) throw new Error();
    const bundle = object(JSON.parse(bytes.toString('utf8')) as unknown), source = object(bundle['sourcePlan']);
    if (typeof source['bytesBase64'] !== 'string') throw new Error();
    const originalBytes = Buffer.from(source['bytesBase64'], 'base64');
    if (createHash('sha256').update(originalBytes).digest('hex') !== approvedInitialEmployeePlanSha256) throw new Error();
    const original = object(JSON.parse(originalBytes.toString('utf8')) as unknown), rows = original['employees'];
    if (!Array.isArray(rows) || rows.length !== 49) throw new Error();
    const inputs = new Map<string, RegistrationInput>(), phones = new Set<string>();
    for (const value of rows) {
      const row = object(value), expected = roster.find(item => item.personKey === row['currentPersonKey']);
      const name = row['name'], phone = row['phone'];
      if (!expected || inputs.has(expected.personKey) || row['role'] !== expected.role || row['hallCode'] !== expected.hallCode
        || row['plannedPreservedEmployeeId'] !== expected.retainedEmployeeId || row['primarySourceEmployeeCode'] !== expected.sourceEmployeeCode
        || row['loginRequestedByUser'] !== true || row['employmentStatusRequested'] !== '在职'
        || typeof name !== 'string' || !name.trim() || typeof phone !== 'string' || !/^1[3-9][0-9]{9}$/.test(phone) || phones.has(phone)) throw new Error();
      inputs.set(expected.personKey, Object.freeze({name, phone, expected})); phones.add(phone);
    }
    const result: ApprovedEmployeeRegistration = Object.freeze({[registrationBrand]: true as const});
    registrations.set(result, inputs); return result;
  } catch {throw new SecurityError('APPROVED_EMPLOYEE_REGISTRATION_INPUT_REQUIRED');}
  finally {if (fd !== undefined) closeSync(fd);}
}

export interface EmployeeRegistrationBinding {readonly expected: ApprovedInitialEmployee; readonly employeeId: string; readonly hallId: string | null}
/** The caller supplies only loader-owned grants; validate all inputs and existing facts before inserting any row. */
export async function registerApprovedEmployees(session: DataSession, config: DatabaseConfig, bindings: readonly EmployeeRegistrationBinding[],
  registration: ApprovedEmployeeRegistration, maintenanceAccountId: string, admission: ProductionAdmission): Promise<{registered: number; existing: number}> {
  assertProductionAdmission(config, admission, 'employee-initialization', approvedInitialEmployeePlanSha256);
  const inputs = registrations.get(registration);
  if (!inputs || bindings.length !== 49 || !bindings.some(row => row.employeeId === maintenanceAccountId && row.expected.role === 'ADMIN'))
    throw new SecurityError('APPROVED_EMPLOYEE_REGISTRATION_INPUT_REQUIRED');
  const repo = new SecurityRepository(session, config), current = (await session.query<AccountRow>(`SELECT id,login_name,body,password_salt,password_hash,version FROM ${repo.auth}.employee_login FOR UPDATE`)).rows;
  const byId = new Map(current.map(row => [row.id, row])), ids = new Set(bindings.map(row => row.employeeId));
  if (ids.size !== 49 || current.some(row => !ids.has(row.id) || row.password_salt !== null || row.password_hash !== null || row.body['loginEnabled'] === true)
    || (await session.query(`SELECT 1 FROM ${repo.auth}.employee_session LIMIT 1`)).rowCount
    || (await session.query(`SELECT 1 FROM ${repo.auth}.employee_account_audit WHERE action IN ('首次初始化登录','首个真实管理员初始化登录') LIMIT 1`)).rowCount)
    throw new SecurityError('APPROVED_EMPLOYEE_REGISTRATION_ALREADY_OCCUPIED', 409);
  const pending: {id: string; body: Record<string, unknown>}[] = [];
  for (const binding of bindings) {
    const {expected, employeeId, hallId} = binding, input = inputs.get(expected.personKey);
    if (!input || input.expected.role !== expected.role || input.expected.hallCode !== expected.hallCode || input.expected.retainedEmployeeId !== expected.retainedEmployeeId
      || input.expected.sourceEmployeeCode !== expected.sourceEmployeeCode) throw new SecurityError('APPROVED_EMPLOYEE_REGISTRATION_INPUT_REQUIRED');
    const source = (await session.query<{source_code: string | null}>(`SELECT source_code FROM ${repo.source}.tplus_employee WHERE id=$1::uuid`, [employeeId])).rows;
    if (expected.retainedEmployeeId ? expected.retainedEmployeeId !== employeeId || !source.length || source.some(row => row.source_code !== expected.sourceEmployeeCode) : source.length > 0)
      throw new SecurityError('INITIALIZATION_EMPLOYEE_BINDING_MISMATCH');
    if (hallId) {
      const hall = (await session.query<{code: string | null}>(`SELECT coalesce(
        (SELECT body->>'code' FROM ${repo.runtime}.master_data_entity WHERE kind='halls' AND id=$1),
        (SELECT source_code FROM ${repo.source}.tplus_hall WHERE id=$1::uuid ORDER BY batch_id DESC LIMIT 1)) AS code`, [hallId])).rows[0];
      if (hall?.code !== expected.hallCode || !await repo.hallExists(hallId)) throw new SecurityError('INITIALIZATION_HALL_BINDING_MISMATCH');
    } else if (expected.hallCode !== null) throw new SecurityError('INITIALIZATION_HALL_BINDING_MISMATCH');
    const existing = byId.get(employeeId);
    if (existing) {
      const body = existing.body;
      if (body['name'] !== input.name || body['phone'] !== input.phone || roleOf(body['role']) !== expected.role || body['employmentStatus'] !== '在职'
        || body['enabled'] === false || (body['hallId'] ?? body['storeId'] ?? null) !== hallId || body['storeId'] && body['storeId'] !== hallId
        || existing.login_name && existing.login_name !== input.phone || expected.sourceEmployeeCode !== null && body['code'] !== expected.sourceEmployeeCode)
        throw new SecurityError('APPROVED_EMPLOYEE_REGISTRATION_CONFLICT', 409);
    } else {
      pending.push({id: employeeId, body: {name: input.name, phone: input.phone, code: expected.sourceEmployeeCode ?? '', role: expected.role,
        employmentStatus: '在职', enabled: true, loginEnabled: false, hallId, storeId: hallId,
        sourceFacts: {currentPersonKey: expected.personKey, approvedPlanSha256: approvedInitialEmployeePlanSha256, originalEmployeeId: expected.retainedEmployeeId, originalEmployeeCode: expected.sourceEmployeeCode}}});
    }
  }
  for (const row of pending) {
    await session.query(`INSERT INTO ${repo.auth}.employee_login(id,body) VALUES($1,$2::jsonb)`, [row.id, JSON.stringify(row.body)]);
    await session.query(`INSERT INTO ${repo.auth}.employee_account_audit(actor_id,employee_id,action,changes) VALUES($1,$2,$3,$4::jsonb)`,
      [maintenanceAccountId, row.id, '登记批准首批员工', JSON.stringify([{field: 'registration', before: null, after: '已登记'}])]);
  }
  return {registered: pending.length, existing: current.length};
}

/** This adapter creates no accounts or sessions. The caller has already verified the T09 signed maintenance capability. */
export function firstRealAdministratorRequest(input: unknown): unknown {
  const request = object(input);
  if (Object.keys(request).sort().join(',') !== ['operation', 'initialPassword'].sort().join(',') || request['operation'] !== 'first-real-administrator')
    throw new SecurityError('INVALID_FIRST_REAL_ADMIN_REQUEST');
  return request['initialPassword'];
}

/** Run inside the initializer's single locked transaction, after actual target readback and before any credential write. */
export async function assertFirstRealAdministratorState(session: DataSession, config: DatabaseConfig, approvedIds: readonly string[]): Promise<void> {
  const auth = ident(config.schemas.auth);
  const result = await session.query<{registered: number; occupied: boolean}>(`SELECT
    (SELECT count(*)::integer FROM ${auth}.employee_login WHERE id=ANY($1::text[])) AS registered,
    (EXISTS(SELECT 1 FROM ${auth}.employee_login WHERE NOT (id=ANY($1::text[])) OR password_salt IS NOT NULL OR password_hash IS NOT NULL OR body @> '{"loginEnabled":true}'::jsonb)
      OR EXISTS(SELECT 1 FROM ${auth}.employee_session)
      OR EXISTS(SELECT 1 FROM ${auth}.employee_account_audit WHERE action IN ('首次初始化登录','首个真实管理员初始化登录'))) AS occupied`, [approvedIds]);
  if (approvedIds.length !== 49 || new Set(approvedIds).size !== 49 || result.rows[0]?.registered !== 49)
    throw new SecurityError('FIRST_REAL_ADMIN_REQUIRES_COMPLETE_REGISTRATION', 409);
  if (result.rows[0]?.occupied !== false) throw new SecurityError('FIRST_REAL_ADMIN_ALREADY_INITIALIZED_OR_OCCUPIED', 409);
}
