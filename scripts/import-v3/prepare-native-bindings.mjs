/** Private, connection-free preparation. New UUIDs are allocated once and frozen;
 * this package is a review candidate, never its own authorization or old approval. */
import { randomUUID, createHash } from 'node:crypto';
import { lstat, mkdir, chmod, readFile, writeFile, statfs } from 'node:fs/promises';
import { resolve, join, isAbsolute } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { preflightV2 } from '../import-v2/run.mjs';
import { parseV2Csv } from '../../packages/application/src/import-v2.ts';
import { IMPORT_V2_TABLES } from '../../packages/application/src/import-v2-contract.ts';
import { stableImportId } from '../../packages/application/src/inventory-cutoff-import.ts';
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
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  must(process.argv.length === 3 && isAbsolute(process.argv[2]), 'NATIVE_BINDING_USAGE');
  const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
  prepareNativeBindings(config).then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(error => { process.stderr.write(JSON.stringify({ status: 'FAIL_PREPARATION', code: error.code ?? 'NATIVE_BINDING_FAILED' }) + '\n'); process.exitCode = 1; });
}
