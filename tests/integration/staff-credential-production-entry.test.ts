/** Dormant B10 acceptance, invoked by the original T45 approved synthetic host.
 * No target creation, import, grants, seed INSERTs, key generation or listener.
 * The host first completes the ORIGINAL current26 import/PUBLISH/readback, then
 * supplies its genuine issuer, reviewed R3/Full configuration and private packet.
 * Running this file alone refuses before reading files or connecting to PG.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {lstat, realpath, readFile} from 'node:fs/promises';
import {isAbsolute, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Pool} from 'pg';
import type {PostgresPoolDriverFactory} from '../../adapters/postgres/src/bounded-pool.ts';
import type {NativeRuntime26Issuer} from '../../adapters/postgres/src/native-import-accounting-capability.ts';
import {checkedNativeRuntime26Capability} from '../../packages/application/src/native-import-schema-contract.ts';
import {parseStaffMaintenanceCommand} from '../../packages/application/src/staff-maintenance-validation.ts';
import type {StaffMaintenanceCommand} from '../../packages/application/src/staff-maintenance-ports.ts';
import type {PostgresApplicationApi} from '../../apps/api/src/postgres-read-api.ts';
import type {CapacityAdmission} from '../../apps/api/src/capacity-admission.ts';
import {readProductionStaffCredentialRequestTag} from '../../apps/api/src/production-main.ts';
import {parseProductionRuntime26R3Configuration, createProductionRuntime26R3ApplicationApi,
  createProductionRuntime26FullApplicationApi} from '../../apps/api/src/production-provider-composition.ts';
import {CURRENT_SALES_QA_TARGET} from './current-runtime26-sales-fixture.ts';

export interface StaffCredentialProductionContext {
  readonly authorization: 'CONFIRMED_NEW_ISOLATED_B10';
  readonly selector: 'R3' | 'Full';
  readonly configuration: unknown;
  readonly issuer: NativeRuntime26Issuer;
  readonly target: {readonly database: string; readonly databaseOid: string; readonly runtimeRole: string; readonly postmasterStart: string};
  /** Real original published batch, never a STAGED assertion or self-signed proof. */
  readonly publication: {readonly batchId: string; readonly sourceHash: string; readonly historyPayloadHash: string};
  readonly privateScenarioFile: string;
  readonly keyAuthorization: {readonly approved: true; readonly canonicalFile: string};
  /** Fresh trusted host resources for each construction; no allow-all test gate. */
  readonly capacityAdmissions: readonly [CapacityAdmission, CapacityAdmission];
}
interface PrivateScenario {
  readonly syntheticOnly: true;
  readonly adminAccountId: string;
  readonly adminStaffId: string;
  readonly adminLoginName: string;
  readonly adminPassword: string;
  readonly create: Extract<StaffMaintenanceCommand, {action: 'CREATE'}>;
  readonly resetPasswords: readonly [string, string];
  readonly unknownCommitPassword: string;
  readonly requestKeys: {readonly resetA: string; readonly resetB: string; readonly lastAdmin: string; readonly unknownCommit: string};
}
async function privateScenario(filename: string): Promise<PrivateScenario> {
  // No values/path/error causes from private inputs are exposed to TAP.
  try {
    assert.ok(isAbsolute(filename) && resolve(filename) === filename && await realpath(filename) === filename);
    const before = await lstat(filename);
    assert.ok(before.isFile() && !before.isSymbolicLink() && before.uid === process.getuid?.()
      && (before.mode & 0o077) === 0 && before.size > 0 && before.size <= 65536);
    const bytes = await readFile(filename), after = await lstat(filename);
    assert.ok(before.dev === after.dev && before.ino === after.ino && before.mtimeMs === after.mtimeMs
      && before.ctimeMs === after.ctimeMs && bytes.length === before.size && after.size === before.size);
    const s = JSON.parse(bytes.toString('utf8')) as PrivateScenario;
    assert.ok(s.syntheticOnly === true && typeof s.adminAccountId === 'string' && typeof s.adminStaffId === 'string'
      && typeof s.adminLoginName === 'string' && typeof s.adminPassword === 'string');
    const command = parseStaffMaintenanceCommand(s.create);
    assert.ok(command.action === 'CREATE' && command.values.role === 'WAREHOUSE' && command.values.hallId === null
      && command.account?.loginEnabled === true && typeof command.account.password === 'string');
    assert.ok(Array.isArray(s.resetPasswords) && s.resetPasswords.length === 2);
    const passwords = [command.account.password, ...s.resetPasswords, s.unknownCommitPassword];
    assert.ok(passwords.every(v => typeof v === 'string' && v.length > 0) && new Set(passwords).size === 4);
    assert.ok(s.requestKeys && Object.values(s.requestKeys).length === 4);
    const keys = [command.requestKey, ...Object.values(s.requestKeys)];
    assert.ok(new Set(keys).size === 5 && keys.every(v => typeof v === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(v)));
    return {...s, create: command};
  } catch { throw new Error('B10 approved private synthetic scenario is missing or invalid'); }
}

/** Real driver below the genuine factory issuer. Never substitutes SQL results.
 * One explicitly armed staff transaction really COMMITs, then loses its ACK.
 * Connection discard and original-key recovery must be observed by the caller.
 */
function commitAcknowledgementFault() {
  let armed = false, faults = 0, discarded = 0, staffWrites = 0;
  const driver: PostgresPoolDriverFactory = config => {
    const raw = new Pool(config);
    return {on: (event, listener) => raw.on(event, listener), end: () => raw.end(), async connect() {
      const client = await raw.connect(); let staffMutation = false, lost = false;
      return {
        on: (event, listener) => client.on(event, listener),
        removeListener: (event, listener) => client.removeListener(event, listener),
        async query(sql, values) {
          const result = await client.query(sql, values);
          if (/^(?:INSERT INTO|UPDATE) naijue_erp\.staff\b/.test(sql)) {staffMutation = true; staffWrites++;}
          if (sql === 'COMMIT' && armed && staffMutation) {
            armed = false; faults++; lost = true;
            throw new Error('B10 synthetic lost acknowledgement after actual COMMIT');
          }
          if (sql === 'COMMIT' || sql === 'ROLLBACK') staffMutation = false;
          return result;
        },
        release(error) {if (lost && error) discarded++; client.release(error);},
      };
    }};
  };
  return {driver, arm() {assert.ok(!armed && faults === 0); armed = true;},
    counts: () => ({faults, discarded, staffWrites})};
}

export async function runStaffCredentialProductionEntry(context: StaffCredentialProductionContext): Promise<void> {
  assert.ok(context?.authorization === 'CONFIRMED_NEW_ISOLATED_B10', 'B10 original approved host required');
  const c = parseProductionRuntime26R3Configuration(context.configuration), target = context.target;
  // QA897 is the currently registered new synthetic target shared sequentially
  // with P01. B10 does not require another database or another bootstrap.
  // Keep the original fixture's exact target; never widen it to arbitrary DBs.
  assert.ok(target && target.database === CURRENT_SALES_QA_TARGET && target.databaseOid === '21551'
    && target.runtimeRole.length > 0, 'Exact registered QA897 synthetic target and OID required');
  assert.ok(context.selector === 'R3' || context.selector === 'Full');
  assert.ok(c.postgres.target.database === target.database && c.postgres.target.user === target.runtimeRole
    && c.staffMaintenance === true && context.keyAuthorization?.approved === true
    && c.staffCredentialRequestKeyFile === context.keyAuthorization.canonicalFile,
  'Reviewed target, selected staff capability and explicitly authorized private key required');
  assert.ok(context.issuer?.pool && context.issuer.runtime26 && context.capacityAdmissions?.length === 2
    && context.capacityAdmissions[0] !== context.capacityAdmissions[1], 'Original issuer and two trusted host resources required');
  const runtime = checkedNativeRuntime26Capability(context.issuer.runtime26);
  assert.ok(runtime, 'Original exact26 issuer required');
  const read = async (sql: string, values: unknown[] = []) => {
    const client = await context.issuer.pool.connect();
    try {await runtime.assertReady(client, 'PRODUCT_MAINTENANCE'); return (await client.query(sql, values)).rows;}
    finally {client.release();}
  };
  const identity = (await read(`SELECT current_database() db,current_user role,session_user,
    (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()) oid,
    pg_catalog.pg_postmaster_start_time()::text started,
    (SELECT rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb FROM pg_catalog.pg_roles WHERE rolname=current_user) elevated,
    ((SELECT pg_catalog.pg_get_userbyid(datdba)=current_user FROM pg_catalog.pg_database WHERE datname=current_database())
      OR (SELECT pg_catalog.pg_get_userbyid(nspowner)=current_user FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp')) owns_database_or_schema,
    EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace='naijue_erp'::regnamespace AND relowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)) owns_relation`))[0];
  assert.ok(identity && identity.db === target.database && identity.oid === target.databaseOid
    && identity.role === target.runtimeRole && identity.session_user === target.runtimeRole
    && identity.started === target.postmasterStart && identity.elevated === false && identity.owns_relation === false
    && identity.owns_database_or_schema === false,
  'Actual nonowner original-session target must match independent review');
  const p = context.publication;
  assert.ok(p && /^[a-f0-9]{64}$/.test(p.sourceHash) && /^[a-f0-9]{64}$/.test(p.historyPayloadHash), 'Actual original publication binding required');
  const published = await read(`SELECT status,history_validation_passed,source_hash,history_payload_hash
    FROM naijue_erp.import_batch WHERE id=$1::uuid`, [p.batchId]);
  assert.ok(published.length === 1 && published[0]!.status === 'IMPORTED' && published[0]!.history_validation_passed === true
    && published[0]!.source_hash === p.sourceHash && published[0]!.history_payload_hash === p.historyPayloadHash,
  'Original complete import/PUBLISH and typed readback must finish before ordinary maintenance; STAGED is forbidden');
  const s = await privateScenario(context.privateScenarioFile);
  const admins = await read(`SELECT a.id,a.staff_id FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id
    WHERE a.login_enabled AND s.role='ADMIN' AND s.employment_status='在职'`);
  assert.ok(admins.length === 1 && admins[0]!.id === s.adminAccountId && admins[0]!.staff_id === s.adminStaffId,
    'Approved synthetic single-admin fixture required for actual LAST_AVAILABLE_ADMIN check; no automatic demotion/seeding');
  const fault = commitAcknowledgementFault(); let api: PostgresApplicationApi | undefined;
  const open = async (index: 0 | 1) => {
    const tag = await readProductionStaffCredentialRequestTag(c); // Original CLI reader + original stable HMAC, no random fallback.
    assert.ok(tag, 'Selected approved stable private credential key required');
    return context.selector === 'Full'
      ? createProductionRuntime26FullApplicationApi(c, fault.driver, tag, context.capacityAdmissions[index])
      : createProductionRuntime26R3ApplicationApi(c, fault.driver, tag, undefined, context.capacityAdmissions[index]);
  };
  try {
    const login = async (loginName: string, password: string) => api!.app.inject({method: 'POST', url: '/auth/login',
      headers: {origin: c.publicOrigin, 'content-type': 'application/json'}, payload: {loginName, password}});
    const cookie = (response: Awaited<ReturnType<typeof login>>) => {
      assert.ok(response.statusCode === 200, 'Actual credential login must succeed');
      const header = response.headers['set-cookie']; assert.ok(typeof header === 'string' && header.startsWith('__Host-naijue_session='), 'Original secure session cookie required');
      return header.split(';')[0]!;
    };
    const command = (body: StaffMaintenanceCommand, adminCookie: string) => api!.app.inject({method: 'POST', url: '/staff/commands',
      headers: {origin: c.publicOrigin, cookie: adminCookie, 'content-type': 'application/json'}, payload: body});
    const accepted = (response: Awaited<ReturnType<typeof command>>) => {
      assert.ok(response.statusCode === 200, 'Actual staff command must commit');
      return response.json<{kind: string; operationId: string; targetId: string; version: number}>();
    };
    const rejected = (response: Awaited<ReturnType<typeof command>>, code: string) => {
      assert.ok(response.statusCode === 409 && response.json<{error: {code: string}}>().error.code === code, 'Original staff rejection must be retained');
    };
    const account = async (staffId: string) => {
      const rows = await read(`SELECT id,version,auth_version FROM naijue_erp.user_account WHERE staff_id=$1::uuid`, [staffId]);
      assert.ok(rows.length === 1, 'Exactly one actual linked account required'); return rows[0]!;
    };
    api = await open(0); let adminCookie = cookie(await login(s.adminLoginName, s.adminPassword));
    const created = accepted(await command(s.create, adminCookie)); assert.ok(created.kind === 'STAFF' && created.version === 1);
    const initialAccount = await account(created.targetId), originalPassword = s.create.account!.password!, loginName = s.create.account!.loginName;
    const oldSessions = [cookie(await login(loginName, originalPassword)), cookie(await login(loginName, originalPassword))];
    await api.close(); api = undefined;
    api = await open(1); adminCookie = cookie(await login(s.adminLoginName, s.adminPassword));
    const writesBeforeReplay = fault.counts().staffWrites;
    assert.ok(JSON.stringify(accepted(await command(s.create, adminCookie))) === JSON.stringify(created), 'Cross-host original-key receipt must match');
    rejected(await command({...s.create, account: {...s.create.account!, password: s.resetPasswords[0]}}, adminCookie), 'IDEMPOTENCY_CONFLICT');
    assert.ok(fault.counts().staffWrites === writesBeforeReplay, 'Replay/conflict must not reapply staff writes');
    const edit = (requestKey: string, password: string): StaffMaintenanceCommand => ({action: 'EDIT', requestKey,
      id: created.targetId, expectedVersion: 1, values: s.create.values,
      account: {...s.create.account!, id: String(initialAccount.id), expectedVersion: Number(initialAccount.version), password}});
    const resetCommands = [edit(s.requestKeys.resetA, s.resetPasswords[0]), edit(s.requestKeys.resetB, s.resetPasswords[1])] as const;
    const resets = await Promise.all(resetCommands.map(body => command(body, adminCookie)));
    assert.ok(resets.filter(r => r.statusCode === 200).length === 1 && resets.filter(r => r.statusCode === 409).length === 1,
      'Concurrent credential reset CAS must have exactly one winner');
    const winner = resets[0]!.statusCode === 200 ? 0 : 1;
    rejected(resets[1 - winner]!, 'VERSION_CONFLICT');
    const changed = accepted(resets[winner]!), afterReset = await account(created.targetId);
    assert.ok(afterReset.auth_version === Number(initialAccount.auth_version) + 1 && afterReset.version === Number(initialAccount.version) + 1,
      'Reset must increment native account and authorization versions once');
    assert.ok((await login(loginName, originalPassword)).statusCode === 401, 'Old password must fail after reset');
    for (const old of oldSessions) {
      const resolved = await api.app.inject({method: 'GET', url: '/auth/session', headers: {cookie: old}});
      assert.ok(resolved.statusCode === 200 && resolved.json<{principal: unknown}>().principal === null, 'Every pre-reset session must be invalid');
    }
    const resetSession = cookie(await login(loginName, s.resetPasswords[winner]));
    const adminVersion = await read('SELECT version FROM naijue_erp.staff WHERE id=$1::uuid', [s.adminStaffId]);
    rejected(await command({action: 'LEAVE', requestKey: s.requestKeys.lastAdmin, id: s.adminStaffId,
      expectedVersion: Number(adminVersion[0]!.version)}, adminCookie), 'LAST_AVAILABLE_ADMIN');
    const unknown: StaffMaintenanceCommand = {action: 'EDIT', requestKey: s.requestKeys.unknownCommit, id: created.targetId,
      expectedVersion: changed.version, values: s.create.values,
      account: {...s.create.account!, id: String(afterReset.id), expectedVersion: Number(afterReset.version), password: s.unknownCommitPassword}};
    const writesBeforeFault = fault.counts().staffWrites; fault.arm();
    const lost = await command(unknown, adminCookie);
    assert.ok(lost.statusCode === 500 && fault.counts().faults === 1 && fault.counts().discarded === 1
      && fault.counts().staffWrites === writesBeforeFault + 1, 'Lost actual COMMIT ACK must discard once, return uncertainty and never auto-retry');
    const receipt = await api.app.inject({method: 'GET', url: `/staff/receipts/${encodeURIComponent(unknown.requestKey)}`,
      headers: {cookie: adminCookie}});
    assert.ok(receipt.statusCode === 200, 'Original request-key receipt must recover actual committed outcome');
    const recovered = receipt.json<{status: string; result: unknown}>();
    assert.ok(recovered.status === 'COMMITTED' && JSON.stringify(accepted(await command(unknown, adminCookie))) === JSON.stringify(recovered.result),
      'Explicit same-key recovery must return the actual original receipt');
    assert.ok(fault.counts().staffWrites === writesBeforeFault + 1, 'Unknown-COMMIT replay cannot mutate twice');
    const afterUnknown = await account(created.targetId);
    assert.ok(afterUnknown.auth_version === Number(afterReset.auth_version) + 1
      && afterUnknown.version === Number(afterReset.version) + 1, 'Unknown-COMMIT recovery must preserve exactly one account version increment');
    const staleResetSession = await api.app.inject({method: 'GET', url: '/auth/session', headers: {cookie: resetSession}});
    assert.ok(staleResetSession.statusCode === 200 && staleResetSession.json<{principal: unknown}>().principal === null,
      'Unknown-COMMIT password reset must revoke the preceding session too');
    cookie(await login(loginName, s.unknownCommitPassword));
    assert.ok((await login(loginName, s.resetPasswords[winner])).statusCode === 401, 'Superseded reset password must fail');
  } catch {
    // Raw HTTP/PG/assertion objects can contain private fixture material. Keep
    // them only in owner-controlled process memory, never TAP/model artifacts.
    throw new Error('B10 real host acceptance failed; owner must inspect private diagnostics without exporting credentials');
  } finally {
    try {if (api) await api.close();} finally {for (const admission of context.capacityAdmissions) admission.close();}
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  test('B10 requires original approved synthetic host context', () => {
    throw new Error('B10 real PG NOT EXECUTED: original host must import runStaffCredentialProductionEntry with exact target/review/published fixture/authorized private key; no connection attempted');
  });
}
