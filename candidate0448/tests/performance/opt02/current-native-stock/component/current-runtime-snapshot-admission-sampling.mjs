/** TEST ONLY. Finite original service + same-RR SQL differential, not OPT02
 * acceptance or permission equivalence. No connection/issuer/SQL injection.
 * Import creates no PG target, connection, sample, timer or server. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { captureData } from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
import { currentRuntimeBusinessContextData } from './current-runtime-business.mjs';
import { assertCurrentRuntimeQueryMetrics } from './current-runtime-query-metrics.mjs';
import { need, freeze, assertFixture } from './fixture.mjs';
import { createPrototypeSources, prototypeStatements, SOURCE_PINS } from '../../snapshot-admission-prototype/snapshot-admission.mjs';
import { stockReadiness, stockAdditionEvidence, matched, listValues } from './original-stock-readiness-bridge.ts';
import { acquireReadClient, awaitRead } from '../../../../../adapters/postgres/src/cancellable-read.ts';
import { catalogueRetainedDeleteEnabled, productSeasonArrayEnabled } from '../../../../../adapters/postgres/src/product-query-reader.ts';
import { PostgresProductManagementQueryReader } from '../../../../../adapters/postgres/src/product-management-query-reader.ts';
import { sourceConfirmedReadIdentityOn } from '../../../../../adapters/postgres/src/source-confirmed-read-authorization.ts';
import { createSourceConfirmedApplicationReadAuthorization } from '../../../../../apps/api/src/postgres-read-api.ts';
import { createProductManagementQueryService } from '../../../../../packages/application/src/product-management-query-service.ts';
import { parseProductManagementListQuery, checkedProductManagementGrant, checkedProductManagementListPage, activeProductManagementRead } from '../../../../../packages/application/src/product-management-query-validation.ts';
import { DomainError } from '../../../../../packages/domain/src/errors.ts';

export const SAMPLING_STATUS = 'PASS_FINITE_SNAPSHOT_ADMISSION_ONLY_NOT_OPT02_ACCEPTANCE';
const snapshotObservationSql = `/* finite-sampling:actual-read-snapshot */ SELECT
  current_setting('transaction_isolation') AS isolation,
  current_setting('transaction_read_only') AS read_only, pg_current_snapshot()::text AS snapshot,
  current_user::text AS current_role, session_user::text AS session_role,
  current_user = pg_get_userbyid((SELECT datdba FROM pg_database WHERE datname=current_database())) AS database_owner,
  (SELECT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
    AND NOT rolreplication AND NOT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS ordinary_login`;
const root = new URL('../../../../../', import.meta.url);
const readerPath = 'adapters/postgres/src/product-management-query-reader.ts';
const admissionPath = 'adapters/postgres/migrations/0023_inventory_key_admission.sql';
const bridgePath = 'tests/performance/opt02/current-native-stock/component/original-stock-readiness-bridge.ts';
const suffix = '\n// TEST-INSTRUMENTED EXPORT BRIDGE: original bodies/SQL unchanged.\nexport { stockReadiness, stockAdditionEvidence, matched, listValues };\n';
const sha = text => createHash('sha256').update(text).digest('hex');
const json = value => freeze(JSON.parse(JSON.stringify(value)));

/** Assertion-only source parity: fixed paths, not a caller supplied loader. */
export function verifyOriginalStockReadinessBridge() {
  const reader = readFileSync(new URL(readerPath, root), 'utf8');
  const admission = readFileSync(new URL(admissionPath, root), 'utf8');
  const bridge = readFileSync(new URL(bridgePath, root), 'utf8');
  need(sha(reader) === SOURCE_PINS.reader && sha(admission) === SOURCE_PINS.admission, 'PINNED_ORIGINAL_STOCK_SOURCE_REQUIRED');
  const relocated = reader.replace(/from (['"])([^'"]+)\1/g, (whole, quote, target) => {
    let relative;
    if (target.startsWith('./')) relative = '../../../../../adapters/postgres/src/' + target.slice(2);
    else if (target.startsWith('../../../')) relative = '../../../../../' + target.slice(9);
    else throw Error('ONLY_ORIGINAL_FIXED_RELATIVE_IMPORTS_ALLOWED');
    return 'from ' + quote + relative + quote;
  });
  assert.equal(bridge, relocated + suffix, 'Complete original reader bodies/SQL must be byte identical after fixed import relocation');
  return { sources: createPrototypeSources({ readerSourceText: reader, admissionSourceText: admission }),
    proof: freeze({ reader: { path: readerPath, sha256: sha(reader) }, admission: { path: admissionPath, sha256: sha(admission) },
      bridge: { path: bridgePath, sha256: sha(bridge), originalBodyParity: true, privateExports: ['stockReadiness', 'stockAdditionEvidence', 'matched', 'listValues'] } }) };
}

/** Pure assertion/plan helpers below grant no SQL, context or issuer authority. */
export function finiteSamplingQueries(fixture, plan) {
  assertFixture(fixture);
  const all = { page: 1, pageSize: 100, filter: Object.fromEntries(Object.keys(plan.query.filter).map(key => [key, []])) };
  return freeze([{ label: 'narrow', parameters: parseProductManagementListQuery(plan.query) },
    { label: 'all', parameters: parseProductManagementListQuery(all) },
    { label: 'page2', parameters: parseProductManagementListQuery({ ...all, page: 2 }) }]);
}
export function assertFiniteSamplingPage(value, label, data, previous) {
  const page = checkedProductManagementListPage(value), { plan, fixture, result } = data;
  need(['narrow', 'all', 'page2'].includes(label), 'CLOSED_FINITE_PAGE_LABEL_REQUIRED');
  assert.equal(page.pageSize, 100); assert.equal(page.page, label === 'page2' ? 2 : 1);
  assert.equal(page.exactTotal, label === 'narrow' ? 3 : 4);
  if (label === 'narrow') assert.deepEqual(page, result.allWarehousePage, 'Full original finite page including names/prices/fits/stock must remain exact');
  else if (label === 'page2') assert.deepEqual(page.items, []);
  else {
    const disabled = { id: fixture.reference.disabledProductId, code: fixture.reference.expectedProductCode + '-DISABLED',
      name: 'SYNTHETIC PRODUCT-DISABLED', categoryLabel: 'SYNTHETIC CATEGORY', year: null, seasonLabel: null,
      supplierLabel: null, fits: [], thickness: null, retailPrice: '1.25', totalStock: '0' };
    const expected = [...result.allWarehousePage.items, disabled].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : a.id < b.id ? -1 : 1);
    assert.deepEqual(page.items, expected, 'Global scope includes retained disabled/noSKU product, without new filter/cap');
  }
  // A checked page cannot turn missing/NULL into confirmed zero; compare every
  // original returned field on repeats, not only totals or query counts.
  for (const row of page.items) need(row.totalStock !== null, 'UNKNOWN_STOCK_MUST_NOT_BECOME_ZERO');
  if (previous) assert.deepEqual(page, previous, 'No repeat/page/order/value drift');
  assert.equal(plan.ids.product, result.productReceipt.result.targetId);
  return page;
}

export function assertFiniteAdmissionRowsEqual(original, candidate) {
  stockAdditionEvidence(original); stockAdditionEvidence(candidate);
  assert.deepEqual(candidate, original, 'Exact same-snapshot decision/error/value rows, not only query count');
}

/** Assertion only; source/target/role authority remains the host/real issuer. */
export function assertFiniteSnapshotObservation(rows, previous) {
  need(Array.isArray(rows) && rows.length === 1, 'ONE_ACTUAL_SNAPSHOT_OBSERVATION_REQUIRED');
  const row = rows[0];
  need(row.isolation === 'repeatable read' && row.read_only === 'on', 'ACTUAL_RR_READ_ONLY_REQUIRED');
  need(typeof row.snapshot === 'string' && /^[0-9]+:[0-9]+:(?:[0-9]+(?:,[0-9]+)*)?$/.test(row.snapshot), 'ACTUAL_PG_SNAPSHOT_TEXT_REQUIRED');
  need(typeof row.current_role === 'string' && row.current_role.length > 0 && row.current_role === row.session_role
    && row.database_owner === false && row.ordinary_login === true, 'ACTUAL_SAME_ORDINARY_NONOWNER_LOGIN_REQUIRED');
  if (previous) assert.deepEqual(row, previous, 'Isolation/snapshot/current/session identity must remain exact within this RR phase');
  return json(row);
}

/** Pure failure disposition; a COMMIT attempt is close-only even when abort
 * races its ACK. Never replace its actual error or schedule a ROLLBACK. */
export function finiteSnapshotFailureDisposition({ committing, aborted, began }) {
  need(typeof committing === 'boolean' && typeof aborted === 'boolean' && typeof began === 'boolean', 'EXACT_SNAPSHOT_FAILURE_STATE_REQUIRED');
  return committing ? 'DISCARD_ORIGINAL' : aborted ? 'DISCARD_CANCELLED' : !began ? 'DISCARD_ORIGINAL' : 'ROLLBACK_ORIGINAL';
}

/** Await the existing host-bounded COMMIT promise, not an AbortSignal race
 * that could hide its actual ACK error. No timeout/SQL/retry is added here. */
export async function awaitFiniteSnapshotCommit(pending) { return await pending; }

/** Pure observation seam. No event can replace service/SQL results. */
export function createFiniteSamplingObserver(onSample, active) {
  need(onSample === undefined || typeof onSample === 'function', 'TRUSTED_FINITE_SAMPLE_CALLBACK_REQUIRED');
  need(typeof active === 'function', 'FINITE_SAMPLE_ACTIVE_CHECK_REQUIRED');
  let sequence = 0;
  const emit = async (phase, label, result) => {
    const event = json({ sequence: ++sequence, phase, label, result });
    need(sequence <= 32, 'FINITE_SAMPLE_EVENT_BOUND_EXCEEDED');
    if (onSample) await onSample(event);
  };
  return Object.freeze({ async run(phase, label, work) {
    need(['BASELINE', 'DIFFERENTIAL', 'PLAN'].includes(phase) && /^[a-z0-9][a-z0-9:_-]{0,63}$/.test(label), 'CLOSED_SAMPLE_PHASE_LABEL_REQUIRED');
    active(); let result, failureDiagnostic = null;
    // Pure observation registration, never a replacement result/query/issuer.
    const recordFailureDiagnostic = value => { failureDiagnostic = json(value); };
    try { result = await work(recordFailureDiagnostic); }
    catch (original) {
      try { await emit(phase, label, { status: 'FAILED', errorCode: typeof original?.code === 'string' ? original.code : null, diagnostic: failureDiagnostic }); }
      catch (secondary) { throw new AggregateError([original, secondary], 'ORIGINAL_SAMPLING_AND_OBSERVATION_FAILED', { cause: original }); }
      throw original;
    }
    let loggingFailed = false, loggingFailure;
    try { await emit(phase, label, result); } catch (error) { loggingFailed = true; loggingFailure = error; }
    try { active(); }
    catch (original) {
      if (loggingFailed) throw new AggregateError([original, loggingFailure], 'ORIGINAL_SAMPLING_AND_OBSERVATION_FAILED', { cause: original });
      throw original;
    }
    if (loggingFailed) throw loggingFailure;
    return result;
  } });
}

export async function runFiniteSnapshotAdmissionSampling(input) {
  const args = captureData(input, ['context', 'metrics', 'budget', 'signal', ...(Object.hasOwn(input ?? {}, 'onSample') ? ['onSample'] : [])]);
  // Genuine private finite business context, not a shape/JSON/native101 context.
  const data = currentRuntimeBusinessContextData(args.context), { issuer, actor, plan, fixture } = data;
  const metrics = assertCurrentRuntimeQueryMetrics(args.metrics), { budget, signal } = args;
  need(typeof budget?.remaining === 'function' && typeof signal?.aborted === 'boolean' && typeof signal.addEventListener === 'function', 'ORIGINAL_HOST_BUDGET_AND_SIGNAL_REQUIRED');
  const active = () => { activeProductManagementRead(signal); budget.remaining(); };
  active(); const source = verifyOriginalStockReadinessBridge();
  const retainedDelete = catalogueRetainedDeleteEnabled(issuer.pool, issuer.catalogueRetainedDelete);
  const seasonArray = productSeasonArrayEnabled(issuer.pool, issuer.productSeasonArray);
  const statements = prototypeStatements(source.sources, { retainedDelete, seasonArray });
  const authorization = createSourceConfirmedApplicationReadAuthorization(issuer.pool).productManagement;
  const service = createProductManagementQueryService({ authorization,
    reader: new PostgresProductManagementQueryReader(issuer.pool, issuer.catalogueRetainedDelete, issuer.productSeasonArray, issuer.runtime26) });
  const observe = createFiniteSamplingObserver(args.onSample, active), baselines = [], differential = [], plans = [];
  for (const scenario of finiteSamplingQueries(fixture, plan)) {
    let previous;
    for (const repetition of ['first', 'repeat1', 'repeat2']) {
      const label = scenario.label + ':' + repetition;
      const sample = await observe.run('BASELINE', label, async recordFailureDiagnostic => {
        let page, originalFailure, serviceFailed = false, measurement;
        try { await metrics.sampleService(label, async () => { active(); page = await service.readList(actor, scenario.parameters, signal); active(); }); }
        catch (original) { serviceFailed = true; originalFailure = original; }
        try { measurement = metrics.takeSample(); }
        catch (collection) {
          recordFailureDiagnostic({ measurement: null, collectionErrorCode: typeof collection?.code === 'string' ? collection.code : null });
          if (serviceFailed) throw new AggregateError([originalFailure, collection], 'ORIGINAL_SERVICE_AND_METRICS_COLLECTION_FAILED', { cause: originalFailure });
          throw collection;
        }
        recordFailureDiagnostic({ measurement });
        if (serviceFailed) throw originalFailure;
        need(measurement.status === 'VALID_SAMPLE' && Number.isSafeInteger(measurement.queryCount) && measurement.queryCount > 0, 'VALID_CAPTURED_ORIGINAL_SERVICE_METRICS_REQUIRED');
        const checked = assertFiniteSamplingPage(page, scenario.label, data, previous); previous = checked;
        return json({ status: 'PASS_ORIGINAL_SERVICE_FINITE_SAMPLE', parameters: scenario.parameters, page: checked, measurement,
          timingScope: 'ORIGINAL_APPLICATION_SERVICE_NOT_HTTP_API_OR_SERVER_EXCLUSIVE_TIME', cacheState: 'NOT_CONTROLLED_NOT_BROWSER_COLD_NOT_P95' });
      });
      baselines.push(sample);
    }
  }

  // Authorization runs on its original service pool BEFORE acquiring this
  // single active runtime lease; never nest a second lease into the host fence.
  const parameters = parseProductManagementListQuery(plan.query);
  const grant = checkedProductManagementGrant(await authorization.authorize(actor, Object.freeze({ kind: 'list', parameters }), signal));
  active(); need(grant.totalStock === 'all-warehouses', 'REAL_ALL_WAREHOUSE_GRANT_REQUIRED');
  const values = listValues(grant, parameters), matchedSql = matched(retainedDelete, seasonArray);
  const cancelled = () => new DomainError('PRODUCT_MANAGEMENT_READ_ABORTED', 'Product management read cancelled');
  async function snapshot(work, recordFailureDiagnostic) {
    active(); const client = await acquireReadClient(issuer.pool, signal, cancelled);
    let began = false, committing = false, commitAcknowledged = false, released = false, discard;
    const observations = [];
    const release = error => { if (!released) { released = true; client.release(error); } };
    const query = (text, bindings = []) => { active(); return awaitRead(client.query(text, bindings), signal, cancelled, () => release(cancelled())); };
    try {
      await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); began = true;
      await issuer.runtime26.assertReady(client, 'INVENTORY_ADMISSION'); active();
      const identity = await sourceConfirmedReadIdentityOn(client, actor, signal); active();
      need(identity.role === actor.role && identity.hallId === actor.hallId, 'SAME_ACTUAL_FINITE_ACTOR_REQUIRED');
      let firstObservation;
      const observeSnapshot = async label => {
        const observed = assertFiniteSnapshotObservation((await query(snapshotObservationSql)).rows, firstObservation); active();
        firstObservation ??= observed; observations.push({ label, ...observed });
      };
      const result = await work(query, observeSnapshot); active();
      need(observations.length >= 4, 'ACTUAL_BEFORE_AFTER_SNAPSHOT_EVIDENCE_REQUIRED');
      active(); committing = true;
      await awaitFiniteSnapshotCommit(client.query('COMMIT')); // Original issuer client/fence/budget still owns this send.
      commitAcknowledged = true; committing = false; began = false;
      active(); return json({ ...result, snapshotObservations: observations, readOnlyCommitAcknowledged: true });
    } catch (original) {
      recordFailureDiagnostic({ commitAcknowledged, transactionBegan: began, committing, snapshotObservations: observations });
      const disposition = finiteSnapshotFailureDisposition({ committing, aborted: signal.aborted, began });
      if (disposition === 'DISCARD_ORIGINAL') { discard = original instanceof Error ? original : Error('Finite snapshot failed'); throw original; }
      if (disposition === 'DISCARD_CANCELLED') { release(cancelled()); throw cancelled(); }
      try { await client.query('ROLLBACK'); }
      catch (rollback) { discard = rollback instanceof Error ? rollback : Error('Finite rollback failed'); throw new AggregateError([original, rollback], 'FINITE_SNAPSHOT_AND_ROLLBACK_FAILED', { cause: original }); }
      throw original;
    } finally { release(discard); }
  }
  async function originalProofs(query) {
    const proofs = []; let publications = 0;
    await stockReadiness(async (text, bindings = []) => {
      active(); const response = await query(text, bindings); active();
      if (text.startsWith('/* product-management:publication */')) publications++;
      for (const [branch, marker, expected] of [
        ['warehouses', '/* product-management:stock-additional-warehouse-proof */', source.sources.originalWarehouse],
        ['skus', '/* product-management:stock-additional-sku-proof */', source.sources.originalSku.replace('${matchedSql}', matchedSql)],
      ]) if (text.startsWith(marker)) { assert.equal(text, expected); need(!proofs.some(p => p.branch === branch), 'ONE_ORIGINAL_BRANCH_PROOF_PER_SNAPSHOT'); proofs.push({ branch, sql: text, bindings: structuredClone(bindings), rows: structuredClone(response.rows) }); }
      return response;
    }, values, matchedSql, issuer.runtime26);
    assert.equal(publications, 1, 'Original publication once in this RR helper call');
    // This finite fixture must actually exercise post-cutoff native SKU proof.
    need(proofs.some(p => p.branch === 'skus'), 'ACTUAL_NEW_SKU_PROOF_NOT_TRIGGERED');
    return proofs;
  }
  differential.push(await observe.run('DIFFERENTIAL', 'same-snapshot:finite', recordFailureDiagnostic => snapshot(async (query, observeSnapshot) => {
    await observeSnapshot('before-original'); const proofs = await originalProofs(query), results = [];
    await observeSnapshot('after-original');
    for (const proof of proofs) {
      const candidateSql = statements[proof.branch];
      await observeSnapshot('before-candidate:' + proof.branch);
      const candidate = await query(candidateSql, proof.bindings); active();
      await observeSnapshot('after-candidate:' + proof.branch);
      assertFiniteAdmissionRowsEqual(proof.rows, candidate.rows);
      results.push({ branch: proof.branch, status: 'EXACT_ROWS_EQUAL_SAME_RR', originalSql: proof.sql, candidateSql,
        bindings: proof.bindings, originalRows: proof.rows, candidateRows: candidate.rows });
    }
    return json({ status: 'PASS_FINITE_POSITIVE_SAME_SNAPSHOT_ONLY', publicationCalls: 1, results,
      warehouseBranch: proofs.some(p => p.branch === 'warehouses') ? 'TRIGGERED' : 'NOT_TRIGGERED',
      permissionScope: 'CURRENT_EXACT339_ONLY_PRODUCTION_CROSS_PERMISSION_EQUIVALENCE_UNPROVEN', negativeSqlOutcomes: 'NOT_EXERCISED' });
  }, recordFailureDiagnostic)));
  // Independent phase; never wrap EXPLAIN in baseline service timing or replace
  // the rows expected by the original reader. ANALYZE executes readonly SQL.
  plans.push(await observe.run('PLAN', 'separate-phase:finite', recordFailureDiagnostic => snapshot(async (query, observeSnapshot) => {
    await observeSnapshot('before-original-readiness'); const proofs = await originalProofs(query), results = [];
    await observeSnapshot('after-original-readiness');
    for (const proof of proofs) for (const variant of ['original', 'candidate']) {
      const sql = variant === 'original' ? proof.sql : statements[proof.branch];
      await observeSnapshot('before-explain:' + proof.branch + ':' + variant);
      const response = await query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + sql, proof.bindings); active();
      await observeSnapshot('after-explain:' + proof.branch + ':' + variant);
      need(response.rows.length === 1 && Array.isArray(response.rows[0]['QUERY PLAN']) && response.rows[0]['QUERY PLAN'].length === 1
        && typeof response.rows[0]['QUERY PLAN'][0]?.Plan === 'object', 'ACTUAL_COMPLETE_JSON_PLAN_REQUIRED');
      results.push({ branch: proof.branch, variant, sql, bindings: proof.bindings, rawRows: response.rows });
    }
    return json({ status: 'PLANS_CAPTURED_SEPARATE_PHASE_NOT_SERVICE_LATENCY', results, sameRoleAndBindings: true, warehouseBranch: proofs.some(p => p.branch === 'warehouses') ? 'TRIGGERED' : 'NOT_TRIGGERED' });
  }, recordFailureDiagnostic)));
  active(); return json({ status: SAMPLING_STATUS, format: 'FINITE_SNAPSHOT_ADMISSION_SAMPLING_V1', source: source.proof,
    fixtureManifestSha256: plan.sourceManifestSha256, commandInputSha256: plan.commandInputSha256,
    baselines, differential, plans, performanceAcceptance: false, productionApplicable: false,
    limitations: ['Finite4 global/3 narrow/page2 empty only, not101, representative width or >=30% acceptance.',
      'Service wall is not full HTTP/API wall; captured query wall is not server-exclusive time/plan loops. No P95 from3 samples.',
      'Only actually triggered positive qualification branches; no negative SQL/warehouse-addition proof unless explicitly present.',
      'Current exact339 permission source binding only. Production cross-permission/error equivalence remains unproven.'] });
}
