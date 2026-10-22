/** Private server-side exact first-STAGE bootstrap. Source credentials never enter
 * MAIN payloads, journals, reports or HTTP. The caller owns all source lifetimes. */
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { requestHash } from '../../packages/application/src/request-hash.ts';
import { validateCutoffImportCommand, stableImportId } from '../../packages/application/src/inventory-cutoff-import.ts';
import { HISTORY_MAPPING_VERSION } from '../../packages/application/src/history-storage-contract.ts';
import { wrapTrustedLegacyCredential } from '../../packages/authentication/src/legacy-passwords.ts';
import { stageNativePartyImportsOnClient } from '../../adapters/postgres/src/native-party-import.ts';

const must = (ok, code) => { if (!ok) throw Object.assign(Error(code), { code }); };
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const uuid = x => typeof x === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x);
const text = x => typeof x === 'string' && x.trim().length > 0 && x.length <= 1000 && !/[\0-\x1f\x7f]/.test(x);
function own(value, names) {
  must(value && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === names.length, 'NATIVE_BOOTSTRAP_CONFIG');
  const result = {}; for (const name of names) { const d = Object.getOwnPropertyDescriptor(value, name); must(d?.enumerable && Object.hasOwn(d, 'value'), 'NATIVE_BOOTSTRAP_CONFIG'); result[name] = d.value; } return result;
}
const same = (a, b) => ['dev', 'ino', 'size', 'mode', 'mtimeMs', 'ctimeMs'].every(k => a[k] === b[k]);
async function pinnedJson(path, expected, maximum = 4194304) {
  must(typeof path === 'string' && isAbsolute(path) && hash(expected), 'NATIVE_BOOTSTRAP_OUTSIDE_PIN');
  const before = await lstat(path); must(before.isFile() && !before.isSymbolicLink() && (before.mode & 0o077) === 0 && before.size <= maximum, 'NATIVE_BOOTSTRAP_PRIVATE_FILE');
  const bytes = await readFile(path), after = await lstat(path);
  must(bytes.length === before.size && same(before, after) && createHash('sha256').update(bytes).digest('hex') === expected, 'NATIVE_BOOTSTRAP_FILE_CHANGED');
  return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes));
}
const EMPTY_TABLES = ['audit_change', 'auth_session', 'barcode_scheme', 'color', 'customer', 'fit', 'hall', 'history_revision', 'history_sales_header',
  'history_sales_line', 'history_sales_settlement', 'history_transfer_header', 'history_transfer_line', 'import_header_native_reference',
  'import_history_closure_manifest', 'import_history_document_manifest', 'import_native_catalogue_binding', 'import_native_payment_binding', 'import_record',
  'import_record_accounting_claim', 'import_sku_alias', 'import_source_row', 'import_stock_contributor', 'inventory_balance', 'inventory_ledger',
  'native_party_import_evidence', 'operation_receipt', 'payment_account', 'payment_account_hall', 'payment_method', 'product', 'product_category',
  'product_image', 'sales_header', 'sales_line', 'sales_settlement', 'season', 'size', 'size_group', 'size_group_member', 'sku', 'sku_barcode', 'staff',
  'supplier', 'transfer_header', 'transfer_line', 'user_account', 'warehouse'];

export async function openNativeImportBootstrap(options) {
  const o = own(options, ['binding', 'accountSourceFile', 'trustedAccountSourceSha256', 'accountDecisionFile', 'trustedAccountDecisionSha256', 'reviewFile', 'trustedReviewSha256', 'partySource']);
  // Descriptor inspection before clone/file IO; none of these fields is inferred from the command.
  requestHash(o.binding); const b = structuredClone(o.binding);
  must(b.version === 'NATIVE_IMPORT_EXECUTION_19_V1' && uuid(b.batchId) && uuid(b.actorAccountId) && text(b.fixedSourceNamespace)
    && text(b.cutoffAt) && hash(b.selectionSha256) && hash(b.authorizedPayloadHash), 'NATIVE_BOOTSTRAP_BINDING');
  own(b.target, ['database', 'role', 'serverAddress', 'serverPort', 'postmasterStartedAt']);
  must(text(b.target.database) && text(b.target.role) && text(b.target.postmasterStartedAt)
    && (b.target.serverAddress === null ? b.target.serverPort === null : text(b.target.serverAddress) && Number.isInteger(b.target.serverPort)), 'NATIVE_BOOTSTRAP_TARGET');
  const party = {};
  for (const name of ['verify', 'bootstrapPartyClosure', 'authorizePartyChunk']) {
    const d = Object.getOwnPropertyDescriptor(o.partySource ?? {}, name); must(d?.enumerable && Object.hasOwn(d, 'value') && typeof d.value === 'function', 'NATIVE_BOOTSTRAP_PARTY_SOURCE'); party[name] = d.value.bind(o.partySource);
  }
  const source = await pinnedJson(o.accountSourceFile, o.trustedAccountSourceSha256), decisions = await pinnedJson(o.accountDecisionFile, o.trustedAccountDecisionSha256), review = await pinnedJson(o.reviewFile, o.trustedReviewSha256);
  must(source.format === 'PRIVATE_OLD_ACCOUNT_SOURCE_CAPTURE_V1' && Array.isArray(source.rows) && source.rows.length > 0 && source.rows.length <= 49
    && text(source.oldSourceBatchId) && hash(source.oldSourceManifestSha256), 'NATIVE_BOOTSTRAP_ACCOUNT_SOURCE');
  must(decisions.version === 'NATIVE_ACCOUNT_IDENTITY_CANDIDATE_V1' && decisions.containsCredentials === false && decisions.containsLoginNames === false
    && decisions.sourceCaptureSha256 === o.trustedAccountSourceSha256 && Array.isArray(decisions.accounts) && Array.isArray(decisions.unlinked), 'NATIVE_BOOTSTRAP_ACCOUNT_DECISIONS');
  must(review.version === 'C_NATIVE_ACCOUNT_BOOTSTRAP_REVIEW_V1' && review.sourceCaptureSha256 === o.trustedAccountSourceSha256
    && review.accountDecisionSha256 === o.trustedAccountDecisionSha256 && hash(review.stageCommandSha256)
    && review.oldSourceBatchId === source.oldSourceBatchId && review.oldSourceManifestSha256 === source.oldSourceManifestSha256
    && requestHash(review.binding) === requestHash(b) && review.expectedSourceRows === source.rows.length
    && review.expectedLinkedRows === decisions.accounts.length && review.expectedUnlinkedRows === decisions.unlinked.length
    && ['batchId', 'fixedSourceNamespace', 'selectionSha256'].every(k => decisions[k] === b[k]), 'NATIVE_BOOTSTRAP_REVIEW_BINDING');
  const sourceById = new Map(), nativeAccounts = new Set(), nativeStaff = new Set(), logins = new Set(), prepared = [];
  const linked = source.rows.filter(row => row.sourceEmployeeNativeId !== null), unlinked = source.rows.filter(row => row.sourceEmployeeNativeId === null);
  must(linked.length === decisions.accounts.length && unlinked.length === decisions.unlinked.length, 'NATIVE_BOOTSTRAP_FULL_ACCOUNT_SET');
  for (const row of source.rows) {
    must(text(row.sourceAccountId) && !sourceById.has(row.sourceAccountId) && row.oldSourceBatchId === source.oldSourceBatchId, 'NATIVE_BOOTSTRAP_ACCOUNT_IDENTITY');
    sourceById.set(row.sourceAccountId, row);
    // All captured formats are checked, including retained unlinked records. No password is read.
    wrapTrustedLegacyCredential({ salt: row.credentialSalt, hash: row.credentialHash });
  }
  must(requestHash(decisions.unlinked.map(r => r.sourceAccountId).sort()) === requestHash(unlinked.map(r => r.sourceAccountId).sort()), 'NATIVE_BOOTSTRAP_UNLINKED_SET');
  for (const mapping of decisions.accounts) {
    const row = sourceById.get(mapping.sourceAccountId);
    must(row && row.sourceEmployeeNativeId !== null && row.sourceAccountId === row.sourceEmployeeNativeId && mapping.staffSourceKey === row.sourceEmployeeNativeId
      && mapping.sourceEmployeeNativeId === row.sourceEmployeeNativeId && mapping.sourceEmployeeCode === row.sourceEmployeeCode
      && Number.isSafeInteger(row.sourceAccountVersion) && row.sourceAccountVersion === mapping.sourceAccountVersion
      && uuid(mapping.nativeAccountId) && mapping.nativeAccountId !== row.sourceAccountId && !nativeAccounts.has(mapping.nativeAccountId)
      && uuid(mapping.nativeStaffId) && !nativeStaff.has(mapping.nativeStaffId) && text(row.loginName) && !logins.has(row.loginName)
      && typeof row.sourceLoginEnabled === 'boolean' && typeof row.sourceEnabled === 'boolean'
      && ['sourceRole', 'sourceHallId', 'sourceStoreId', 'sourceEmploymentStatus', 'sourceLoginEnabled', 'sourceEnabled'].every(k => mapping[k] === row[k]), 'NATIVE_BOOTSTRAP_EXACT_ACCOUNT_MAPPING');
    const closure = await party.bootstrapPartyClosure(mapping.staffSourceKey), staff = closure.staff;
    must(staff.sourceKey === mapping.staffSourceKey && staff.nativeId === mapping.nativeStaffId && staff.role === mapping.nativeRole && staff.role === row.sourceRole
      && staff.hallId === mapping.nativeHallId && staff.employmentStatus === row.sourceEmploymentStatus
      && (staff.source.normalizedFields['所属厅来源编号'] || null) === row.sourceHallId
      && (row.sourceStoreId === null || row.sourceStoreId === row.sourceHallId), 'NATIVE_BOOTSTRAP_STAFF_FACTS_CHANGED');
    must(await party.authorizePartyChunk(closure.chunk) === undefined, 'NATIVE_BOOTSTRAP_PARTY_AUTHORIZATION');
    prepared.push({ sourceAccountId: row.sourceAccountId, nativeId: mapping.nativeAccountId, staffId: mapping.nativeStaffId, loginName: row.loginName,
      passwordHash: wrapTrustedLegacyCredential({ salt: row.credentialSalt, hash: row.credentialHash }), loginEnabled: row.sourceLoginEnabled && row.sourceEnabled,
      sourceRole: row.sourceRole, sourceEmploymentStatus: row.sourceEmploymentStatus, hallId: mapping.nativeHallId, staffSourceKey: mapping.staffSourceKey });
    nativeAccounts.add(mapping.nativeAccountId); nativeStaff.add(mapping.nativeStaffId); logins.add(row.loginName);
  }
  must(prepared.length === linked.length && new Set(prepared.map(r => r.sourceAccountId)).size === linked.length, 'NATIVE_BOOTSTRAP_FULL_ACCOUNT_SET');
  const importer = prepared.filter(row => row.sourceRole === 'ADMIN' && row.sourceEmploymentStatus === '在职' && row.loginEnabled && row.hallId === null)
    .sort((a, b) => a.sourceAccountId < b.sourceAccountId ? -1 : a.sourceAccountId > b.sourceAccountId ? 1 : 0)[0];
  must(importer && importer.nativeId === b.actorAccountId && decisions.importerCandidate.sourceAccountId === importer.sourceAccountId
    && decisions.importerCandidate.nativeAccountId === importer.nativeId && review.importerSourceAccountId === importer.sourceAccountId, 'NATIVE_BOOTSTRAP_REAL_IMPORTER');
  prepared.sort((a, c) => a === importer ? -1 : c === importer ? 1 : a.sourceAccountId < c.sourceAccountId ? -1 : 1);
  let closed = false;
  const active = () => must(!closed, 'NATIVE_BOOTSTRAP_CLOSED');
  async function verifySources() {
    active(); await pinnedJson(o.accountSourceFile, o.trustedAccountSourceSha256); await pinnedJson(o.accountDecisionFile, o.trustedAccountDecisionSha256);
    await pinnedJson(o.reviewFile, o.trustedReviewSha256); must(await party.verify() === undefined, 'NATIVE_BOOTSTRAP_PARTY_AUTHORIZATION'); active();
  }
  async function authorizeStageSourceActor(actorAccountId, command) {
    active(); validateCutoffImportCommand(command);
    must(command.action === 'IMPORT_STAGE' && actorAccountId === b.actorAccountId && command.actorAccountId === b.actorAccountId && command.batchId === b.batchId
      && command.mappingVersion === HISTORY_MAPPING_VERSION && command.sourceName === b.fixedSourceNamespace && command.sourceHash === b.selectionSha256
      && command.cutoffAt === b.cutoffAt && command.historyMetadata?.payloadHash === b.authorizedPayloadHash
      && requestHash(command) === review.stageCommandSha256, 'NATIVE_BOOTSTRAP_STAGE_SOURCE_AUTHORIZATION');
    await verifySources();
  }
  return {
    report: Object.freeze({ kind: 'NATIVE_IMPORT_PRIVATE_SOURCE_ACCOUNT_BOOTSTRAP_V1', sourceAccounts: source.rows.length, preparedAccounts: prepared.length,
      unlinkedRetained: unlinked.length, importerSourceAccountId: importer.sourceAccountId, importerNativeAccountId: importer.nativeId,
      credentialsExposed: false, newDatabaseWrites: 0, fullImportReady: false }),
    authorizeStageSourceActor,
    stageBootstrap: { async stageNewBatch(client, input) {
      active(); must(typeof client?.query === 'function' && input?.operationId === stableImportId('operation', b.actorAccountId, input.command?.requestKey), 'NATIVE_BOOTSTRAP_CONTEXT');
      must(typeof input.now === 'string' && input.now.endsWith('Z') && Number.isFinite(Date.parse(input.now)), 'NATIVE_BOOTSTRAP_TIME');
      await authorizeStageSourceActor(b.actorAccountId, input.command);
      const targets = (await client.query(`/* native-bootstrap:target */ SELECT current_database()::text database,current_user::text role,
        inet_server_addr()::text server_address,inet_server_port() server_port,pg_postmaster_start_time()::text postmaster_started_at,
        (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) versions`)).rows;
      const r = targets[0], t = b.target;
      must(targets.length === 1 && r.database === t.database && r.role === t.role && r.server_address === t.serverAddress && r.server_port === t.serverPort
        && r.postmaster_started_at === t.postmasterStartedAt && Array.isArray(r.versions) && r.versions.length === 19 && r.versions.every((n, i) => n === i + 1), 'NATIVE_BOOTSTRAP_TARGET_CHANGED');
      const batches = (await client.query(`/* native-bootstrap:one-new-batch */ SELECT id,source_name,source_hash,status,
        (SELECT count(*)::integer FROM naijue_erp.import_batch) batch_count FROM naijue_erp.import_batch WHERE id=$1::uuid`, [b.batchId])).rows;
      must(batches.length === 1 && batches[0].id === b.batchId && batches[0].source_name === b.fixedSourceNamespace && batches[0].source_hash === b.selectionSha256
        && batches[0].status === 'STAGED' && batches[0].batch_count === 1, 'NATIVE_BOOTSTRAP_NOT_FIRST_BATCH');
      const empty = (await client.query(`/* native-bootstrap:empty-domain */ SELECT ${EMPTY_TABLES.map(name => `EXISTS(SELECT 1 FROM naijue_erp.${name})`).join(' OR ')} existing`)).rows;
      must(empty.length === 1 && empty[0].existing === false, 'NATIVE_BOOTSTRAP_TARGET_NOT_EMPTY');
      for (const row of prepared) {
        active(); const closure = await party.bootstrapPartyClosure(row.staffSourceKey); must(closure.staff.nativeId === row.staffId, 'NATIVE_BOOTSTRAP_STAFF_FACTS_CHANGED');
        must(await party.authorizePartyChunk(closure.chunk) === undefined, 'NATIVE_BOOTSTRAP_PARTY_AUTHORIZATION');
        await stageNativePartyImportsOnClient(client, closure.chunk);
        const saved = await client.query(`/* native-bootstrap:account */ INSERT INTO naijue_erp.user_account
          (id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at)
          VALUES ($1::uuid,$2::uuid,$3,$4,$5,1,1,$6::timestamptz,$6::timestamptz) RETURNING id,staff_id`,
        [row.nativeId, row.staffId, row.loginName, row.passwordHash, row.loginEnabled, input.now]);
        must(saved.rowCount === 1 && saved.rows[0]?.id === row.nativeId && saved.rows[0]?.staff_id === row.staffId, 'NATIVE_BOOTSTRAP_ACCOUNT_INSERT');
      }
      await verifySources();
    } },
    async close() { closed = true; prepared.length = 0; sourceById.clear(); nativeAccounts.clear(); nativeStaff.clear(); logins.clear(); }
  };
}
