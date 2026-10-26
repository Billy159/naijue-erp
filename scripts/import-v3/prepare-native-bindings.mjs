/** Private, connection-free preparation. New UUIDs are allocated once and frozen;
 * this package is a review candidate, never its own authorization or old approval. */
import { randomUUID, createHash } from 'node:crypto';
import { lstat, mkdir, chmod, readFile, writeFile, statfs } from 'node:fs/promises';
import { resolve, join, isAbsolute } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { preflightV2 } from '../import-v2/run.mjs';
import { parseV2Csv } from '../../packages/application/src/import-v2.ts';
import { IMPORT_V2_TABLES } from '../../packages/application/src/import-v2-contract.ts';
import { stableImportId, validateCutoffImportCommand, CUTOFF_IMPORT_CHUNK_LIMIT, COMPLETE_SCOPE_DECISION } from '../../packages/application/src/inventory-cutoff-import.ts';
import { nativeStockContributorsManifestHash, nativeStockEffectiveGroupsManifestHash, validateNativeStockConservationPlan,
 validateNativeImportAccountingCommand, NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION, NATIVE_IMPORT_STOCK_CONSERVATION_VERSION } from '../../packages/application/src/native-import-record-accounting.ts';
import { buildHistoryTypedClosureExpected26, captureHistoryTypedClosureStageInput, historyClosureProjectionRow26 } from '../../packages/application/src/history-typed-closure.ts';
import { HISTORY_CLOSURE_SOURCE_GROUPS } from '../import-v2/authorized-history-closure-reader.mjs';
import { historySettlementRequestHash as capture } from '../../packages/application/src/import-v3-history-settlement.ts';
import { requestHash } from '../../packages/application/src/request-hash.ts';
import { NATIVE_PRODUCT_NULLABLE_POLICY, NATIVE_PRODUCT_REFERENCE_DECISION_VERSION } from '../../packages/application/src/native-product-import.ts';

export const NATIVE_BINDING_PACKAGE_VERSION = 'NATIVE_BINDING_REVIEW_CANDIDATE_V1';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const must = (ok, code) => { if (!ok) throw Object.assign(Error(code), { code }); };
const identityKey = (entity, sourceKey) => JSON.stringify([entity, sourceKey]);
const uuid = s => typeof s === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
export function createNativeIdentityRegistry(allocate = randomUUID, maximum = 600000) {
  const entries = new Map(), ids = new Set();
  return {
    add(entity, sourceKey, normalizedFields) {
      must(typeof entity === 'string' && typeof sourceKey === 'string' && sourceKey.length > 0 && sourceKey.length <= 65536, 'NATIVE_BINDING_IDENTITY');
      const key = identityKey(entity, sourceKey); must(!entries.has(key) && entries.size < maximum, 'NATIVE_BINDING_DUPLICATE_OR_LIMIT');
      const nativeId = allocate(); must(uuid(nativeId) && nativeId !== sourceKey && !ids.has(nativeId), 'NATIVE_BINDING_NEW_UUID');
      const entry = { entity, sourceKey, nativeId, normalizedHash: requestHash(normalizedFields) }; entries.set(key, entry); ids.add(nativeId); return entry;
    },
    get(entity, sourceKey) { const e = entries.get(identityKey(entity, sourceKey)); must(e, 'NATIVE_BINDING_REFERENCE_MISSING'); return structuredClone(e); },
    has: (entity, sourceKey) => entries.has(identityKey(entity, sourceKey)),
    values: () => entries.values(), get size() { return entries.size; }
  };
}
export function sourceEvidence(raw, line, normalizedFields, binding) {
  must(raw?.data?.['来源编号'] === raw.sourceId && uuid(binding.batchId) && typeof raw.file === 'string' && typeof raw.sheet === 'string'
    && Number.isSafeInteger(raw.row) && raw.row > 0 && /^[a-f0-9]{64}$/.test(raw.sourceSha256), 'NATIVE_BINDING_SOURCE');
  const rowSha256 = hash(Buffer.from(line)), fields = {};
  for (const [name, value] of Object.entries(raw.data)) fields[name] = { origin: 'ORIGINAL', reason: 'EXACT_ORIGINAL_SNAPSHOT_CELL', raw: value };
  fields.__source_row_hash = { origin: 'ORIGINAL', reason: 'SHA256_JSONL_UTF8_EXCLUDING_LF_RETAINING_CR_V1', raw: rowSha256 };
  return { id: stableImportId('source-row', binding.fixedSourceNamespace, raw.entity, raw.sourceId), batchId: binding.batchId,
    entityType: raw.entity, sourceKey: raw.sourceId, fileRef: raw.file, sheet: raw.sheet, rowNo: String(raw.row),
    sourceFileSha256: raw.sourceSha256, rowSha256, rawFields: raw.data, normalizedFields,
    fieldProvenance: { schema_version: 1, fields } };
}
async function* lines(chunks) {
  let pending = '', count = 0;
  for await (const chunk of chunks) { let start = 0; for (;;) {
    const end = chunk.indexOf('\n', start); pending += chunk.slice(start, end < 0 ? undefined : end);
    must(Buffer.byteLength(pending) <= 4 * 1024 * 1024, 'NATIVE_BINDING_LINE_LIMIT'); if (end < 0) break;
    must(pending.length > 0 && ++count <= 1000000, 'NATIVE_BINDING_LINE_COUNT'); yield pending; pending = ''; start = end + 1;
  }}
  if (pending) { must(++count <= 1000000, 'NATIVE_BINDING_LINE_COUNT'); yield pending; }
}
async function* csv(strings, path) {
  let header; for await (const cells of parseV2Csv(strings(path))) {
    if (!header) { header = cells; must(new Set(header).size === header.length, 'NATIVE_BINDING_CSV_HEADER'); continue; }
    must(cells.length === header.length, 'NATIVE_BINDING_CSV_WIDTH'); yield Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  } must(header, 'NATIVE_BINDING_CSV_EMPTY');
}
export function reviewedPartyBinding(entity, row, registry, evidenceRef, reviewedAt, recordId = randomUUID) {
  const base = { id: registry.get(entity, row['来源编号']).nativeId, name: row[entity === 'HALL' ? '厅名称' : entity === 'WAREHOUSE' ? '仓库名称' : entity === 'STAFF' ? '姓名' : '名称'], version: 1 };
  const bindings = {}, enumMappings = {};
  const relation = (field, target) => row[field] === '' ? null : (bindings[field] = { sourceKey: row[field], nativeId: registry.get(target, row[field]).nativeId }).nativeId;
  const enabled = () => { must(['正常', '停用'].includes(row['状态']), 'NATIVE_BINDING_STATUS'); const native = row['状态'] === '正常'; enumMappings['状态'] = { raw: row['状态'], native, evidenceRef }; return native; };
  let nativeSnapshot, warehouseRecord;
  if (entity === 'HALL') nativeSnapshot = { ...base, default_customer_id: relation('默认客户来源编号', 'CUSTOMER'), default_sales_warehouse_id: relation('默认销货仓来源编号', 'WAREHOUSE'), enabled: enabled() };
  else if (entity === 'WAREHOUSE') { nativeSnapshot = { ...base, hall_id: relation('所属厅来源编号', 'HALL'), enabled: enabled() }; warehouseRecord = { id: recordId(), reviewedAt, decisionReason: 'REVIEW_CANDIDATE_EXACT_APPROVED_COMPLETE_WAREHOUSE_SCOPE' }; }
  else if (entity === 'STAFF') {
    const roles = { '管理员': 'ADMIN', '仓库': 'WAREHOUSE', '营业员': 'SALESPERSON' }, employment = { '在职': '在职', '离职': '离职' };
    must(Object.hasOwn(roles, row['角色']) && Object.hasOwn(employment, row['任职状态']), 'NATIVE_BINDING_STAFF_ENUM');
    enumMappings['角色'] = { raw: row['角色'], native: roles[row['角色']], evidenceRef }; enumMappings['任职状态'] = { raw: row['任职状态'], native: employment[row['任职状态']], evidenceRef };
    nativeSnapshot = { ...base, hall_id: relation('所属厅来源编号', 'HALL'), role: roles[row['角色']], contact: row['联系方式'] === '' ? null : row['联系方式'], employment_status: employment[row['任职状态']] };
  } else { must(['CUSTOMER', 'SUPPLIER'].includes(entity), 'NATIVE_BINDING_PARTY_KIND'); nativeSnapshot = { ...base, code: row['原编码'], enabled: enabled(), created_at: null, updated_at: null }; }
  return { nativeSnapshot, bindings, enumMappings, ...(warehouseRecord ? { warehouseRecord } : {}) };
}

/** One explicit source preparation invocation. complete preflight validates current bytes;
 * files are private new artifacts and require QB review plus C's OUTSIDE pin. */
export async function prepareNativeBindings(options) {
  const { base, v3Amendment, v3Approval, trustedApprovalSha256, approvedMoneyOverlaySha256, binding, outputParent, registrationId } = options;
  must(binding?.version === 'C_NATIVE_IMPORT_PREPARATION_BINDING_V1' && uuid(binding.batchId) && typeof binding.fixedSourceNamespace === 'string'
    && binding.cutoffAt === '2026-10-04T12:00:00+08:00' && /^[a-f0-9]{64}$/.test(binding.selectionSha256), 'NATIVE_BINDING_CONTROLLER_BINDING');
  must(typeof registrationId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(registrationId) && isAbsolute(outputParent), 'NATIVE_BINDING_OUTPUT');
  const parent = resolve(outputParent), roots = [base, v3Amendment, fileURLToPath(new URL('../../', import.meta.url))].map(p => resolve(p));
  must(!roots.some(p => parent === p || parent.startsWith(p + '/')) && !parent.split('/').includes('.git'), 'NATIVE_BINDING_PRIVATE_OUTPUT');
  must((await lstat(parent)).isDirectory() && !(await lstat(parent)).isSymbolicLink(), 'NATIVE_BINDING_OUTPUT');
  const free = await statfs(parent); must(BigInt(free.bavail) * BigInt(free.bsize) >= 536870912n, 'NATIVE_BINDING_FREE_SPACE');
  const directory = join(parent, registrationId); await mkdir(directory, { mode: 0o700 }); await chmod(directory, 0o700);
  const files = [], registry = createNativeIdentityRegistry(), retained = new Map(), partySources = new Map(), productSources = new Map();
  const report = { version: NATIVE_BINDING_PACKAGE_VERSION, registrationId, status: 'PREPARING', reviewRequired: true, sql: false,
    batchId: binding.batchId, fixedSourceNamespace: binding.fixedSourceNamespace, cutoffAt: binding.cutoffAt, selectionSha256: binding.selectionSha256,
    preparedAtUtc: new Date().toISOString(), reviewStatus: 'PENDING_QB_AND_C_EXTERNAL_PIN',
    identityAllocation: 'New randomUUID once, frozen in registry. No old native identity claim or deterministic source-key UUID.', limits: { heapMiB: 1024, registryBytes: 134217728, originalLineBytes: 4194304, identityRows: 600000, productDecisionBytes: 4194304, otherFileBytes: 134217728 } };
  async function save(name, value, maximum = 134217728) { const bytes = Buffer.from(JSON.stringify(value) + '\n'); must(bytes.length <= maximum
    && files.reduce((n, f) => n + f.bytes, 0) + bytes.length <= 268435456, 'NATIVE_BINDING_FILE_LIMIT');
    await writeFile(join(directory, name), bytes, { flag: 'wx', mode: 0o600 }); const d = { name, bytes: bytes.length, sha256: hash(bytes) }; files.push(d); return d; }
  try {
    let selection, baseManifestSha256, inputHashes, dictionaryInputs;
    const preflight = await preflightV2(base, { v3Amendment, v3Approval, approvedMoneyOverlaySha256, verifyCreatorHall: true,
      onVerifiedV3: async ({ strings, manifest, verified, report: checked }) => {
        must(verified.approvalSha256 === trustedApprovalSha256 && verified.selectionSha256 === binding.selectionSha256
          && checked.referenceTargetsValid && checked.wireRequiredFieldsValid, 'NATIVE_BINDING_SOURCE_PREFLIGHT');
        selection = verified.selection; baseManifestSha256 = selection.baseManifestSha256; inputHashes = manifest.sourceInputSha256;
        for (const table of IMPORT_V2_TABLES.filter(t => t.entity !== 'ISSUE')) {
          // BARCODE is replaced by v3, not appended. This initial registry excludes it
          // until its exact replacement file producer is attached (reported below).
          if (table.entity === 'BARCODE') continue;
          for await (const row of csv(strings, table.file)) {
            const key = table.entity === 'PAYMENT_ACCOUNT_HALL' ? JSON.stringify([row['账户来源编号'], row['厅来源编号']]) : row['来源编号'];
            registry.add(table.entity, key, row);
            if (['PRODUCT', 'HALL', 'WAREHOUSE', 'STAFF', 'CUSTOMER', 'SUPPLIER'].includes(table.entity)) retained.set(identityKey(table.entity, key), row);
          }
        }
        dictionaryInputs = {};
        for (const path of ['dictionaries/source-color-identities.json', 'dictionaries/source-fit-code-identities.json', 'dictionaries/current-size-groups.json']) {
          let s = ''; for await (const part of strings(path)) { s += part; must(Buffer.byteLength(s) <= 16777216, 'NATIVE_BINDING_METADATA_LIMIT'); }
          dictionaryInputs[path] = JSON.parse(s);
        }
        let originalRows = 0;
        for await (const line of lines(strings('snapshots/all-business-source-rows.jsonl'))) {
          const raw = JSON.parse(line); originalRows++; if (!['PRODUCT', 'HALL', 'WAREHOUSE', 'STAFF', 'CUSTOMER', 'SUPPLIER'].includes(raw.entity)) continue;
          must(inputHashes[raw.file] === raw.sourceSha256, 'NATIVE_BINDING_ORIGINAL_FILE_PIN');
          const key = identityKey(raw.entity, raw.sourceId), normalized = retained.get(key); must(normalized, 'NATIVE_BINDING_MISSING_ORIGINAL');
          const target = raw.entity === 'PRODUCT' ? productSources : partySources; must(!target.has(key), 'NATIVE_BINDING_DUPLICATE_ORIGINAL');
          target.set(key, sourceEvidence(raw, line, normalized, binding));
        }
        report.originalRowsScanned = originalRows;
        must(productSources.size + partySources.size === retained.size, 'NATIVE_BINDING_SOURCE_COVERAGE');
      }
    });
    const registryFile = await save('native-identity-registry.json', [...registry.values()]);
    const partyRows = [];
    for (const [key, source] of partySources) {
      const entity = source.entityType, selected = selection.importFiles.find(f => f.entity === entity);
      const selectedScope = { baseManifestSha256, selectionSha256: binding.selectionSha256, approvalSha256: trustedApprovalSha256, entity, source: 'BASE_V2', path: selected.path, csvSha256: selected.sha256 };
      partyRows.push({ batchId: binding.batchId, fixedSourceNamespace: binding.fixedSourceNamespace, selection: selectedScope, source,
        ...reviewedPartyBinding(entity, retained.get(key), registry, 'NATIVE_BINDING_REVIEW_CANDIDATE_V1:party-enum-contract', report.preparedAtUtc) });
    }
    await save('party-reference-candidates.json', partyRows);
    // Freeze reference dictionary inputs verbatim and explicit paths. Category hierarchy and
    // source-name ambiguities are not parsed into guessed records in this preparatory slice.
    const referenceInputs = { version: 'NATIVE_REFERENCE_INPUTS_REVIEW_V1', baseManifestSha256, selectionSha256: binding.selectionSha256,
      dictionaries: dictionaryInputs, products: [...productSources.values()].map(s => ({ sourceRowId: s.id, sourceKey: s.sourceKey,
        sourceEvidenceHash: requestHash(s), categoryPath: s.normalizedFields['分类路径'], sizeGroupName: s.normalizedFields['尺码组'],
        season: s.normalizedFields['季节'], supplierSourceKey: s.normalizedFields['供应商来源编号'] })) };
    const references = await save('reference-inputs-for-review.json', referenceInputs);
    await save('product-source-candidates.json', [...productSources.values()]);
    report.status = 'REVIEW_CANDIDATE_IDENTITIES_AND_PARTIES_PREPARED'; report.identities = registry.size; report.products = productSources.size; report.parties = partySources.size;
    report.files = files; report.preflight = { referenceTargetsValid: preflight.referenceTargetsValid, wireRequiredFieldsValid: preflight.wireRequiredFieldsValid };
    report.existingPricePolicy = 'V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET'; report.existingNullablePolicy = NATIVE_PRODUCT_NULLABLE_POLICY;
    report.referenceDecisionVersion = NATIVE_PRODUCT_REFERENCE_DECISION_VERSION;
    report.remaining = ['Product category root-to-leaf, dictionary enablement/code/order and complete catalogue decisions require reviewed exact occurrences, not PRODUCT aggregation.',
      'v3 replacement barcode producer and immutable exact aliases/stock contributor producers.', 'QB independently checks actual source bytes and mapping rules; C freezes outside pins before any authorization.'];
    report.registryFile = registryFile.name; report.referenceInputs = references.name;
    await save('review-candidate-manifest.json', report, 4194304);
    return { directory, status: report.status, identities: registry.size, products: productSources.size, parties: partySources.size, manifestSha256: files.at(-1).sha256, sql: false, reviewRequired: true };
  } catch (error) {
    await writeFile(join(directory, 'FAILURE.json'), JSON.stringify({ version: NATIVE_BINDING_PACKAGE_VERSION, status: 'FAIL_PREPARATION', code: /^[A-Z0-9_]+$/.test(error?.code ?? error?.message ?? '') ? error.code ?? error.message : 'NATIVE_BINDING_FAILED', sql: false, files }) + '\n', { flag: 'wx', mode: 0o600 });
    throw error;
  }
}
// Full preparation consumes already independently adopted DATA and original canonical
// reader results. It does not authenticate those inputs or call the old raw preflight.
const fullExact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join() === [...keys].sort().join();
const fullCount=v=>Number.isSafeInteger(v)&&v>=0&&v<2147483646;
const fullHash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fullTargets=['WAREHOUSE','SKU','INVENTORY_LEDGER','IMPORT_BATCH'];
const fullInteger=v=>typeof v==='string'&&/^(?:0|-?[1-9][0-9]{0,127})$/.test(v);
function noCredentials(value){
 if(!value||typeof value!=='object')return;
 for(const [key,item]of Object.entries(value)){must(!/password|credential|salt|token|login_name/i.test(key),'FULL_PAYLOAD_CREDENTIAL_FORBIDDEN');noCredentials(item);}
}
export function prepareFullPayloadData26(original){
 capture(original);const o=structuredClone(original);
 must(fullExact(o,['binding','core','groups','expectedCounts','expectedSourceEntityCounts','inventoryExpectedCounts','stock']),'FULL_PAYLOAD_DATA_SHAPE');
 const b=o.binding,c=o.core;
 must(fullExact(b,['batchId','fixedSourceNamespace','cutoffAt','selectionSha256'])&&uuid(b.batchId)&&typeof b.fixedSourceNamespace==='string'
  &&/^[a-z][a-z0-9_.:-]*$/.test(b.fixedSourceNamespace)&&typeof b.cutoffAt==='string'&&Number.isFinite(Date.parse(b.cutoffAt))&&fullHash(b.selectionSha256),'FULL_PAYLOAD_DATA_BINDING');
 must(fullExact(c,['coreReceiptId','coreSourceDigest','coreMembers','staffProofs','coreMaintenanceBinding'])&&uuid(c.coreReceiptId)&&fullHash(c.coreSourceDigest)
  &&Array.isArray(c.coreMembers)&&c.coreMembers.length===115&&Array.isArray(c.staffProofs)&&c.staffProofs.length===49,'FULL_PAYLOAD_CORE_DATA');
 noCredentials(c);
 const members=new Map();
 for(const m of c.coreMembers){must(fullExact(m,['sourceRowId','entity','sourceKey','nativeId'])&&uuid(m.sourceRowId)&&uuid(m.nativeId)&&typeof m.sourceKey==='string'
  &&['HALL','WAREHOUSE','STAFF','CUSTOMER'].includes(m.entity)&&!members.has(m.sourceRowId),'FULL_PAYLOAD_CORE_MEMBER');members.set(m.sourceRowId,m);}
 for(const [kind,n]of [['HALL',22],['WAREHOUSE',22],['STAFF',49],['CUSTOMER',22]])must([...members.values()].filter(m=>m.entity===kind).length===n,'FULL_PAYLOAD_CORE_MEMBER');
 const proofs=new Set();for(const p of c.staffProofs){must(fullExact(p,['sourceRowId','bootstrapAccounts'])&&members.get(p.sourceRowId)?.entity==='STAFF'&&!proofs.has(p.sourceRowId)
  &&p.bootstrapAccounts!==null&&typeof p.bootstrapAccounts==='object','FULL_PAYLOAD_ORIGINAL_PROOF_REQUIRED');proofs.add(p.sourceRowId);}
 must(fullExact(c.coreMaintenanceBinding,['version','members'])&&c.coreMaintenanceBinding.version==='CORE_MAINTENANCE_BINDING_V1'
  &&Array.isArray(c.coreMaintenanceBinding.members)&&c.coreMaintenanceBinding.members.length===115,'FULL_PAYLOAD_MAINTENANCE');
 const maintained=new Set();for(const m of c.coreMaintenanceBinding.members){
  must(members.has(m.sourceRowId)&&!maintained.has(m.sourceRowId)&&requestHash(members.get(m.sourceRowId))===requestHash(Object.fromEntries(['sourceRowId','entity','sourceKey','nativeId'].map(k=>[k,m[k]]))),'FULL_PAYLOAD_MAINTENANCE');
  historyClosureProjectionRow26(m.entity.toLowerCase(),m.nativeSnapshot);maintained.add(m.sourceRowId);
 }
 const bySource=(a,b)=>a.sourceRowId<b.sourceRowId?-1:a.sourceRowId>b.sourceRowId?1:0;
 c.coreMembers.sort(bySource);c.staffProofs.sort(bySource);c.coreMaintenanceBinding.members.sort(bySource);
 must(Array.isArray(o.groups)&&o.groups.length===HISTORY_CLOSURE_SOURCE_GROUPS.length,'FULL_PAYLOAD_ALL11_REQUIRED');
 const groups=[],seen=new Set();
 for(const group of o.groups){
  must(fullExact(group,['group','artifacts'])&&HISTORY_CLOSURE_SOURCE_GROUPS.includes(group.group)&&!seen.has(group.group)
   &&Array.isArray(group.artifacts)&&group.artifacts.length>0,'FULL_PAYLOAD_ALL11_REQUIRED');seen.add(group.group);const roles=new Set();
  const artifacts=group.artifacts.map(ref=>{
   must(fullExact(ref,['logicalRole','bytes','sha256','rows','memberCoverage',...(Object.hasOwn(ref,'path')?['path']:[])])
    &&typeof ref.logicalRole==='string'&&ref.logicalRole.trim().length>0&&!roles.has(ref.logicalRole)&&fullCount(ref.bytes)&&fullHash(ref.sha256)&&fullCount(ref.rows)
    &&fullExact(ref.memberCoverage,['rows','sha256'])&&ref.memberCoverage.rows===ref.rows&&fullHash(ref.memberCoverage.sha256),'FULL_PAYLOAD_CONTENT_REF_REQUIRED');roles.add(ref.logicalRole);
   // A physical locator is transport only. All semantic roles and content/coverage pins remain.
   return {logicalRole:ref.logicalRole,bytes:ref.bytes,sha256:ref.sha256,rows:ref.rows,memberCoverage:ref.memberCoverage};
  }).sort((a,b)=>a.logicalRole<b.logicalRole?-1:a.logicalRole>b.logicalRole?1:0);
  groups.push({group:group.group,artifacts});
 }
 groups.sort((a,b)=>HISTORY_CLOSURE_SOURCE_GROUPS.indexOf(a.group)-HISTORY_CLOSURE_SOURCE_GROUPS.indexOf(b.group));
 const s=o.stock;
 must(fullExact(s,['effectiveStockCsvSha256','contributorLineageCsvSha256','contributors','effectiveGroups','warehouses','warehouseUnits'])
  &&Array.isArray(s.contributors)&&Array.isArray(s.effectiveGroups)&&s.effectiveGroups.length>0&&Array.isArray(s.warehouses)&&s.warehouses.length===53&&Array.isArray(s.warehouseUnits),'FULL_PAYLOAD_STOCK_REQUIRED');
 const byGroup=new Map(),ids=new Set(),nativeGroups=new Set(),warehouseTotals=new Map(),unitTotals=new Map();
 for(const g of s.effectiveGroups){
  must(fullExact(g,['canonicalStockSourceKey','warehouseSourceKey','canonicalSkuSourceKey','warehouseId','skuId','signedQuantity','sourceUnit','contributorCount','effectiveRowHash'])
   &&typeof g.canonicalStockSourceKey==='string'&&!byGroup.has(g.canonicalStockSourceKey)&&fullInteger(g.signedQuantity)&&BigInt(g.signedQuantity)!==0n
   &&uuid(g.warehouseId)&&uuid(g.skuId)&&typeof g.sourceUnit==='string'&&g.sourceUnit.length>0&&fullCount(g.contributorCount)&&g.contributorCount>0&&fullHash(g.effectiveRowHash)
   &&!nativeGroups.has(JSON.stringify([g.warehouseId,g.skuId])),'FULL_PAYLOAD_EFFECTIVE_GROUP');
  byGroup.set(g.canonicalStockSourceKey,{row:g,count:0,sum:0n});nativeGroups.add(JSON.stringify([g.warehouseId,g.skuId]));
  warehouseTotals.set(g.warehouseSourceKey,(warehouseTotals.get(g.warehouseSourceKey)??0n)+BigInt(g.signedQuantity));
 }
 for(const r of s.contributors){
  must(fullExact(r,['sourceRowId','sourceKey','sourceFileSha256','rowSha256','fileRef','sheet','rowNo','warehouseSourceKey','canonicalSkuSourceKey','oldSkuSourceId','canonicalStockSourceKey','warehouseId','skuId','signedQuantity','sourceUnit'])
   &&uuid(r.sourceRowId)&&!ids.has(r.sourceRowId)&&fullHash(r.sourceFileSha256)&&fullHash(r.rowSha256)&&fullInteger(r.signedQuantity),'FULL_PAYLOAD_CONTRIBUTOR');ids.add(r.sourceRowId);
  const g=byGroup.get(r.canonicalStockSourceKey);
  must(g&&['warehouseSourceKey','canonicalSkuSourceKey','warehouseId','skuId','sourceUnit'].every(k=>r[k]===g.row[k]),'FULL_PAYLOAD_CONTRIBUTOR_GROUP');g.count++;g.sum+=BigInt(r.signedQuantity);
  const key=JSON.stringify([r.warehouseSourceKey,r.sourceUnit]);unitTotals.set(key,(unitTotals.get(key)??0n)+BigInt(r.signedQuantity));
 }
 for(const {row,count,sum}of byGroup.values())must(count===row.contributorCount&&sum===BigInt(row.signedQuantity),'FULL_PAYLOAD_GROUP_CONSERVATION');
 const stockConservation={version:NATIVE_IMPORT_STOCK_CONSERVATION_VERSION,selectionSha256:b.selectionSha256,effectiveStockCsvSha256:s.effectiveStockCsvSha256,
  contributorLineageCsvSha256:s.contributorLineageCsvSha256,contributorCount:s.contributors.length,effectiveGroupCount:s.effectiveGroups.length,
  contributorsManifestHash:nativeStockContributorsManifestHash(s.contributors),effectiveGroupsManifestHash:nativeStockEffectiveGroupsManifestHash(s.effectiveGroups),
  warehouses:[...s.warehouses].sort((a,b)=>a.sourceKey<b.sourceKey?-1:a.sourceKey>b.sourceKey?1:0),warehouseUnits:[...s.warehouseUnits].sort((a,b)=>{const x=JSON.stringify([a.warehouseSourceKey,a.sourceUnit]),y=JSON.stringify([b.warehouseSourceKey,b.sourceUnit]);return x<y?-1:x>y?1:0;})};
 validateNativeStockConservationPlan(stockConservation);
 const warehouseKeys=new Set(stockConservation.warehouses.map(w=>w.sourceKey));
 must([...byGroup.values()].every(({row})=>stockConservation.warehouses.some(w=>w.sourceKey===row.warehouseSourceKey&&w.nativeId===row.warehouseId)),'FULL_PAYLOAD_WAREHOUSE_IDENTITY');
 for(const w of stockConservation.warehouses)must(BigInt(w.signedQuantity)===(warehouseTotals.get(w.sourceKey)??0n),'FULL_PAYLOAD_WAREHOUSE_CONSERVATION');
 must([...warehouseTotals.keys()].every(k=>warehouseKeys.has(k))&&stockConservation.warehouseUnits.length===unitTotals.size
  &&stockConservation.warehouseUnits.every(r=>unitTotals.has(JSON.stringify([r.warehouseSourceKey,r.sourceUnit]))&&BigInt(r.signedQuantity)===unitTotals.get(JSON.stringify([r.warehouseSourceKey,r.sourceUnit]))),'FULL_PAYLOAD_UNIT_CONSERVATION');
 must(fullExact(o.inventoryExpectedCounts,fullTargets)&&Object.values(o.inventoryExpectedCounts).every(fullCount)&&o.inventoryExpectedCounts.WAREHOUSE===53
  &&o.inventoryExpectedCounts.INVENTORY_LEDGER===s.effectiveGroups.length&&o.inventoryExpectedCounts.IMPORT_BATCH===1,'FULL_PAYLOAD_INVENTORY_COUNTS');
 const dataManifest={...b,core:c,groups,expectedCounts:o.expectedCounts,expectedSourceEntityCounts:o.expectedSourceEntityCounts,inventoryExpectedCounts:o.inventoryExpectedCounts,stock:stockConservation};
 const authorizedPayloadHash=requestHash(dataManifest);
 must(authorizedPayloadHash!==b.selectionSha256&&authorizedPayloadHash!==c.coreSourceDigest,'FULL_PAYLOAD_DISTINCT_SCOPE');
 return {dataManifest,authorizedPayloadHash,sourceClosurePins:groups.map(g=>({group:g.group,sha256:requestHash(g)})),stockConservation};
}

/** No pool/gate/authority/retry. Streams are the caller's actual original reader results;
 * verifiedCurrent is D1's locked continuation readback, not a passed/count flag. */
export async function prepareFullSourceBindings26({data,sourceRows,typedRows,documents,warehouses,skuMemberships,baselineItems,
 verifiedCurrent,actorAccountId,sourceManifestRef,requestKeys,chunkRows=CUTOFF_IMPORT_CHUNK_LIMIT,originalCommands,originalExpected}){
 const prepared=prepareFullPayloadData26(data),m=prepared.dataManifest,b={batchId:m.batchId,fixedSourceNamespace:m.fixedSourceNamespace,selectionSha256:m.selectionSha256};
 const current=verifiedCurrent;capture(current);
 must(current&&current.actorAccountId===actorAccountId&&uuid(actorAccountId)&&current.fixedSourceNamespace===b.fixedSourceNamespace&&current.selectionSha256===b.selectionSha256
  &&Array.isArray(current.coreClaims)&&current.coreClaims.length===22&&Array.isArray(current.claims)&&Array.isArray(current.committedOperations)
  &&Array.isArray(current.coreWarehouses)&&current.coreWarehouses.length===22
  &&current.coreClaims.every(c=>c.batchId===b.batchId&&c.operationId===m.core.coreReceiptId&&c.checkpointSequence===1&&c.targetType==='WAREHOUSE'),'FULL_PREP_VERIFIED_CURRENT_REQUIRED');
 must(current.checkpoint&&fullCount(current.checkpoint.sequence)&&fullCount(current.checkpoint.cursor)&&current.claims.length===current.checkpoint.cursor
  &&fullTargets.every(t=>current.claims.filter(c=>c.targetType===t).length===current.checkpoint.counts[t])
  &&new Set(current.claims.map(c=>c.importRecordId)).size===current.claims.length
  &&current.coreClaims.every(c=>current.claims.some(r=>requestHash(r)===requestHash(c))),'FULL_PREP_VERIFIED_CURRENT_REQUIRED');
 must(Array.isArray(warehouses)&&warehouses.length===53&&Array.isArray(skuMemberships)&&skuMemberships.length===m.inventoryExpectedCounts.SKU
  &&Array.isArray(baselineItems)&&baselineItems.length===m.inventoryExpectedCounts.INVENTORY_LEDGER,'FULL_PREP_ALL_MAIN_ITEMS_REQUIRED');
 const allItems=[...warehouses,...skuMemberships,...baselineItems],itemKeys=new Set(),recordIds=new Set();
 for(const item of allItems){
  const c={action:'IMPORT_CHUNK',actorAccountId,batchId:b.batchId,requestKey:'preparation-item-validation',expectedSequence:0,expectedCursor:0,accountingVersion:NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION,items:[item]};
  validateNativeImportAccountingCommand(c);
  const key=JSON.stringify([item.sourceEntityType,item.sourceKey]);must(!itemKeys.has(key),'FULL_PREP_DUPLICATE_ITEM');itemKeys.add(key);
  if(item.targetType!=='INVENTORY_LEDGER'){must(!recordIds.has(item.nativeRecord.id),'FULL_PREP_DUPLICATE_ITEM');recordIds.add(item.nativeRecord.id);}
  else must(data.stock.effectiveGroups.some(g=>g.canonicalStockSourceKey===item.sourceKey&&g.warehouseId===item.warehouseId&&g.skuId===item.skuId&&BigInt(g.signedQuantity)===item.quantity),'FULL_PREP_BASELINE_CHANGED');
 }
 must(warehouses.every(w=>w.targetType==='WAREHOUSE')&&skuMemberships.every(w=>w.targetType==='SKU')&&baselineItems.every(w=>w.targetType==='INVENTORY_LEDGER')
  &&new Set(warehouses.map(w=>w.targetId)).size===53&&new Set(skuMemberships.map(w=>w.targetId)).size===skuMemberships.length
  &&warehouses.every(w=>m.stock.warehouses.some(r=>r.nativeId===w.targetId&&r.sourceKey===w.sourceKey)),'FULL_PREP_MAIN_IDENTITY');
 must(current.coreWarehouses.every(w=>warehouses.some(item=>requestHash(item)===requestHash(w))),'FULL_PREP_CORE_WAREHOUSES_CHANGED');
 const expectedScope={...b,authorizedPayloadHash:prepared.authorizedPayloadHash,expectedCounts:m.expectedCounts,expectedSourceEntityCounts:m.expectedSourceEntityCounts};
 let expected;
 if(originalCommands){expected=captureHistoryTypedClosureStageInput(originalExpected);must(expected.batchId===b.batchId&&expected.fixedSourceNamespace===b.fixedSourceNamespace
  &&expected.plan.authorizedPayloadHash===prepared.authorizedPayloadHash&&requestHash(expected.plan.expectedCounts)===requestHash(m.expectedCounts)
  &&requestHash(expected.plan.sourceEntityCounts)===requestHash(m.expectedSourceEntityCounts),'FULL_PREP_ORIGINAL_EXPECTED_CHANGED');}
 else{
  const sourceMembers=new Map(m.core.coreMembers.map(r=>[r.sourceRowId,r])),proofs=new Map(m.core.staffProofs.map(r=>[r.sourceRowId,r.bootstrapAccounts]));
  const nativeMembers=new Map(m.core.coreMaintenanceBinding.members.map(r=>[JSON.stringify([r.entity.toLowerCase(),r.nativeId]),r.nativeSnapshot]));
  const seenSource=new Set(),seenNative=new Set();
  async function* originalSources(){for await(const row of sourceRows){const p=row.projection,member=sourceMembers.get(p?.id);
    if(member){must(row.relation==='import_source_row'&&p.batch_id===b.batchId&&p.entity_type===member.entity&&p.source_key===member.sourceKey&&!seenSource.has(p.id),'FULL_PREP_CORE_SOURCE_CHANGED');seenSource.add(p.id);
      if(proofs.has(p.id))must(requestHash(p.field_provenance?.fields?.bootstrap_accounts)===requestHash(proofs.get(p.id)),'FULL_PREP_ORIGINAL_PROOF_CHANGED');}
    yield row;
   }must(seenSource.size===115,'FULL_PREP_CORE_SOURCE_MISSING');}
  async function* currentNatives(){for await(const row of typedRows){const key=JSON.stringify([row.relation,row.projection?.id]),native=nativeMembers.get(key);
    if(native){must(!seenNative.has(key)&&requestHash(native)===requestHash(row.projection),'FULL_PREP_CORE_NATIVE_CHANGED');seenNative.add(key);}yield row;
   }must(seenNative.size===115,'FULL_PREP_CORE_NATIVE_MISSING');}
  expected=await buildHistoryTypedClosureExpected26({...expectedScope,documents,sourceRows:originalSources(),typedRows:currentNatives()});
 }
 let commands;
 if(originalCommands){capture(originalCommands);commands=structuredClone(originalCommands);must(fullExact(commands,['BIND','ACCOUNT','PUBLISH'])&&Array.isArray(commands.ACCOUNT),'FULL_PREP_ORIGINAL_COMMANDS_REQUIRED');}
 else{
  const cp=current.checkpoint;must(current.fullBinding===null&&current.status==='STAGED'&&cp.cursor===22&&current.claims.length===22
   &&requestHash(cp.counts)===requestHash({WAREHOUSE:22,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:0})&&Object.keys(cp.expected).length===0
   &&fullCount(cp.sequence)&&cp.sequence>=1,'FULL_PREP_ORIGINAL_COMMANDS_REQUIRED');
  must(fullCount(chunkRows)&&chunkRows>0&&chunkRows<=CUTOFF_IMPORT_CHUNK_LIMIT,'FULL_PREP_CHUNK_BOUND');
  const coreRecords=new Set(current.coreClaims.map(c=>c.importRecordId));
  must(warehouses.filter(w=>coreRecords.has(w.nativeRecord.id)&&current.coreClaims.some(c=>c.targetId===w.targetId&&c.importRecordId===w.nativeRecord.id)).length===22,'FULL_PREP_CORE_WAREHOUSES_CHANGED');
  const remaining=[...warehouses.filter(w=>!coreRecords.has(w.nativeRecord.id)),...skuMemberships,...baselineItems];
  must(requestKeys&&typeof requestKeys.bind==='string'&&typeof requestKeys.publish==='string'&&Array.isArray(requestKeys.account)
   &&requestKeys.account.length===Math.ceil(remaining.length/chunkRows),'FULL_PREP_FROZEN_KEYS_REQUIRED');
  let sequence=cp.sequence,cursor=cp.cursor;
  const BIND={action:'IMPORT_BIND_FULL_SOURCE',actorAccountId,batchId:b.batchId,requestKey:requestKeys.bind,expectedSequence:sequence,expectedCursor:cursor,
   fullBinding:{authorizedPayloadHash:prepared.authorizedPayloadHash,historyExpectedCounts:m.expectedCounts,inventoryExpectedCounts:m.inventoryExpectedCounts,sourceClosurePins:prepared.sourceClosurePins,
    coreReceiptId:m.core.coreReceiptId,coreSourceDigest:m.core.coreSourceDigest,coreMaintenanceBinding:m.core.coreMaintenanceBinding}};sequence++;
  const ACCOUNT=[];for(let i=0;i<remaining.length;i+=chunkRows){const items=remaining.slice(i,i+chunkRows);ACCOUNT.push({action:'IMPORT_CHUNK',actorAccountId,batchId:b.batchId,requestKey:requestKeys.account[ACCOUNT.length],expectedSequence:sequence,expectedCursor:cursor,accountingVersion:NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION,items});sequence++;cursor+=items.length;}
  const PUBLISH={action:'IMPORT_PUBLISH',actorAccountId,batchId:b.batchId,requestKey:requestKeys.publish,expectedSequence:sequence,expectedCursor:cursor,accountingVersion:NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION,
   approval:{completeScope:true,absentMeansZero:true,allFilesVerified:true,finalDeltaVerified:true,noUnresolvedExceptions:true,sourceHash:b.selectionSha256,sourceManifestRef},stockConservation:prepared.stockConservation,historyClosure:expected.plan};
  commands={BIND,ACCOUNT,PUBLISH};
 }
 const ordered=[commands.BIND,...commands.ACCOUNT,commands.PUBLISH],keys=new Set(),represented=new Set(),coreRecords=new Set(current.coreClaims.map(c=>c.importRecordId));
 let seq=commands.BIND.expectedSequence,cursor=22;
 for(const command of ordered){
  validateCutoffImportCommand(command);if(command.action!=='IMPORT_BIND_FULL_SOURCE')validateNativeImportAccountingCommand(command);
  must(command.actorAccountId===actorAccountId&&command.batchId===b.batchId&&typeof command.requestKey==='string'&&command.requestKey.length>0&&!keys.has(command.requestKey)
   &&command.expectedSequence===seq&&command.expectedCursor===cursor,'FULL_PREP_COMMAND_CHAIN');keys.add(command.requestKey);seq++;
  if(command.action==='IMPORT_CHUNK')for(const item of command.items){const key=JSON.stringify([item.sourceEntityType,item.sourceKey]);must(!represented.has(key)&&allItems.some(r=>requestHash(r)===requestHash(item))
    &&(item.targetType==='INVENTORY_LEDGER'||!coreRecords.has(item.nativeRecord.id)),'FULL_PREP_COMMAND_ITEM_CHANGED');represented.add(key);cursor++;}
 }
 must(commands.BIND.action==='IMPORT_BIND_FULL_SOURCE'&&commands.ACCOUNT.every(c=>c.action==='IMPORT_CHUNK')&&commands.PUBLISH.action==='IMPORT_PUBLISH'
  &&requestHash(commands.BIND.fullBinding)===requestHash({authorizedPayloadHash:prepared.authorizedPayloadHash,historyExpectedCounts:m.expectedCounts,inventoryExpectedCounts:m.inventoryExpectedCounts,sourceClosurePins:prepared.sourceClosurePins,coreReceiptId:m.core.coreReceiptId,coreSourceDigest:m.core.coreSourceDigest,coreMaintenanceBinding:m.core.coreMaintenanceBinding})
  &&represented.size===allItems.length-22&&cursor===Object.values(m.inventoryExpectedCounts).reduce((a,n)=>a+n,0)-1
  &&requestHash(commands.PUBLISH.historyClosure)===requestHash(expected.plan)&&requestHash(commands.PUBLISH.stockConservation)===requestHash(prepared.stockConservation)
  &&commands.PUBLISH.approval.sourceManifestRef===sourceManifestRef,'FULL_PREP_COMPLETE_COMMAND_SCOPE');
 const prefix=current.committedOperations.filter(r=>['IMPORT_BIND_FULL_SOURCE','IMPORT_CHUNK','IMPORT_PUBLISH'].includes(r.action));
 must(prefix.length<=ordered.length,'FULL_PREP_COMMITTED_PREFIX_CONFLICT');
 for(let i=0;i<prefix.length;i++){const r=prefix[i],c=ordered[i];must(r.requestKey===c.requestKey&&r.requestHash===requestHash(c)&&r.action===c.action
  &&r.operationId===stableImportId('operation',actorAccountId,c.requestKey)&&r.beforeCheckpoint.sequence===c.expectedSequence&&r.beforeCheckpoint.cursor===c.expectedCursor,'FULL_PREP_COMMITTED_PREFIX_CONFLICT');}
 if(prefix.length)must(requestHash(prefix.at(-1).checkpoint)===requestHash(current.checkpoint)&&current.fullBinding?.authorizedPayloadHash===prepared.authorizedPayloadHash,'FULL_PREP_COMMITTED_PREFIX_CONFLICT');
 else must(current.checkpoint.sequence===commands.BIND.expectedSequence&&current.checkpoint.cursor===commands.BIND.expectedCursor&&current.fullBinding===null,'FULL_PREP_COMMITTED_PREFIX_CONFLICT');
 must((current.status==='IMPORTED')===(prefix.length===ordered.length),'FULL_PREP_PUBLICATION_OUTCOME_CONFLICT');
 return {...prepared,expected,commands,remainingCommands:ordered.slice(prefix.length),reusedOriginalCommands:!!originalCommands,
  executionAuthorizationIssued:false,executionReady:false};
}

/** First preparation only. Resumes reuse the original command files byte-for-byte. */
export async function writeFullSourceBindings26({outputParent,registrationId,prepared}){
 must(isAbsolute(outputParent)&&typeof registrationId==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(registrationId)&&prepared.executionAuthorizationIssued===false
  &&prepared.executionReady===false&&!prepared.reusedOriginalCommands,'FULL_PREP_PRIVATE_OUTPUT');
 const parent=resolve(outputParent),root=fileURLToPath(new URL('../../',import.meta.url));
 must(parent!==resolve(root)&&!parent.startsWith(resolve(root)+'/')&&(await lstat(parent)).isDirectory(),'FULL_PREP_PRIVATE_OUTPUT');
 const directory=join(parent,registrationId);await mkdir(directory,{mode:0o700});const files=[];
 const save=async(logicalRole,name,value)=>{const bytes=Buffer.from(JSON.stringify(value,(_k,v)=>typeof v==='bigint'?{__bigint:v.toString()}:v,2)+'\n');
  if(['BIND','ACCOUNT','PUBLISH'].includes(logicalRole))must(bytes.length<=4194304,'FULL_PREP_ORIGINAL_COMMAND_FILE_LIMIT');
  await writeFile(join(directory,name),bytes,{flag:'wx',mode:0o600});files.push({logicalRole,path:join(directory,name),bytes:bytes.length,sha256:hash(bytes)});};
 await save('FULL_DATA','DATA.json',prepared.dataManifest);await save('EXPECTED','EXPECTED.json',prepared.expected);
 await save('BIND','BIND.json',prepared.commands.BIND);
 for(let i=0;i<prepared.commands.ACCOUNT.length;i++)await save('ACCOUNT',`ACCOUNT-${String(i+1).padStart(6,'0')}.json`,prepared.commands.ACCOUNT[i]);
 await save('PUBLISH','PUBLISH.json',prepared.commands.PUBLISH);
 const manifest={authorizedPayloadHash:prepared.authorizedPayloadHash,executionAuthorizationIssued:false,executionReady:false,files};
 await writeFile(join(directory,'MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});return {directory,...manifest};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  must(process.argv.length === 3 && isAbsolute(process.argv[2]), 'NATIVE_BINDING_USAGE');
  const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
  prepareNativeBindings(config).then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(error => { process.stderr.write(JSON.stringify({ status: 'FAIL_PREPARATION', code: error.code ?? 'NATIVE_BINDING_FAILED' }) + '\n'); process.exitCode = 1; });
}
