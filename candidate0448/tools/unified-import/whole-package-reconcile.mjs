import { isDeepStrictEqual } from 'node:util';
import { parseStrictJson } from '../../packages/application/src/unified-import-contract.ts';
import { isNodeScryptPasswordHash } from '../../packages/authentication/src/passwords.ts';
import { STANDARD_MASTER_TABLES } from '../../packages/application/src/unified-import-execution.ts';

const documentTables = ['sales_header','sales_line','sales_settlement','transfer_header','transfer_line'];
const totalFields = {
  inventory_quantity: ['inventory_quantity', 0], sales_quantity: ['sales_quantity', 0],
  sales_line_amount: ['sales_line_amount_cents', 2], sales_net_due: ['sales_net_due_cents', 2],
  sales_settlement_amount: ['settlement_amount_cents', 2], transfer_quantity: ['transfer_quantity', 0],
};
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const exactKeys = (x, keys) => object(x) && Object.keys(x).sort().join(',') === [...keys].sort().join(',');
const count = x => Number.isSafeInteger(x) && x >= 0;
const uuid = x => typeof x === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(x);
const sourceCountFields = [...STANDARD_MASTER_TABLES, ...documentTables, 'inventory_baseline'];
const activeClients = new WeakSet(), quarantinedClients = new WeakSet();
const safeCodes = new Set(['VERIFY_REPLY_INVALID','VERIFY_COUNTS_INVALID','VERIFY_SOURCE_COUNT_MISMATCH','VERIFY_TOTALS_INVALID','VERIFY_TOTAL_INVALID','VERIFY_TOTAL_PRECISION_INVALID','VERIFY_SOURCE_TOTAL_MISMATCH','VERIFY_COVERAGE_INVALID','VERIFY_HISTORICAL_LINE_AMOUNT_MISMATCH','VERIFY_BEGIN_ACK_INVALID','VERIFY_ROLE_ACK_INVALID','VERIFY_ROLLBACK_ACK_INVALID']);
const safeFields = new Set([...STANDARD_MASTER_TABLES,...documentTables].map(t=>t.toUpperCase()).concat(['INVENTORY_KEY','IMPORT_BATCH',...Object.keys(totalFields)]));
function safeFailure(error) {
  const code = safeCodes.has(error?.message) ? error.message : 'VERIFY_DATABASE_OR_PROTOCOL_FAILED';
  const field = ['VERIFY_SOURCE_COUNT_MISMATCH','VERIFY_SOURCE_TOTAL_MISMATCH'].includes(code) && safeFields.has(error?.field) ? error.field : undefined;
  return { code, ...(field ? { field } : {}) };
}

// PostgreSQL numeric sums may contain harmless trailing fractional zeroes.
function units(value, scale) {
  if (typeof value !== 'string' || value.length > 128 || !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) throw Error('VERIFY_TOTAL_INVALID');
  const negative = value.startsWith('-'), [whole, fractional = ''] = value.replace(/^-/, '').split('.');
  if (fractional.slice(scale).replace(/0/g, '') !== '') throw Error('VERIFY_TOTAL_PRECISION_INVALID');
  const n = BigInt(whole + fractional.slice(0, scale).padEnd(scale, '0'));
  return negative ? -n : n;
}
function validateSourceInputs(initialize, sourceCounts, sourceTotals) {
  // Equality alone is not binding: two missing or malformed identity values
  // must never turn a malformed verifier response into VERIFIED.
  if (!object(initialize) || !Object.hasOwn(initialize, 'plan_sha256') ||
      typeof initialize.plan_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(initialize.plan_sha256) ||
      !Object.hasOwn(initialize, 'batch_id') || !uuid(initialize.batch_id) ||
      !Object.hasOwn(initialize, 'payload') || !object(initialize.payload) ||
      !Object.hasOwn(initialize.payload, 'document_batch_id') || !uuid(initialize.payload.document_batch_id) ||
      initialize.batch_id === initialize.payload.document_batch_id ||
      !object(sourceCounts) || !sourceCountFields.every(key => Object.hasOwn(sourceCounts, key) && count(sourceCounts[key])) ||
      !object(sourceTotals)) throw Error('VERIFY_SOURCE_INPUT_INVALID');
  for (const [key] of Object.values(totalFields)) {
    if (!Object.hasOwn(sourceTotals, key)) throw Error('VERIFY_SOURCE_INPUT_INVALID');
    try { units(sourceTotals[key], 0); } catch { throw Error('VERIFY_SOURCE_INPUT_INVALID'); }
  }
}

function compareHistoricalLineAmounts(initialize, differences) {
  const descriptor = initialize.payload.historical_line_amount_approval;
  if (descriptor === undefined && differences === undefined) return undefined;
  const mismatch = () => { throw Error('VERIFY_HISTORICAL_LINE_AMOUNT_MISMATCH'); };
  if (!Array.isArray(differences)) mismatch();
  if (descriptor === undefined) {
    if (differences.length !== 0) mismatch();
    return undefined;
  }
  if (!object(descriptor) || typeof descriptor.utf8 !== 'string') mismatch();
  const approval = parseStrictJson(descriptor.utf8);
  if (approval?.format_version !== 'HISTORICAL_LINE_AMOUNT_EVIDENCE_V1' ||
      approval.source_namespace !== initialize.namespace ||
      !Array.isArray(approval.lines) || approval.lines.length === 0 ||
      differences.length !== approval.lines.length) mismatch();
  const expected = new Map(approval.lines.map(fact => [fact.line_id, fact]));
  let changed = 0;
  for (const row of differences) {
    const fact = expected.get(row?.line_id);
    if (!fact || row.sales_id !== fact.sales_id || row.source_key !== fact.line_source_key ||
        row.source_namespace !== approval.source_namespace || row.disposition !== 'PRESERVED_SOURCE_DIFFERENCE' ||
        row.original_quantity !== fact.quantity || row.original_deal_price !== fact.deal_price ||
        row.original_line_amount !== fact.line_amount ||
        !Array.isArray(row.source_refs) || row.source_refs.length !== fact.source_refs.length ||
        !fact.source_refs.every(ref => row.source_refs.some(other => isDeepStrictEqual(ref, other))) ||
        !isDeepStrictEqual(row.evidence, {format_version: 'HISTORICAL_LINE_AMOUNT_BOUND_V1',
          attestation_sha256: descriptor.sha256, evidence_sha256: approval.evidence_sha256, fact})) mismatch();
    const quantity = units(fact.quantity, 0), price = units(fact.deal_price, 2), amount = units(fact.line_amount, 2);
    const calculated = quantity * price;
    if (units(row.calculated_line_amount, 2) !== calculated ||
        units(row.difference, 2) !== amount - calculated) mismatch();
    const currentQuantity = units(row.current_quantity, 0);
    const currentPrice = units(row.current_deal_price, 2);
    const currentAmount = units(row.current_line_amount, 2);
    const currentMatches = currentQuantity === quantity && currentPrice === price && currentAmount === amount;
    if (row.current_matches_original !== currentMatches) mismatch();
    if (!currentMatches) changed++;
    expected.delete(row.line_id);
  }
  if (expected.size !== 0) mismatch();
  return {verified_count: differences.length, current_value_difference_count: changed};
}

export function compareWholePackageSource(value, initialize, sourceCounts, sourceTotals) {
  validateSourceInputs(initialize, sourceCounts, sourceTotals);
  if (!object(value) || value.verified !== true || value.verification_profile !== 'STANDARD_WHOLE_PACKAGE_VERIFY_V2' ||
      value.protocol !== 'STANDARD_IMPORT_SQL_V1' || value.plan_sha256 !== initialize.plan_sha256 ||
      value.baseline_batch_id !== initialize.batch_id || value.batch_id !== initialize.payload.document_batch_id ||
      value.scope !== 'CURRENT_NATIVE_AND_IMMUTABLE_IMPORT_PROOF_FENCED' || value.unknown_keys_materialized !== false)
    throw Error('VERIFY_REPLY_INVALID');
  const expected = Object.fromEntries([...STANDARD_MASTER_TABLES, ...documentTables].map(t => [t.toUpperCase(), sourceCounts[t]]));
  expected.INVENTORY_KEY = sourceCounts.inventory_baseline; expected.IMPORT_BATCH = 3;
  if (!Object.values(expected).every(count) || !exactKeys(value.source_counts, Object.keys(expected))) throw Error('VERIFY_COUNTS_INVALID');
  for (const [key, n] of Object.entries(expected)) if (!count(value.source_counts[key]) || value.source_counts[key] !== n) throw Object.assign(Error('VERIFY_SOURCE_COUNT_MISMATCH'), { field: key });
  if (!exactKeys(value.source_totals, Object.keys(totalFields)) || !exactKeys(value.current_totals, Object.keys(totalFields))) throw Error('VERIFY_TOTALS_INVALID');
  for (const [key, [sourceKey, scale]] of Object.entries(totalFields)) {
    if (units(value.source_totals[key], scale) !== units(sourceTotals[sourceKey], 0)) throw Object.assign(Error('VERIFY_SOURCE_TOTAL_MISMATCH'), { field: key });
    units(value.current_totals[key], scale); // Current facts may legitimately differ after ordinary edits.
  }
  const d = value.document_summary, c = value.inventory_coverage, inv = value.inventory_summary;
  if (!object(d) || !count(d.verified_count) || d.verified_count !== sourceCounts.sales_header + sourceCounts.transfer_header ||
      !count(d.changed_after_import_count) || d.changed_after_import_count > d.verified_count ||
      !object(c) || c.scope !== 'EXPLICIT_SOURCE_KEYS_PLUS_VERIFIED_POST_CUTOFF_EFFECT_KEYS' ||
      c.explicit_source_keys !== sourceCounts.inventory_baseline || !count(c.explicit_zero_keys) || c.explicit_zero_keys > c.explicit_source_keys ||
      !count(c.post_cutoff_effect_keys) || c.unknown_combinations_not_enumerated !== true || c.complete_total_inventory !== false ||
      !object(inv) || !count(inv.verified_key_count) || inv.verified_key_count !== c.explicit_source_keys + c.post_cutoff_effect_keys)
    throw Error('VERIFY_COVERAGE_INVALID');
  const lineAmounts = compareHistoricalLineAmounts(initialize, value.historical_line_amount_differences);
  return { source_counts: value.source_counts, source_totals: value.source_totals, current_totals: value.current_totals,
    document_summary: d, inventory_coverage: c, inventory_summary: inv,
    ...(lineAmounts ? {historical_line_amount_summary: lineAmounts} : {}) };
}
/** Independent readback using the pinned verifier. It takes row/advisory locks,
 * so PostgreSQL READ ONLY is not suitable. No import/publish or COMMIT is issued;
 * success requires acknowledged ROLLBACK. Package declarations are not source truth. */
export async function reconcileWholePackage(client, initialize, encodedScrypt, sourceCounts, sourceTotals) {
  if (!isNodeScryptPasswordHash(encodedScrypt)) throw Error('PRIVATE_CREDENTIAL_FORMAT_INVALID');
  if (!client || typeof client.query !== 'function' || typeof client.discard !== 'function') throw Error('VERIFY_CLIENT_INVALID');
  if (activeClients.has(client) || quarantinedClients.has(client)) throw Error('VERIFY_CLIENT_UNAVAILABLE');
  // Bind the original request and independently computed source facts before SQL.
  // Caller-owned inputs must not change verification while awaiting the wire.
  initialize = structuredClone(initialize);
  sourceCounts = structuredClone(sourceCounts);
  sourceTotals = structuredClone(sourceTotals);
  validateSourceInputs(initialize, sourceCounts, sourceTotals);
  // structuredClone invokes enumerable getters, which can synchronously enter
  // this function again. Recheck after snapshotting, immediately before locking.
  if (activeClients.has(client) || quarantinedClients.has(client)) throw Error('VERIFY_CLIENT_UNAVAILABLE');
  activeClients.add(client);
  let began = false, rollbackAttempted = false;
  try {
    const b = await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    if (b.command !== 'BEGIN') throw Error('VERIFY_BEGIN_ACK_INVALID'); began = true;
    const role = await client.query('SET LOCAL ROLE erp_unified27_initializer_2393dbc6db9581c2');
    if (role.command !== 'SET') throw Error('VERIFY_ROLE_ACK_INVALID');
    const r = await client.query('SELECT naijue_erp.standard_whole_package_verify_v2($1::jsonb,$2::text)::text AS result_json', [JSON.stringify(initialize), encodedScrypt]);
    if (r.command !== 'SELECT' || !Array.isArray(r.rows) || r.rows.length !== 1 || typeof r.rows[0]?.result_json !== 'string' || Buffer.byteLength(r.rows[0].result_json) > 1024*1024) throw Error('VERIFY_REPLY_INVALID');
    const summary = compareWholePackageSource(parseStrictJson(r.rows[0].result_json), initialize, sourceCounts, sourceTotals);
    rollbackAttempted = true;
    const rollback = await client.query('ROLLBACK');
    if (rollback.command !== 'ROLLBACK') throw Error('VERIFY_ROLLBACK_ACK_INVALID');
    return { state: 'VERIFIED', scope: 'SOURCE_PACKAGE_VS_CURRENT_DATABASE_WITH_IMPORT_AUDIT_CHAIN', business_database_writes: false, source_truth_verified: false, summary };
  } catch (error) {
    const diagnostic = safeFailure(error);
    if (began && !rollbackAttempted) {
      rollbackAttempted = true;
      try { if ((await client.query('ROLLBACK')).command === 'ROLLBACK') return { state: 'VERIFICATION_FAILED', business_database_writes: false, ...diagnostic }; } catch {}
    }
    // Even a failed discard cannot make an uncertain physical session reusable.
    // Same-key recovery must obtain a different client from the reviewed host.
    quarantinedClients.add(client);
    try { await client.discard(); } catch {}
    return { state: 'VERIFICATION_UNKNOWN', ...diagnostic };
  } finally { activeClients.delete(client); }
}
