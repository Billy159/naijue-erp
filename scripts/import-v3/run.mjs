/** Actual native-store executor. No source defaults, inferred mappings, SQL migrations or automatic retries. */
import { createHash } from 'node:crypto';
import { open, lstat, readFile } from 'node:fs/promises';
import { resolve, dirname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCutoffImportService, validateCutoffImportCommand } from '../../packages/application/src/inventory-cutoff-import.ts';
import { HISTORY_MAPPING_VERSION } from '../../packages/application/src/history-storage-contract.ts';
import { assertHistoryPublicationSchema19 } from '../../packages/application/src/history-typed-publication.ts';
import { historySettlementRequestHash } from '../../packages/application/src/import-v3-history-settlement.ts';
import { PostgresCutoffImportStore } from '../../adapters/postgres/src/inventory-cutoff-import-store.ts';
import { assertNativeImportAccountingSchema19Guards } from '../../adapters/postgres/src/native-import-accounting-capability.ts';
import { PostgresNativePartyImportStore } from '../../adapters/postgres/src/native-party-import.ts';
import { PostgresNativeCatalogueImportStore, PostgresNativeCatalogueImportStore26 } from '../../adapters/postgres/src/native-catalogue-import.ts';
import { PostgresNativeProductImportStore, PostgresNativeProductImportStore26 } from '../../adapters/postgres/src/native-product-import.ts';
import { PostgresNativeSkuImportStore, PostgresNativeSkuImportStore26 } from '../../adapters/postgres/src/native-sku-import.ts';
import { PostgresNativeBarcodeImportStore, PostgresNativeBarcodeImportStore26 } from '../../adapters/postgres/src/native-barcode-import.ts';
import { PostgresNativeStockContributorStore, PostgresNativeStockContributorStore26 } from '../../adapters/postgres/src/native-stock-contributor-import.ts';
import { PostgresNativePaymentImportStore, PostgresNativePaymentImportStore26 } from '../../adapters/postgres/src/native-payment-import.ts';
import { PostgresV3HistoryHeaderNativeReferenceStore } from '../../adapters/postgres/src/import-v3-history-header-native-reference-store.ts';
import { PostgresV3HistoryHeaderStagingStore, PostgresV3HistoryHeaderStagingStore26 } from '../../adapters/postgres/src/import-v3-history-header-staging-store.ts';
import { PostgresHistorySalesDetailStagingStore, PostgresHistorySalesDetailStagingStore26 } from '../../adapters/postgres/src/import-v3-history-sales-detail-staging-store.ts';
import { PostgresHistorySettlementStagingStore, PostgresHistorySettlementStagingStore26 } from '../../adapters/postgres/src/import-v3-history-settlement-staging-store.ts';
import { PostgresV3HistoryStagingStore, PostgresV3HistoryStagingStore26 } from '../../adapters/postgres/src/import-v3-history-staging-store.ts';
import { PostgresHistoryTypedClosure19Store, PostgresHistoryTypedClosure26Store } from '../../adapters/postgres/src/history-typed-closure19.ts';

import { checkedNativeRuntime26Capability } from '../../packages/application/src/native-import-schema-contract.ts';

import { requestHash } from '../../packages/application/src/request-hash.ts';
import { readNativeCoreWarehouseCarryForward } from '../../adapters/postgres/src/native-import-record-accounting.ts';
import { NATIVE_STAGE_CONTINUATION_VERSION26, captureNativeStageContinuationInput26, verifyCommittedNativeStagePrefix26 } from '../../adapters/postgres/src/native-stage-continuation26.ts';
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
function binding(value, expectedVersion = VERSION) {
  // Reuse the existing descriptor-only encoder, including exact approval Maps, before structuredClone.
  historySettlementRequestHash(value);
  const phase=value?.phase,core=expectedVersion===VERSION_26&&phase==='CORE_INITIALIZATION_26_V1',resume=expectedVersion===VERSION_26&&phase==='FULL_SOURCE_CONTINUATION_26_V1';
  const b = bag(value, ['version', 'batchId', 'actorAccountId', 'fixedSourceNamespace', 'cutoffAt', 'selectionSha256', 'authorizedPayloadHash', 'target',...(core||resume?['phase','coreSourceDigest']:[]),...(resume?['coreReceiptId']:[])]);
  must(b.version === expectedVersion && uuid(b.batchId) && uuid(b.actorAccountId)
    && typeof b.fixedSourceNamespace === 'string' && /^[a-z][a-z0-9_.:-]*$/.test(b.fixedSourceNamespace)
    && hash(b.selectionSha256) && (core?b.authorizedPayloadHash===null:hash(b.authorizedPayloadHash)) && (!(core||resume)||hash(b.coreSourceDigest)) && (!resume||uuid(b.coreReceiptId)), 'IMPORT_EXECUTION_BINDING');
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
  const o = bag(options, ['pool', 'binding', 'authorization', 'now', ...(Object.hasOwn(options ?? {}, 'bootstrap') ? ['bootstrap'] : [])]);
  must(typeof o.pool?.connect === 'function' && typeof o.now === 'function', 'IMPORT_EXECUTION_PROVIDER_REQUIRED');
  const b = binding(o.binding), a = bag(o.authorization, ['assertExecutionAllowed', 'authorizeStep', 'assertAllowed', 'authorizeNativeCommand', 'authorizeClosure']);
  must(Object.values(a).every(fn => typeof fn === 'function'), 'IMPORT_EXECUTION_AUTHORITY_REQUIRED');
  const bootstrap = Object.hasOwn(o, 'bootstrap') ? bag(o.bootstrap, ['authorizeStageSourceActor', 'stageNewBatch']) : null;
  must(bootstrap === null || Object.values(bootstrap).every(fn => typeof fn === 'function'), 'IMPORT_EXECUTION_BOOTSTRAP_REQUIRED');
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
  const main = createCutoffImportService({ now: o.now, authorization: { assertAllowed: (actor, command) => bootstrap && command.action === 'IMPORT_STAGE'
    ? bootstrap.authorizeStageSourceActor(actor, command) : a.assertAllowed(actor, command) },
    store: new PostgresCutoffImportStore(o.pool, { nativeAccountingAuthorization: { assertAllowed: (...args) => a.authorizeNativeCommand(...args) },
      ...(bootstrap ? { stageBootstrap: { stageNewBatch: (...args) => bootstrap.stageNewBatch(...args) } } : {}) }) });
  return async original => {
    const step = capturedStep(original, b);
    await a.assertExecutionAllowed(structuredClone(b));
    // Initial actor does not exist in the empty target yet. Real source-account
    // authority is checked BEFORE target discovery/connection, then by MAIN again.
    if (bootstrap && step.kind === 'MAIN' && step.payload.action === 'IMPORT_STAGE') await bootstrap.authorizeStageSourceActor(b.actorAccountId, structuredClone(step.payload));
    const authorized = { kind: step.kind, payload: structuredClone(step.payload) };
    await a.authorizeStep(authorized);
    must(historySettlementRequestHash(authorized.payload) === step.digest && authorized.kind === step.kind, 'IMPORT_EXECUTION_AUTHORIZER_MUTATION');
    await checkTarget();
    if (step.kind === 'MAIN') return main.execute(step.payload);
    if (step.kind === 'CLOSURE') return new PostgresHistoryTypedClosure19Store(o.pool, { authorizeStage: input => a.authorizeClosure(input) }).stage(step.payload);
    return new STAGES[step.kind](o.pool).stage(step.payload);
  };
}

const VERSION_26 = 'NATIVE_IMPORT_EXECUTION_26_V1';
const STAGES_26 = Object.freeze({ PARTY: PostgresNativePartyImportStore, CATALOGUE: PostgresNativeCatalogueImportStore26,
  PRODUCT: PostgresNativeProductImportStore26, SKU: PostgresNativeSkuImportStore26, BARCODE: PostgresNativeBarcodeImportStore26,
  STOCK_CONTRIBUTOR: PostgresNativeStockContributorStore26, PAYMENT: PostgresNativePaymentImportStore26,
  HEADER_REFERENCE: PostgresV3HistoryHeaderNativeReferenceStore, HEADER: PostgresV3HistoryHeaderStagingStore26,
  SALES_DETAIL: PostgresHistorySalesDetailStagingStore26, SETTLEMENT: PostgresHistorySettlementStagingStore26,
  TRANSFER_LINES: PostgresV3HistoryStagingStore26 });
function capturedStep26(original, b) {
  const raw=bag(original,['kind','payload']);
  if(raw.kind==='MAIN'&&['IMPORT_CORE_STAGE','IMPORT_BIND_FULL_SOURCE','IMPORT_INITIALIZE_BARCODE_SCHEMES'].includes(raw.payload?.action)){
    const digest=historySettlementRequestHash(raw.payload),copy=structuredClone(raw.payload);validateCutoffImportCommand(copy);
    must(copy.batchId===b.batchId&&copy.actorAccountId===b.actorAccountId,'IMPORT_EXECUTION_MAIN_IDENTITY');
    if(copy.action==='IMPORT_CORE_STAGE')must(b.phase==='CORE_INITIALIZATION_26_V1'&&copy.sourceName===b.fixedSourceNamespace&&copy.sourceHash===b.selectionSha256&&copy.cutoffAt===b.cutoffAt&&copy.coreInitialization.coreSourceDigest===b.coreSourceDigest&&requestHash(copy.coreInitialization.target)===requestHash(b.target),'IMPORT_EXECUTION26_CORE_BINDING');
    else if(copy.action==='IMPORT_INITIALIZE_BARCODE_SCHEMES'){ const i=copy.schemeInitialization; must(b.phase==='FULL_SOURCE_CONTINUATION_26_V1'&&i.coreSourceDigest===b.coreSourceDigest&&i.coreReceiptId===b.coreReceiptId&&i.fixedSourceNamespace===b.fixedSourceNamespace&&i.selectionSha256===b.selectionSha256&&i.cutoffAt===b.cutoffAt&&requestHash(i.target)===requestHash(b.target),'IMPORT_EXECUTION26_SCHEME_BINDING'); }
    else must(b.phase==='FULL_SOURCE_CONTINUATION_26_V1'&&copy.fullBinding.authorizedPayloadHash===b.authorizedPayloadHash&&copy.fullBinding.coreSourceDigest===b.coreSourceDigest&&copy.fullBinding.coreReceiptId===b.coreReceiptId,'IMPORT_EXECUTION26_FULL_BINDING');
    return {kind:'MAIN',payload:copy,digest};
  }
  must(b.phase!=='CORE_INITIALIZATION_26_V1','IMPORT_EXECUTION26_CORE_ONLY');
  must(!(b.phase==='FULL_SOURCE_CONTINUATION_26_V1'&&raw.kind==='MAIN'&&raw.payload?.action==='IMPORT_STAGE'),'IMPORT_EXECUTION26_NO_REBOOTSTRAP');
  const step = capturedStep(original, b), p = step.payload;
  if (['CATALOGUE','PRODUCT','SKU'].includes(step.kind)) must(p.schemaProfile === 'EXACT26', 'IMPORT_EXECUTION26_PROFILE_REQUIRED');
  if (step.kind === 'PARTY' || step.kind === 'HEADER_REFERENCE') must(Array.isArray(p.rows) && p.rows.length > 0
    && p.rows.every(row => row?.input?.schemaProfile === 'EXACT26'), 'IMPORT_EXECUTION26_PROFILE_REQUIRED');
  return step;
}
/** Explicit successor composition only. Construction is inert, and the concrete
 * source host must supply the actual D1 issued pool+capability and genuine full
 * source/49 bootstrap authorization. This module issues none of those grants. */
export function createPostgresImportExecutor26(options) {
  const o = bag(options, ['pool','binding','authorization','now','runtime26','bootstrap26',...(Object.hasOwn(options??{},'barcodeSchemeInitialization26')?['barcodeSchemeInitialization26']:[]),...(Object.hasOwn(options??{},'stagedPrefixBinding26')?['stagedPrefixBinding26']:[])]);
  must(typeof o.pool?.connect === 'function' && typeof o.now === 'function', 'IMPORT_EXECUTION_PROVIDER_REQUIRED');
  const runtime26 = checkedNativeRuntime26Capability(o.runtime26);
  must(runtime26 !== undefined, 'IMPORT_EXECUTION26_RUNTIME_REQUIRED');
  const b = binding(o.binding, VERSION_26), a = bag(o.authorization, ['assertExecutionAllowed','authorizeStep','assertAllowed','authorizeNativeCommand','authorizeClosure']);
  must(Object.values(a).every(fn => typeof fn === 'function'), 'IMPORT_EXECUTION_AUTHORITY_REQUIRED');
  const bootstrap = b.phase==='FULL_SOURCE_CONTINUATION_26_V1' ? null : bag(o.bootstrap26, ['authorizeStageSourceActor','stageNewBatch26']);
  must(bootstrap===null ? o.bootstrap26===null : Object.values(bootstrap).every(fn => typeof fn === 'function'), 'IMPORT_EXECUTION_BOOTSTRAP_REQUIRED');
  const completed = async (fn, ...args) => must(await fn(...args) === undefined, 'IMPORT_EXECUTION26_AUTHORITY_RESULT');
  let targetChecked = false;
  async function checkTarget() {
    if (targetChecked) return;
    const client = await o.pool.connect(); let began = false, committing = false, discard;
    try {
      await runtime26.assertReady(client, 'IMPORT_STAGE');
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); began = true;
      const rows = (await client.query(`/* import-executor26:target */ SELECT current_database()::text database,current_user::text role,
        inet_server_addr()::text server_address,inet_server_port() server_port,pg_postmaster_start_time()::text postmaster_started_at`)).rows;
      const r = rows[0], t = b.target;
      must(rows.length === 1 && r.database === t.database && r.role === t.role && r.server_address === t.serverAddress
        && r.server_port === t.serverPort && r.postmaster_started_at === t.postmasterStartedAt, 'IMPORT_EXECUTION_TARGET_MISMATCH');
      const schemas = (await client.query('/* import-executor26:schema */ SELECT array_agg(version ORDER BY version) versions FROM naijue_erp.schema_migration')).rows;
      const versions = schemas[0]?.versions;
      must(schemas.length === 1 && Array.isArray(versions) && versions.length === 26 && versions.every((v,i) => v === i + 1), 'IMPORT_EXECUTION_SCHEMA_REQUIRED');
      committing = true; await client.query('COMMIT'); targetChecked = true;
    } catch (error) {
      if (!began || committing) discard = error instanceof Error ? error : Error('Import target outcome unknown');
      else try { await client.query('ROLLBACK'); } catch (rollback) { discard = rollback; throw new AggregateError([error,rollback], 'Import target read failed'); }
      throw error;
    } finally { client.release(discard); }
  }
  const main = createCutoffImportService({ now: o.now, authorization: { assertAllowed: (actor,command) => (command.action === 'IMPORT_STAGE'||command.action==='IMPORT_CORE_STAGE')
    ? completed(bootstrap.authorizeStageSourceActor, actor,command) : completed(a.assertAllowed, actor,command) },
    store: new PostgresCutoffImportStore(o.pool, { runtime26, nativeAccountingAuthorization: { assertAllowed: (...args) => completed(a.authorizeNativeCommand, ...args) },
      coreAuthorization:{assertAllowed:(...args)=>completed(a.authorizeNativeCommand,...args)},
      ...(Object.hasOwn(o,'barcodeSchemeInitialization26')?{barcodeSchemeInitialization26:o.barcodeSchemeInitialization26}:{}),
      ...(Object.hasOwn(o,'stagedPrefixBinding26')?{stagedPrefixBinding26:o.stagedPrefixBinding26}:{}),
      ...(bootstrap?{stageBootstrap26: { stageNewBatch26: (...args) => completed(bootstrap.stageNewBatch26, ...args) }}:{}) }) });
  return async original => {
    const step = capturedStep26(original,b);
    await completed(a.assertExecutionAllowed,structuredClone(b));
    if (step.kind === 'MAIN' && (step.payload.action === 'IMPORT_STAGE'||step.payload.action==='IMPORT_CORE_STAGE')) await completed(bootstrap.authorizeStageSourceActor,b.actorAccountId,structuredClone(step.payload));
    const authorized = {kind:step.kind,payload:structuredClone(step.payload)};
    await completed(a.authorizeStep,authorized);
    must(historySettlementRequestHash(authorized.payload) === step.digest && authorized.kind === step.kind, 'IMPORT_EXECUTION_AUTHORIZER_MUTATION');
    await checkTarget();
    if (step.kind === 'MAIN') return main.execute(step.payload);
    if (step.kind === 'CLOSURE') return new PostgresHistoryTypedClosure26Store(o.pool, { runtime26,authorizeStage: input => completed(a.authorizeClosure,input) }).stage(step.payload);
    return new STAGES_26[step.kind](o.pool,runtime26).stage(step.payload);
  };
}

/** The original full provider reads actual CORE progress before generating MAIN.
 * This does not produce source rows/commands or turn all53 into new claims. */
export async function readCoreImportContinuation26(options) {
  const o=bag(options,['pool','binding','runtime26','assertExecutionAllowed','warehouses',...(Object.hasOwn(options??{},'nativeStageContinuation26')?['nativeStageContinuation26']:[])]);
  const nativeStageAuthority=o.nativeStageContinuation26===undefined?undefined:bag(o.nativeStageContinuation26,['version','capture','assertVerifiedContinuation']);
  if(nativeStageAuthority)must(nativeStageAuthority.version===NATIVE_STAGE_CONTINUATION_VERSION26&&typeof nativeStageAuthority.capture==='function'&&typeof nativeStageAuthority.assertVerifiedContinuation==='function','IMPORT_EXECUTION26_NATIVE_STAGE_AUTHORITY');
  const b=binding(o.binding,VERSION_26),runtime=checkedNativeRuntime26Capability(o.runtime26);
  must(b.phase==='FULL_SOURCE_CONTINUATION_26_V1'&&runtime&&typeof o.pool?.connect==='function'&&typeof o.assertExecutionAllowed==='function','IMPORT_EXECUTION26_CONTINUATION');
  historySettlementRequestHash(o.warehouses);const warehouses=structuredClone(o.warehouses);
  must(Array.isArray(warehouses)&&warehouses.length===53,'IMPORT_EXECUTION26_FULL_WAREHOUSES');
  const byRecord=new Map(),targets=new Set(),sourceKeys=new Set();
  for(const item of warehouses){
    bag(item,['targetType','targetId','sourceEntityType','sourceKey','sourceRecordHash','sourceFileRef','nativeRecord']);
    const record=bag(item.nativeRecord,['id','reviewedAt','decisionReason']);
    must(item.targetType==='WAREHOUSE'&&item.sourceEntityType==='WAREHOUSE'&&uuid(item.targetId)&&text(item.sourceKey)&&hash(item.sourceRecordHash)&&text(item.sourceFileRef)&&uuid(record.id)&&text(record.decisionReason)&&Number.isFinite(Date.parse(record.reviewedAt))&&!byRecord.has(record.id)&&!targets.has(item.targetId)&&!sourceKeys.has(item.sourceKey),'IMPORT_EXECUTION26_FULL_WAREHOUSES');
    byRecord.set(record.id,item);targets.add(item.targetId);sourceKeys.add(item.sourceKey);
  }
  must(await o.assertExecutionAllowed(structuredClone(b))===undefined,'IMPORT_EXECUTION26_AUTHORITY_RESULT');
  const client=await o.pool.connect();let began=false,committing=false,discard;
  try{
    await runtime.assertReady(client,'IMPORT_STAGE');
    // The original reader takes SHARE locks, so this transaction cannot be READ ONLY.
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');began=true;
    const progress=await readNativeCoreWarehouseCarryForward(client,{batchId:b.batchId,coreReceiptId:b.coreReceiptId,coreSourceDigest:b.coreSourceDigest},runtime);
    const claimed=new Set();
    for(const item of progress.warehouses){const original=byRecord.get(item.nativeRecord.id);must(original&&requestHash(original)===requestHash(item)&&!claimed.has(item.nativeRecord.id),'IMPORT_EXECUTION26_CORE_RECORD_CONFLICT');claimed.add(item.nativeRecord.id);}
    must(Array.isArray(progress.coreWarehouses)&&progress.coreWarehouses.length===22&&Array.isArray(progress.coreClaims)&&progress.coreClaims.length===22
      &&progress.coreWarehouses.every(item=>byRecord.has(item.nativeRecord.id)&&claimed.has(item.nativeRecord.id))
      &&progress.actorAccountId===b.actorAccountId&&progress.fixedSourceNamespace===b.fixedSourceNamespace&&progress.selectionSha256===b.selectionSha256
      &&progress.checkpoint.counts.WAREHOUSE===claimed.size&&progress.claims.length===progress.checkpoint.cursor,'IMPORT_EXECUTION26_CORE_RECORD_CONFLICT');
    const remainingWarehouses=warehouses.filter(item=>!claimed.has(item.nativeRecord.id));must(remainingWarehouses.length+claimed.size===53,'IMPORT_EXECUTION26_CORE_RECORD_CONFLICT');
    let nativeStagePrefixProof26=null,onVerified;
    if(nativeStageAuthority){
      const bind=progress.committedOperations.filter(op=>op.action==='IMPORT_BIND_FULL_SOURCE');
      must(progress.status==='STAGED'&&progress.stagedPrefixProof22!==null&&bind.length===1&&!progress.committedOperations.some(op=>op.action==='IMPORT_CHUNK'||op.action==='IMPORT_PUBLISH'),'IMPORT_EXECUTION26_NATIVE_STAGE_CHECKPOINT');
      const context={binding:structuredClone(b),checkpoint:structuredClone(progress.checkpoint),bind:{operationId:bind[0].operationId,requestKey:bind[0].requestKey,requestHash:bind[0].requestHash}};
      const captured=captureNativeStageContinuationInput26(await nativeStageAuthority.capture(structuredClone(context)));
      nativeStagePrefixProof26=await verifyCommittedNativeStagePrefix26(client,context,captured);onVerified=captured.onVerified;
    }
    const result={...structuredClone(progress),remainingWarehouses,nativeStagePrefixProof26};
    committing=true;await client.query('COMMIT');
    if(onVerified)must(await onVerified(result)===undefined,'IMPORT_EXECUTION26_NATIVE_STAGE_VERIFIED_RESULT');
    return result;
  }catch(error){
    if(!began||committing)discard=error instanceof Error?error:Error('Import continuation outcome unknown');
    else try{await client.query('ROLLBACK');}catch(rollback){discard=rollback;throw new AggregateError([error,rollback],'Import continuation read failed');}
    throw error;
  }finally{client.release(discard);}
}

/** One bounded sequential pass; committed DB receipts, not this journal, decide replay.
 * source.steps must resume from a source/DB-verified checkpoint. No failed step is auto-retried.
 * A COMMITTED event confirms only its store result, not complete import or publication readback.
 */
export async function runImportSteps({ source, execute, append, signal, maxSteps }) {
  must(typeof source?.steps === 'function' && typeof source.close === 'function' && typeof execute === 'function'
    && typeof append === 'function' && signal && typeof signal.aborted === 'boolean'
    && Number.isSafeInteger(maxSteps) && maxSteps > 0 && maxSteps <= 1_000_000, 'IMPORT_EXECUTION_RUN_OPTIONS');
  let completed = 0, failure, sourceResult;
  const tracked=async function*(){sourceResult=yield* source.steps();};
  try {
    for await (const original of tracked()) {
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
    const summary={status:'REQUESTED_STEP_SEQUENCE_COMPLETE',completed,publicationReadback:'NOT_PERFORMED_BY_RUNNER'};
    if(completed===0&&sourceResult?.status==='IMPORTED'){
      historySettlementRequestHash(sourceResult);const receipt=bag(sourceResult,['operationId','batchId','sequence','cursor','status','ledgerEntryIds']);
      must(uuid(receipt.operationId)&&uuid(receipt.batchId)&&Number.isSafeInteger(receipt.sequence)&&receipt.sequence>0&&Number.isSafeInteger(receipt.cursor)&&receipt.cursor>0
        &&Array.isArray(receipt.ledgerEntryIds)&&receipt.ledgerEntryIds.every(uuid),'IMPORT_EXECUTION_INVALID_STORE_RESULT');
      return{...summary,recoveredPublication:structuredClone(receipt)};
    }
    return summary;
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
  must(args.length === 4 || args.length === 5, 'IMPORT_EXECUTION_USAGE');
  const [hostFile, hostSha256, journalFile, limit, profile] = args;
  const successor = args.length === 5;
  must(!successor || profile === '--exact26', 'IMPORT_EXECUTION_USAGE');
  must(hash(hostSha256) && isAbsolute(journalFile) && /^[1-9]\d{0,6}$/.test(limit), 'IMPORT_EXECUTION_USAGE');
  await regularNoLinks(hostFile);
  await regularNoLinks(dirname(journalFile), true);
  const bytes = await readFile(hostFile); must(createHash('sha256').update(bytes).digest('hex') === hostSha256, 'IMPORT_EXECUTION_HOST_PIN_MISMATCH');
  const journal = await open(journalFile, 'wx', 0o600), controller = new AbortController(); let host, failure;
  const abort = () => controller.abort(); process.once('SIGINT', abort); process.once('SIGTERM', abort);
  try {
    const module = await import(pathToFileURL(hostFile).href);
    const entry = successor ? 'openImportHost26' : 'openImportHost';
    must(typeof module[entry] === 'function', 'IMPORT_EXECUTION_PROVIDER_REQUIRED');
    host = await module[entry]({ signal: controller.signal });
    must(typeof host?.close === 'function', 'IMPORT_EXECUTION_PROVIDER_REQUIRED');
    const execute = successor ? createPostgresImportExecutor26(host.executor) : createPostgresImportExecutor(host.executor);
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
