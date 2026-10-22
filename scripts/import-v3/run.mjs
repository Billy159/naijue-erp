/** Actual native-store executor. No source defaults, inferred mappings, SQL migrations or automatic retries. */
import { createHash } from 'node:crypto';
import { open, lstat, readFile } from 'node:fs/promises';
import { resolve, dirname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCutoffImportService } from '../../packages/application/src/inventory-cutoff-import.ts';
import { HISTORY_MAPPING_VERSION } from '../../packages/application/src/history-storage-contract.ts';
import { assertHistoryPublicationSchema19 } from '../../packages/application/src/history-typed-publication.ts';
import { historySettlementRequestHash } from '../../packages/application/src/import-v3-history-settlement.ts';
import { PostgresCutoffImportStore } from '../../adapters/postgres/src/inventory-cutoff-import-store.ts';
import { assertNativeImportAccountingSchema19Guards } from '../../adapters/postgres/src/native-import-accounting-capability.ts';
import { PostgresNativePartyImportStore } from '../../adapters/postgres/src/native-party-import.ts';
import { PostgresNativeCatalogueImportStore } from '../../adapters/postgres/src/native-catalogue-import.ts';
import { PostgresNativeProductImportStore } from '../../adapters/postgres/src/native-product-import.ts';
import { PostgresNativeSkuImportStore } from '../../adapters/postgres/src/native-sku-import.ts';
import { PostgresNativeBarcodeImportStore } from '../../adapters/postgres/src/native-barcode-import.ts';
import { PostgresNativeStockContributorStore } from '../../adapters/postgres/src/native-stock-contributor-import.ts';
import { PostgresNativePaymentImportStore } from '../../adapters/postgres/src/native-payment-import.ts';
import { PostgresV3HistoryHeaderNativeReferenceStore } from '../../adapters/postgres/src/import-v3-history-header-native-reference-store.ts';
import { PostgresV3HistoryHeaderStagingStore } from '../../adapters/postgres/src/import-v3-history-header-staging-store.ts';
import { PostgresHistorySalesDetailStagingStore } from '../../adapters/postgres/src/import-v3-history-sales-detail-staging-store.ts';
import { PostgresHistorySettlementStagingStore } from '../../adapters/postgres/src/import-v3-history-settlement-staging-store.ts';
import { PostgresV3HistoryStagingStore } from '../../adapters/postgres/src/import-v3-history-staging-store.ts';
import { PostgresHistoryTypedClosure19Store } from '../../adapters/postgres/src/history-typed-closure19.ts';

const VERSION = 'NATIVE_IMPORT_EXECUTION_19_V1';
const STAGES = Object.freeze({ PARTY: PostgresNativePartyImportStore, CATALOGUE: PostgresNativeCatalogueImportStore,
  PRODUCT: PostgresNativeProductImportStore, SKU: PostgresNativeSkuImportStore, BARCODE: PostgresNativeBarcodeImportStore,
  STOCK_CONTRIBUTOR: PostgresNativeStockContributorStore, PAYMENT: PostgresNativePaymentImportStore,
  HEADER_REFERENCE: PostgresV3HistoryHeaderNativeReferenceStore, HEADER: PostgresV3HistoryHeaderStagingStore,
  SALES_DETAIL: PostgresHistorySalesDetailStagingStore, SETTLEMENT: PostgresHistorySettlementStagingStore,
  TRANSFER_LINES: PostgresV3HistoryStagingStore });
const fail = code => { throw Object.assign(new Error(code), { code }); };
const must = (ok, code) => { if (!ok) fail(code); };
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const text = v => typeof v === 'string' && v.length > 0 && v.length <= 1000 && !/[\0-\x1f\x7f]/.test(v);
function bag(value, keys) {
  must(value && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === keys.length, 'IMPORT_EXECUTION_SHAPE');
  const result = {};
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    must(d && Object.hasOwn(d, 'value') && d.enumerable, 'IMPORT_EXECUTION_SHAPE'); result[key] = d.value;
  }
  return result;
}
function binding(value) {
  // Reuse the existing descriptor-only encoder, including exact approval Maps, before structuredClone.
  historySettlementRequestHash(value);
  const b = bag(value, ['version', 'batchId', 'actorAccountId', 'fixedSourceNamespace', 'cutoffAt', 'selectionSha256', 'authorizedPayloadHash', 'target']);
  must(b.version === VERSION && uuid(b.batchId) && uuid(b.actorAccountId)
    && typeof b.fixedSourceNamespace === 'string' && /^[a-z][a-z0-9_.:-]*$/.test(b.fixedSourceNamespace)
    && hash(b.selectionSha256) && hash(b.authorizedPayloadHash), 'IMPORT_EXECUTION_BINDING');
  must(typeof b.cutoffAt === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(b.cutoffAt) && Number.isFinite(Date.parse(b.cutoffAt)), 'IMPORT_EXECUTION_CUTOFF_REQUIRED');
  const t = bag(b.target, ['database', 'role', 'serverAddress', 'serverPort', 'postmasterStartedAt']);
  must(text(t.database) && text(t.role) && text(t.postmasterStartedAt)
    && (t.serverAddress === null ? t.serverPort === null : text(t.serverAddress) && Number.isInteger(t.serverPort) && t.serverPort > 0 && t.serverPort <= 65535), 'IMPORT_EXECUTION_TARGET_REQUIRED');
  return structuredClone(b);
}
function capturedStep(value, b) {
  const { kind, payload } = bag(value, ['kind', 'payload']);
  must(typeof kind === 'string' && (kind === 'MAIN' || kind === 'CLOSURE' || Object.hasOwn(STAGES, kind)), 'IMPORT_EXECUTION_UNKNOWN_STEP');
  const digest = historySettlementRequestHash(payload), copy = structuredClone(payload);
  const root = kind === 'PAYMENT' || kind === 'SALES_DETAIL' || kind === 'SETTLEMENT' ? copy.input : copy;
  must(root && root.batchId === b.batchId, 'IMPORT_EXECUTION_BATCH_MISMATCH');
  if (kind === 'MAIN') {
    must(copy.actorAccountId === b.actorAccountId && ['IMPORT_STAGE', 'IMPORT_CHUNK', 'IMPORT_PUBLISH'].includes(copy.action), 'IMPORT_EXECUTION_MAIN_IDENTITY');
    if (copy.action === 'IMPORT_STAGE') must(copy.sourceName === b.fixedSourceNamespace && copy.cutoffAt === b.cutoffAt
      && copy.sourceHash === b.selectionSha256 && copy.mappingVersion === HISTORY_MAPPING_VERSION
      && copy.historyMetadata?.payloadHash === b.authorizedPayloadHash, 'IMPORT_EXECUTION_STAGE_BINDING');
    else must(copy.accountingVersion === 'NATIVE_IMPORT_RECORD_ACCOUNTING_V1', 'IMPORT_EXECUTION_NATIVE_ACCOUNTING_REQUIRED');
    if (copy.action === 'IMPORT_PUBLISH') must(copy.historyClosure?.selectionSha256 === b.selectionSha256
      && copy.historyClosure?.authorizedPayloadHash === b.authorizedPayloadHash, 'IMPORT_EXECUTION_CLOSURE_REQUIRED');
  } else {
    must(root.fixedSourceNamespace === b.fixedSourceNamespace, 'IMPORT_EXECUTION_NAMESPACE_MISMATCH');
    const selected = kind === 'CLOSURE' ? copy.plan : root.selection;
    must(selected?.selectionSha256 === b.selectionSha256, 'IMPORT_EXECUTION_SELECTION_MISMATCH');
    if (kind === 'CLOSURE') must(selected.authorizedPayloadHash === b.authorizedPayloadHash, 'IMPORT_EXECUTION_CLOSURE_REQUIRED');
  }
  return { kind, payload: copy, digest };
}

/** Inert construction. Each step must be independently source-authorized before any target connection.
 * The trusted host supplies actual source/OOXML/mapping authorizers, never a report-shaped approval.
 * Existing stores independently validate each prepared payload and own every transaction/receipt.
 */
export function createPostgresImportExecutor(options) {
  const o = bag(options, ['pool', 'binding', 'authorization', 'now']);
  must(typeof o.pool?.connect === 'function' && typeof o.now === 'function', 'IMPORT_EXECUTION_PROVIDER_REQUIRED');
  const b = binding(o.binding), a = bag(o.authorization, ['assertExecutionAllowed', 'authorizeStep', 'assertAllowed', 'authorizeNativeCommand', 'authorizeClosure']);
  must(Object.values(a).every(fn => typeof fn === 'function'), 'IMPORT_EXECUTION_AUTHORITY_REQUIRED');
  let targetChecked = false;
  async function checkTarget() {
    if (targetChecked) return;
    const c = await o.pool.connect(); let began = false, committing = false, discard;
    try {
      await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); began = true;
      const rows = (await c.query(`/* import-executor:target */ SELECT current_database()::text database,current_user::text role,
        inet_server_addr()::text server_address,inet_server_port() server_port,pg_postmaster_start_time()::text postmaster_started_at`)).rows;
      const r = rows[0], t = b.target;
      must(rows.length === 1 && r.database === t.database && r.role === t.role && r.server_address === t.serverAddress
        && r.server_port === t.serverPort && r.postmaster_started_at === t.postmasterStartedAt, 'IMPORT_EXECUTION_TARGET_MISMATCH');
      const versions = (await c.query('/* import-executor:schema */ SELECT array_agg(version ORDER BY version) versions FROM naijue_erp.schema_migration')).rows;
      must(versions.length === 1, 'IMPORT_EXECUTION_SCHEMA_REQUIRED'); assertHistoryPublicationSchema19(versions[0].versions);
      await assertNativeImportAccountingSchema19Guards(c);
      committing = true; await c.query('COMMIT'); targetChecked = true;
    } catch (error) {
      if (!began || committing) discard = error instanceof Error ? error : Error('Import target outcome unknown');
      else try { await c.query('ROLLBACK'); } catch (rollback) { discard = rollback; throw new AggregateError([error, rollback], 'Import target read failed'); }
      throw error;
    } finally { c.release(discard); }
  }
  const main = createCutoffImportService({ now: o.now, authorization: { assertAllowed: (...args) => a.assertAllowed(...args) },
    store: new PostgresCutoffImportStore(o.pool, { nativeAccountingAuthorization: { assertAllowed: (...args) => a.authorizeNativeCommand(...args) } }) });
  return async original => {
    const step = capturedStep(original, b);
    await a.assertExecutionAllowed(structuredClone(b));
    const authorized = { kind: step.kind, payload: structuredClone(step.payload) };
    await a.authorizeStep(authorized);
    must(historySettlementRequestHash(authorized.payload) === step.digest && authorized.kind === step.kind, 'IMPORT_EXECUTION_AUTHORIZER_MUTATION');
    await checkTarget();
    if (step.kind === 'MAIN') return main.execute(step.payload);
    if (step.kind === 'CLOSURE') return new PostgresHistoryTypedClosure19Store(o.pool, { authorizeStage: input => a.authorizeClosure(input) }).stage(step.payload);
    return new STAGES[step.kind](o.pool).stage(step.payload);
  };
}

/** One bounded sequential pass; committed DB receipts, not this journal, decide replay.
 * source.steps must resume from a source/DB-verified checkpoint. No failed step is auto-retried.
 * A COMMITTED event confirms only its store result, not complete import or publication readback.
 */
export async function runImportSteps({ source, execute, append, signal, maxSteps }) {
  must(typeof source?.steps === 'function' && typeof source.close === 'function' && typeof execute === 'function'
    && typeof append === 'function' && signal && typeof signal.aborted === 'boolean'
    && Number.isSafeInteger(maxSteps) && maxSteps > 0 && maxSteps <= 1_000_000, 'IMPORT_EXECUTION_RUN_OPTIONS');
  let completed = 0, failure;
  try {
    for await (const original of source.steps()) {
      must(!signal.aborted, 'IMPORT_EXECUTION_ABORTED'); must(completed < maxSteps, 'IMPORT_EXECUTION_STEP_LIMIT');
      const raw = bag(original, ['kind', 'payload']), digest = historySettlementRequestHash(raw.payload);
      must(typeof raw.kind === 'string' && (raw.kind === 'MAIN' || raw.kind === 'CLOSURE' || Object.hasOwn(STAGES, raw.kind)), 'IMPORT_EXECUTION_UNKNOWN_STEP');
      const step = { kind: raw.kind, payload: structuredClone(raw.payload) }, ordinal = completed + 1;
      // Technical metadata only: no raw rows, amounts, credentials or source paths.
      await append({ ordinal, kind: step.kind, digest, state: 'ATTEMPTING' });
      must(!signal.aborted, 'IMPORT_EXECUTION_ABORTED');
      let result;
      try { result = await execute(step); }
      catch (error) {
        await append({ ordinal, kind: step.kind, digest, state: 'FAILED_OUTCOME_UNVERIFIED', code: safeCode(error) }); throw error;
      }
      const receipt = {};
      for (const key of ['inserted', 'replayed', 'sequence', 'cursor', 'status']) if (Object.hasOwn(result ?? {}, key)) {
        must(key === 'status' ? ['STAGED', 'VALIDATING', 'IMPORTED'].includes(result[key])
          : Number.isSafeInteger(result[key]) && result[key] >= 0, 'IMPORT_EXECUTION_INVALID_STORE_RESULT');
        receipt[key] = result[key];
      }
      await append({ ordinal, kind: step.kind, digest, state: 'COMMITTED', receipt }); completed++;
    }
    must(!signal.aborted, 'IMPORT_EXECUTION_ABORTED');
    return { status: 'REQUESTED_STEP_SEQUENCE_COMPLETE', completed, publicationReadback: 'NOT_PERFORMED_BY_RUNNER' };
  } catch (error) { failure = error; throw error; }
  finally { try { await source.close(); } catch (close) { if (failure) throw new AggregateError([failure, close], 'Import and source close failed'); throw close; } }
}
const safeCode = error => /^[A-Z][A-Z0-9_]{0,79}$/.test(error?.code ?? '') ? error.code : 'IMPORT_EXECUTION_FAILED';

async function regularNoLinks(path, directory = false) {
  must(isAbsolute(path), 'IMPORT_EXECUTION_ABSOLUTE_PATH_REQUIRED');
  let current = resolve(path), first = true;
  for (;;) {
    const s = await lstat(current); must(!s.isSymbolicLink() && (first && !directory ? s.isFile() : s.isDirectory()), 'IMPORT_EXECUTION_REGULAR_FILE_REQUIRED');
    first = false; const parent = dirname(current); if (parent === current) break; current = parent;
  }
}
async function cli(args) {
  // The reviewed host module is operator-owned executable code; its pin is not a source-data approval.
  must(args.length === 4, 'IMPORT_EXECUTION_USAGE');
  const [hostFile, hostSha256, journalFile, limit] = args;
  must(hash(hostSha256) && isAbsolute(journalFile) && /^[1-9]\d{0,6}$/.test(limit), 'IMPORT_EXECUTION_USAGE');
  await regularNoLinks(hostFile);
  await regularNoLinks(dirname(journalFile), true);
  const bytes = await readFile(hostFile); must(createHash('sha256').update(bytes).digest('hex') === hostSha256, 'IMPORT_EXECUTION_HOST_PIN_MISMATCH');
  const journal = await open(journalFile, 'wx', 0o600), controller = new AbortController(); let host, failure;
  const abort = () => controller.abort(); process.once('SIGINT', abort); process.once('SIGTERM', abort);
  try {
    const module = await import(pathToFileURL(hostFile).href);
    must(typeof module.openImportHost === 'function', 'IMPORT_EXECUTION_PROVIDER_REQUIRED');
    host = await module.openImportHost({ signal: controller.signal });
    must(typeof host?.close === 'function', 'IMPORT_EXECUTION_PROVIDER_REQUIRED');
    const execute = createPostgresImportExecutor(host.executor);
    const result = await runImportSteps({ source: host.source, execute, signal: controller.signal, maxSteps: Number(limit),
      append: async event => { await journal.writeFile(JSON.stringify(event) + '\n'); await journal.sync(); } });
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) { failure = error; throw error; }
  finally {
    process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort);
    const errors = [];
    try { if (host) await host.close(); } catch (error) { errors.push(error); }
    try { await journal.close(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(failure ? [failure, ...errors] : errors, 'Import host cleanup failed');
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  cli(process.argv.slice(2)).catch(error => { process.stderr.write(JSON.stringify({ error: safeCode(error) }) + '\n'); process.exitCode = 1; });
}
