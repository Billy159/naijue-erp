/** TEST ONLY. Scaled baseline uses its own private context. No target,
 * issuer/client/SQL/clock or runner can be supplied as authority. Original
 * finite sampler/bridge/prototype remain unchanged reusable dependencies. */
import assert from 'node:assert/strict';
import { captureData } from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
import { freeze, need } from './fixture.mjs';
import { assertScaledFixture } from './scaled-fixture.mjs';
import { scaledCurrentRuntimeBusinessContextData, scaledBusinessQueries } from './scaled-current-runtime-business.mjs';
import { assertCurrentRuntimeQueryMetrics } from './current-runtime-query-metrics.mjs';
import { verifyOriginalStockReadinessBridge, assertFiniteAdmissionRowsEqual, assertFiniteSnapshotObservation,
  finiteSnapshotFailureDisposition, awaitFiniteSnapshotCommit, createFiniteSamplingObserver } from './current-runtime-snapshot-admission-sampling.mjs';
import { prototypeStatements } from '../../snapshot-admission-prototype/snapshot-admission.mjs';
import { stockReadiness, matched, listValues } from './original-stock-readiness-bridge.ts';
import { acquireReadClient, awaitRead } from '../../../../../adapters/postgres/src/cancellable-read.ts';
import { catalogueRetainedDeleteEnabled, productSeasonArrayEnabled } from '../../../../../adapters/postgres/src/product-query-reader.ts';
import { PostgresProductManagementQueryReader } from '../../../../../adapters/postgres/src/product-management-query-reader.ts';
import { sourceConfirmedReadIdentityOn } from '../../../../../adapters/postgres/src/source-confirmed-read-authorization.ts';
import { createSourceConfirmedApplicationReadAuthorization } from '../../../../../apps/api/src/postgres-read-api.ts';
import { createProductManagementQueryService } from '../../../../../packages/application/src/product-management-query-service.ts';
import { parseProductManagementListQuery, checkedProductManagementGrant, checkedProductManagementListPage, activeProductManagementRead } from '../../../../../packages/application/src/product-management-query-validation.ts';
import { DomainError } from '../../../../../packages/domain/src/errors.ts';
const json = value => freeze(JSON.parse(JSON.stringify(value)));
const snapshotObservationSql = `/* scaled-sampling:actual-read-snapshot */ SELECT
  current_setting('transaction_isolation') AS isolation,
  current_setting('transaction_read_only') AS read_only, pg_current_snapshot()::text AS snapshot,
  current_user::text AS current_role, session_user::text AS session_role,
  current_user = pg_get_userbyid((SELECT datdba FROM pg_database WHERE datname=current_database())) AS database_owner,
  (SELECT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
    AND NOT rolreplication AND NOT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS ordinary_login`;
export const SCALED_SAMPLING_STATUS = 'PASS_SCALED_SNAPSHOT_ADMISSION_ONLY_NOT_OPT02_ACCEPTANCE';
export function scaledSamplingQueries(fixture) {
  assertScaledFixture(fixture); const queries = scaledBusinessQueries(fixture);
  return freeze(Object.entries(queries).map(([label, parameters]) => ({ label, parameters })));
}
/** Assertion only. No data row can mint a private business/issuer context. */
export function assertScaledSamplingPage(value, label, data, previous) {
  const page = checkedProductManagementListPage(value);
  need(['page1', 'page2', 'narrow'].includes(label), 'CLOSED_SCALED_PAGE_LABEL_REQUIRED');
  assert.deepEqual(page, data.result.pages[label], 'Complete original fields/IDs/order/prices/stock/page must match verified business page');
  assert.equal(page.pageSize, 100); assert.equal(page.exactTotal, label === 'narrow' ? 1 : 101);
  assert.equal(page.page, label === 'page2' ? 2 : 1); assert.equal(page.items.length, label === 'page1' ? 100 : 1);
  if (label === 'page2') assert.equal(page.items[0].id, data.plan.native.ids.product);
  for (const row of page.items) need(row.totalStock !== null, 'SCALED_UNKNOWN_STOCK_MUST_NOT_BECOME_ZERO');
  if (previous) assert.deepEqual(page, previous, 'No scaled repeated page/field drift');
  return page;
}
export function assertScaledTriggeredProofs(proofs) {
  need(proofs.length === 1 && proofs[0].branch === 'skus', 'ONLY_EXPECTED_SCALED_SKU_BRANCH_REQUIRED');
  assert.deepEqual(proofs[0].rows, [{ identity_count: '101', first_issue: null }], 'Whole201 scope qualifies all101 newSKUs, including native root on page2');
}

export async function runScaledSnapshotAdmissionSampling(input) {
  const args = captureData(input, ['context', 'metrics', 'budget', 'signal', ...(Object.hasOwn(input ?? {}, 'onSample') ? ['onSample'] : [])]);
  // Genuine private SCALED context; old finite/native101 brands are not accepted.
  const data = scaledCurrentRuntimeBusinessContextData(args.context), { issuer, actor, plan, fixture } = data;
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
  for (const scenario of scaledSamplingQueries(fixture)) {
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
        const checked = assertScaledSamplingPage(page, scenario.label, data, previous); previous = checked;
        return json({ status: 'PASS_ORIGINAL_SERVICE_SCALED_SAMPLE', parameters: scenario.parameters, page: checked, measurement,
          timingScope: 'ORIGINAL_APPLICATION_SERVICE_NOT_HTTP_API_OR_SERVER_EXCLUSIVE_TIME', cacheState: 'NOT_CONTROLLED_NOT_BROWSER_COLD_NOT_P95' });
      });
      baselines.push(sample);
    }
  }

  // Authorization runs on its original service pool BEFORE acquiring this
  // single active runtime lease; never nest a second lease into the host fence.
  const parameters = parseProductManagementListQuery(plan.native.queries[0]);
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
    // This source must actually exercise every one of101 native SKUs.
    assertScaledTriggeredProofs(proofs);
    return proofs;
  }
  differential.push(await observe.run('DIFFERENTIAL', 'same-snapshot:scaled', recordFailureDiagnostic => snapshot(async (query, observeSnapshot) => {
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
    return json({ status: 'PASS_SCALED_POSITIVE_SAME_SNAPSHOT_ONLY', publicationCalls: 1, results,
      warehouseBranch: proofs.some(p => p.branch === 'warehouses') ? 'TRIGGERED' : 'NOT_TRIGGERED',
      permissionScope: 'CURRENT_EXACT339_ONLY_PRODUCTION_CROSS_PERMISSION_EQUIVALENCE_UNPROVEN', negativeSqlOutcomes: 'NOT_EXERCISED' });
  }, recordFailureDiagnostic)));
  // Independent phase; never wrap EXPLAIN in baseline service timing or replace
  // the rows expected by the original reader. ANALYZE executes readonly SQL.
  plans.push(await observe.run('PLAN', 'separate-phase:scaled', recordFailureDiagnostic => snapshot(async (query, observeSnapshot) => {
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
  active(); return json({ status: SCALED_SAMPLING_STATUS, format: 'SCALED_SNAPSHOT_ADMISSION_SAMPLING_V1', source: source.proof,
    fixtureManifestSha256: fixture.artifacts.at(-1).sha256, commandInputSha256: plan.native.commandInputHash,
    baselines, differential, plans, performanceAcceptance: false, productionApplicable: false,
    candidateServiceWallNs: null, candidateCapturedQueryWallNs: null,
    candidateTimingScope: 'SEPARATE_SQL_EXPLAIN_ONLY_NOT_CANDIDATE_SERVICE_OR_WIRE_TIME',
    limitations: ['Intended101 products/201SKU/101newSKU scope, one native root101SKU; not universal workload or >=30% acceptance.',
      'Service wall is not full HTTP/API wall; captured query wall is not server-exclusive time/plan loops. No P95 from3 samples.',
      'Only actually triggered positive qualification branches; no negative SQL/warehouse-addition proof unless explicitly present.',
      'Current exact339 permission source binding only. Production cross-permission/error equivalence remains unproven.'] });
}
