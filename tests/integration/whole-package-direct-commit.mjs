/** Opt-in REAL PostgreSQL acceptance cases. NOT EXECUTED by registration.
 * Supply createSyntheticPgSetup(config, WHOLE_DIRECT_COMMIT_MODES) from the
 * existing explicit local synthetic setup only after target authorization.
 * Supply separately verified expectedTargets physical identities for all cases;
 * no observed identity is promoted to an approved target automatically.
 * This module creates no connection, reads no configuration, installs nothing
 * and cannot authorize execution. Each case needs a distinct new-empty target. */
import assert from 'node:assert/strict';
import { admitWholePackageAcceptanceTarget, admitWholeBatchClosureAcceptanceTargetV1 } from './whole-package-acceptance-admission.mjs';
export const WHOLE_DIRECT_COMMIT_MODES = Object.freeze([
  'prepare-direct-commit-failure', 'baseline-direct-commit-failure', 'complete-direct-commit-success',
]);
const activeCaseClients = new WeakSet();
const initializer = 'erp_unified27_initializer_2393dbc6db9581c2';
const importer = 'erp_unified27_importer_2393dbc6db9581c2';
const phases = { masterChunk: 'MASTER', baselineKeys: 'KEYS', documentChunk: 'DOCUMENTS', publish: 'PUBLISH' };
async function control(client, sql, command) { assert.equal((await client.query(sql)).command, command); }
async function call(client, sql, values) {
  const result = await client.query(sql, values);
  assert.equal(result.command, 'SELECT'); assert.equal(result.rowCount, 1);
  return result.rows[0].result;
}
async function target(client) {
  const result = await client.query("SELECT current_database() AS database_name, (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()) AS database_oid, pg_catalog.host(pg_catalog.inet_server_addr()) AS server_address, inet_server_port() AS server_port, (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) AS system_identifier, current_user=session_user AS unaltered_role");
  assert.equal(result.command, 'SELECT'); assert.equal(result.rowCount, 1);
  const row = result.rows[0];
  assert.match(row.database_name, /^synthetic_whole_[a-z0-9_]{1,48}$/);
  assert.match(row.database_oid, /^[1-9][0-9]*$/);
  assert.ok(['127.0.0.1', '::1'].includes(row.server_address));
  assert.match(row.system_identifier, /^[1-9][0-9]*$/);
  assert.equal(row.unaltered_role, true);
  return { database_name: row.database_name, database_oid: row.database_oid, system_identifier: row.system_identifier, server_address: row.server_address, server_port: row.server_port };
}
export function registerWholePackageDirectCommit(register, setup, expectedTargets, selectedMode, windowAcknowledgment, catalogProfile = 'ORIGINAL_WHOLE177') {
  if (typeof register !== 'function' || typeof setup !== 'function') throw Error('EXPLICIT_SYNTHETIC_SETUP_REQUIRED');
  if (!expectedTargets || Object.keys(expectedTargets).sort().join() !== [...WHOLE_DIRECT_COMMIT_MODES].sort().join()) throw Error('EXPLICIT_SYNTHETIC_TARGET_BINDINGS_REQUIRED');
  expectedTargets = structuredClone(expectedTargets);
  const approvedPhysicalTargets = new Set();
  for (const entry of Object.values(expectedTargets)) {
    if (!entry || Object.keys(entry).sort().join() !== 'database_name,database_oid,server_address,server_port,system_identifier' ||
        typeof entry.database_name !== 'string' || !/^synthetic_whole_[a-z0-9_]{1,48}$/.test(entry.database_name) ||
        typeof entry.database_oid !== 'string' || !/^[1-9][0-9]*$/.test(entry.database_oid) ||
        typeof entry.system_identifier !== 'string' || !/^[1-9][0-9]*$/.test(entry.system_identifier) ||
        !['127.0.0.1', '::1'].includes(entry.server_address) || !Number.isSafeInteger(entry.server_port) || entry.server_port < 1024 || entry.server_port > 65535)
      throw Error('EXPLICIT_SYNTHETIC_TARGET_BINDINGS_REQUIRED');
    const physicalKey = entry.system_identifier + ':' + entry.database_oid;
    if (approvedPhysicalTargets.has(physicalKey)) throw Error('DISTINCT_PHYSICAL_SYNTHETIC_TARGETS_REQUIRED');
    approvedPhysicalTargets.add(physicalKey);
  }
  if (selectedMode !== undefined && !WHOLE_DIRECT_COMMIT_MODES.includes(selectedMode)) throw Error('DIRECT_COMMIT_CASE_INVALID');
  if (!windowAcknowledgment || windowAcknowledgment.exclusiveClients !== true || windowAcknowledgment.noConcurrentDdlAclAdminChanges !== true) throw Error('EXCLUSIVE_ACCEPTANCE_WINDOW_ACK_REQUIRED');
  // This acknowledgment is an operational prerequisite, not a lock or authority.
  if (!['ORIGINAL_WHOLE177', 'WHOLE_BATCH_CLOSURE_V1'].includes(catalogProfile)) throw Error('ACCEPTANCE_CATALOG_PROFILE_INVALID');
  const seenTargets = new Set();
  for (const mode of selectedMode === undefined ? WHOLE_DIRECT_COMMIT_MODES : [selectedMode]) register('actual SQL deferred direct commit: ' + mode, async () => {
    const f = await setup(mode);
    const { writer, observer, snapshot, encodedScrypt } = f;
    let began = false;
    if (activeCaseClients.has(writer) || activeCaseClients.has(observer)) {
      // A malformed setup may pair an already-owned client with a fresh one.
      // Its close callback could close the active client, so close only distinct
      // unclaimed clients directly and leave the active case's ownership intact.
      const unclaimed = [...new Set([writer, observer])].filter(client => !activeCaseClients.has(client));
      await Promise.allSettled(unclaimed.map(client => Promise.resolve().then(() => client.end())));
      throw Error('ACCEPTANCE_CLIENT_ALREADY_IN_USE');
    }
    activeCaseClients.add(writer); activeCaseClients.add(observer);
    try {
      assert.equal(f.syntheticIsolated, true); assert.notEqual(writer, observer);
      const bound = await target(writer); assert.deepEqual(bound, expectedTargets[mode], 'Writer must match the separately approved physical target'); assert.deepEqual(await target(observer), bound);
      const targetKey = bound.system_identifier + ':' + bound.database_oid; assert.equal(seenTargets.has(targetKey), false, 'Each case requires a fresh distinct synthetic target'); seenTargets.add(targetKey);
      if (catalogProfile === 'WHOLE_BATCH_CLOSURE_V1') await admitWholeBatchClosureAcceptanceTargetV1(writer);
      else await admitWholePackageAcceptanceTarget(writer);
      const initialize = structuredClone(f.initialize), steps = structuredClone(f.steps);
      assert.ok(steps.length >= 3);
      const baselineIndex = steps.findIndex(s => s.method === 'publish' && s.request.payload.phase === 'BASELINE');
      assert.ok(baselineIndex >= 0);
      const before = await snapshot(observer);
      assert.equal(before.tables?.schema_migration?.count, '27', 'Installed synthetic lineage required');
      assert.ok(Object.entries(before.tables).every(([name, table]) => name === 'schema_migration' || table.count === '0'), 'Every synthetic business/audit table must be empty');
      const inspect = () => call(writer, 'SELECT naijue_erp.standard_whole_package_inspect_v2($1::jsonb,$2::text) AS result', [initialize, encodedScrypt]);
      await control(writer, 'BEGIN ISOLATION LEVEL READ COMMITTED', 'BEGIN'); began = true;
      await control(writer, `SET LOCAL ROLE ${initializer}`, 'SET');
      assert.equal((await inspect()).state, 'ABSENT');
      await call(writer, 'SELECT naijue_erp.standard_whole_package_prepare_v2($1::jsonb,$2::text) AS result', [initialize, encodedScrypt]);
      await control(writer, `SET LOCAL ROLE ${importer}`, 'SET');
      const limit = mode === 'prepare-direct-commit-failure' ? 0 : mode === 'baseline-direct-commit-failure' ? baselineIndex + 1 : steps.length;
      for (let i = 0; i < limit; i++) {
        const step = steps[i]; assert.ok(phases[step.method]);
        const result = await call(writer, 'SELECT naijue_erp.standard_whole_package_step_v2($1::uuid,$2::integer,$3::text,$4::jsonb) AS result', [initialize.operation_id, i + 1, phases[step.method], step.request]);
        assert.equal(result.state, 'PENDING_TRANSACTION');
        assert.deepEqual(await snapshot(observer), before, 'Uncommitted prefix must remain invisible');
      }
      assert.deepEqual(await snapshot(observer), before);
      if (mode.endsWith('-failure')) {
        await assert.rejects(() => writer.query('COMMIT'), error => error.code === '23514' && /WHOLE_PACKAGE_INCOMPLETE/.test(error.message));
        began = false;
        assert.deepEqual(await snapshot(observer), before, 'Rejected direct COMMIT leaves no business/audit/counter state');
      } else {
        await control(writer, 'COMMIT', 'COMMIT'); began = false;
        assert.notDeepEqual(await snapshot(observer), before);
      }
      const after = await snapshot(observer);
      await control(writer, 'BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY', 'BEGIN'); began = true;
      await control(writer, `SET LOCAL ROLE ${initializer}`, 'SET');
      const receipt = await inspect();
      assert.equal(receipt.state, mode.endsWith('-failure') ? 'ABSENT' : 'COMMITTED');
      if (receipt.state === 'COMMITTED') await f.assertPublished(observer, receipt.summary);
      await control(writer, 'ROLLBACK', 'ROLLBACK'); began = false;
      assert.deepEqual(await snapshot(observer), after, 'Exact-key inspection is nonmutating');
    } finally {
      try { if (began) await control(writer, 'ROLLBACK', 'ROLLBACK'); }
      finally {
        try { await f.close(); }
        catch (error) {
          // The shared fixture closes sequentially. A first close failure must
          // not prevent an attempt to close the other physical connection.
          await Promise.allSettled([writer, observer].map(client => Promise.resolve().then(() => client.end())));
          throw error;
        } finally { activeCaseClients.delete(writer); activeCaseClients.delete(observer); }
      }
    }
  });
}
