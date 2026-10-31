/** Finite real-source host composition. No built-in native mapping or synthetic source factory. */
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve, dirname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { requestHash } from '../../packages/application/src/request-hash.ts';
import { NATIVE_PRODUCT_REFERENCE_DECISION_VERSION, NATIVE_PRODUCT_REFERENCE_DECISION_VERSION_26 } from '../../packages/application/src/native-product-import.ts';
import { openNativeProductAuthorizer, openNativeProductAuthorizer26 } from '../import-v2/authorized-native-product-reader.mjs';
import { openAuthorizedHistoryClosureReader, openAuthorizedHistoryClosureReader26, HISTORY_CLOSURE_SOURCE_GROUPS } from '../import-v2/authorized-history-closure-reader.mjs';

import { createNativeRuntime26Issuer } from '../../adapters/postgres/src/native-import-accounting-capability.ts';
import { checkedNativeRuntime26Capability } from '../../packages/application/src/native-import-schema-contract.ts';
import { historySettlementRequestHash } from '../../packages/application/src/import-v3-history-settlement.ts';

const fail = code => { throw Object.assign(new Error(code), { code }); };
const must = (ok, code) => { if (!ok) fail(code); };
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
function bag(value, keys, code = 'IMPORT_SOURCE_HOST_CONFIG') {
  must(value && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === keys.length, code);
  const result = {};
  for (const key of keys) { const d = Object.getOwnPropertyDescriptor(value, key); must(d && d.enumerable && Object.hasOwn(d, 'value'), code); result[key] = d.value; }
  return result;
}
const filePath = p => must(typeof p === 'string' && isAbsolute(p) && !p.includes('\0'), 'IMPORT_SOURCE_HOST_ABSOLUTE_PATH');
export function requiredNativeSourceInputs() {
  return {
    configVersion: 'NATIVE_IMPORT_SOURCE_HOST19_V1', providerVersion: 'NATIVE_IMPORT_PRODUCTION_PROVIDERS_19_V1',
    closureSourceGroups: [...HISTORY_CLOSURE_SOURCE_GROUPS],
    referenceDecision: { schemaVersion: 1, validatorVersion: NATIVE_PRODUCT_REFERENCE_DECISION_VERSION,
      fields: ['schemaVersion', 'validatorVersion', 'batchId', 'fixedSourceNamespace', 'selection', 'mappingFiles', 'decisions'],
      mappingFileFields: ['name', 'sha256'],
      decisionFields: ['sourceRowId', 'sourceKey', 'sourceEvidenceHash', 'product', 'blankPricePolicy', 'nullableFieldPolicy', 'references', 'decisionSha256'],
      referenceKinds: ['category', 'sizeGroup', 'season', 'supplier'], externalPinRequired: true },
    notEquivalentToReferenceDecision: ['size merge approval', 'barcode exclusion', 'whole32 money overlay', 'source manifest self-hash'],
    bindingOwnedBy: 'C: fixed namespace/batch/account/target and approved exact selection+cutoff; no user UUID question',
    sourceProviderRequired: 'Reviewed executable module with all 11 genuine closure source factories and row/native authorizers; absent producers fail before pool creation.'
  };
}
/** Successor source requirements only. The actual MAIN/closure executor and
 * same-client runtime issuer are supplied by their owners, never inferred here. */
export function requiredNativeSourceInputs26() {
  return { configVersion: 'NATIVE_IMPORT_SOURCE_HOST26_V1', providerVersion: 'NATIVE_IMPORT_PRODUCTION_PROVIDERS_26_V1',
    executionVersion: 'NATIVE_IMPORT_EXECUTION_26_V1', schemaProfile: 'EXACT26',
    closureSourceGroups: [...HISTORY_CLOSURE_SOURCE_GROUPS],
    referenceDecision: { schemaVersion: 2, validatorVersion: NATIVE_PRODUCT_REFERENCE_DECISION_VERSION_26,
      maximumBytes: 8 * 1024 * 1024, reviewVersion: 'C_NATIVE_PRODUCT_REFERENCE26_REVIEW_V1',
      reviewFileRequired: true, independentlySuppliedReviewPinRequired: true },
    requiredExecutionDependencies: ['D1 actual same-client NativeRuntime26Capability', 'Exact26 MAIN store including first-STAGE bootstrap SQL closure',
      'Exact26 complete typed projection and closure store', 'Reviewed concrete successor stores for every actual native step'],
    executionReady: false };
}
/** Only common job routing/bounds are reused from v19. This does not register
 * schema26 in any old runtime, change V1 validation or open a provider/pool. */
export function validateSourceHostJob26(value, at = Date.now()) {
  const c = bag(value, ['version', 'registrationId', 'deadlineUtc', 'maxSteps', 'binding', 'database', 'sources', 'providers']);
  must(c.version === 'NATIVE_IMPORT_SOURCE_HOST26_V1', 'IMPORT_SOURCE_HOST26_PROFILE');
  const core=c.binding?.phase==='CORE_INITIALIZATION_26_V1',resume=c.binding?.phase==='FULL_SOURCE_CONTINUATION_26_V1';
  const phaseKeys=core?['phase','coreSourceDigest']:resume?['phase','coreSourceDigest','coreReceiptId']:[];
  const binding = bag(c.binding, ['version', 'batchId', 'actorAccountId', 'fixedSourceNamespace', 'cutoffAt', 'selectionSha256', 'authorizedPayloadHash', 'target',...phaseKeys]);
  must(binding.version === 'NATIVE_IMPORT_EXECUTION_26_V1', 'IMPORT_SOURCE_HOST26_PROFILE');
  if(core){
    must(typeof c.registrationId==='string'&&/^[a-zA-Z0-9_.:-]{1,120}$/.test(c.registrationId),'IMPORT_SOURCE_HOST_REGISTRATION');
    must(typeof c.deadlineUtc==='string'&&c.deadlineUtc.endsWith('Z')&&Date.parse(c.deadlineUtc)>at&&Date.parse(c.deadlineUtc)-at<=2147483647,'IMPORT_SOURCE_HOST_WINDOW');
    must(Number.isSafeInteger(c.maxSteps)&&c.maxSteps>0&&c.maxSteps<=1000000,'IMPORT_SOURCE_HOST_LIMIT');
    must(uuid(binding.batchId)&&uuid(binding.actorAccountId)&&/^[a-z][a-z0-9_.:-]*$/.test(binding.fixedSourceNamespace)&&hash(binding.selectionSha256)&&hash(binding.coreSourceDigest)&&binding.authorizedPayloadHash===null,'IMPORT_SOURCE_HOST_BINDING');
    must(typeof binding.cutoffAt==='string'&&/(?:Z|[+-]\d\d:\d\d)$/.test(binding.cutoffAt)&&Number.isFinite(Date.parse(binding.cutoffAt)),'IMPORT_SOURCE_HOST_CUTOFF');
    bag(binding.target,['database','role','serverAddress','serverPort','postmasterStartedAt']);
    const db=bag(c.database,['host','port','database','user','tls','caFile','statementTimeoutMs']);
    must(typeof db.host==='string'&&db.host.length>0&&Number.isInteger(db.port)&&db.port>0&&db.port<=65535&&db.database===binding.target.database&&db.user===binding.target.role&&Number.isSafeInteger(db.statementTimeoutMs)&&db.statementTimeoutMs>0&&db.statementTimeoutMs<=2147483647,'IMPORT_SOURCE_HOST_DATABASE');
    must(db.tls==='verify-full'||db.tls==='local-transport','IMPORT_SOURCE_HOST_TLS');
    if(db.tls==='local-transport')must((['127.0.0.1','::1'].includes(db.host)||isAbsolute(db.host))&&db.caFile===null,'IMPORT_SOURCE_HOST_TLS');else if(db.caFile!==null)filePath(db.caFile);
    const sources=bag(c.sources,['reviewFile','trustedReviewSha256']),provider=bag(c.providers,['path','sha256']);filePath(sources.reviewFile);filePath(provider.path);must(hash(sources.trustedReviewSha256)&&hash(provider.sha256),'IMPORT_SOURCE_HOST_EXTERNAL_PIN_REQUIRED');
    return structuredClone(c);
  }
  if(resume)must(hash(binding.coreSourceDigest)&&uuid(binding.coreReceiptId),'IMPORT_SOURCE_HOST_BINDING');
  const ordinaryBinding={...binding};for(const key of phaseKeys)delete ordinaryBinding[key];
  const sourceKeys = ['base', 'v3Amendment', 'v3Approval', 'trustedApprovalSha256', 'approvedMoneyOverlaySha256', 'sourceRoot', 'spoolParent',
    'maxSpoolBytes', 'maxEvidenceSpoolBytes', 'referenceDecisionFile', 'trustedReferenceDecisionSha256', 'mappingFiles'];
  const sources = bag(c.sources, [...sourceKeys, 'reviewFile', 'trustedReviewSha256']);
  filePath(sources.reviewFile); must(hash(sources.trustedReviewSha256), 'IMPORT_SOURCE_HOST26_FULL_REFERENCE_PIN_REQUIRED');
  const ordinarySources = Object.fromEntries(sourceKeys.map(key => [key, sources[key]]));
  const common = validateSourceHostJob({ ...c, version: 'NATIVE_IMPORT_SOURCE_HOST19_V1',
    binding: { ...ordinaryBinding, version: 'NATIVE_IMPORT_EXECUTION_19_V1' }, sources: ordinarySources }, at);
  return { ...common, version: 'NATIVE_IMPORT_SOURCE_HOST26_V1',
    binding: { ...common.binding, version: 'NATIVE_IMPORT_EXECUTION_26_V1',...Object.fromEntries(phaseKeys.map(key=>[key,binding[key]])) },
    sources: { ...common.sources, reviewFile: sources.reviewFile, trustedReviewSha256: sources.trustedReviewSha256 } };
}
/** Captures the finite declared group set before opening executable source code.
 * Declarations alone are not verified source factories or native authority. */
export function captureNativeSourceProvider26(module,phase) {
  const requiredGroups=phase==='CORE_INITIALIZATION_26_V1'?['PARTIES']:HISTORY_CLOSURE_SOURCE_GROUPS;
  const own = key => { const d = Object.getOwnPropertyDescriptor(module ?? {}, key);
    must(d && Object.hasOwn(d, 'value') && d.enumerable, 'IMPORT_SOURCE_HOST26_PROVIDERS_REQUIRED'); return d.value; };
  const version = own('providerVersion'), groups = own('sourceGroups'), openSourceSession = own('openSourceSession');
  must(version === 'NATIVE_IMPORT_PRODUCTION_PROVIDERS_26_V1' && typeof openSourceSession === 'function', 'IMPORT_SOURCE_HOST26_PROVIDERS_REQUIRED');
  must(Array.isArray(groups) && Object.getPrototypeOf(groups) === Array.prototype
    && Object.getOwnPropertyDescriptor(groups, 'length')?.value === requiredGroups.length
    && Reflect.ownKeys(groups).length === requiredGroups.length + 1, 'IMPORT_SOURCE_HOST26_FACTORIES_REQUIRED');
  const captured = requiredGroups.map((_, i) => { const d = Object.getOwnPropertyDescriptor(groups, String(i));
    must(d && Object.hasOwn(d, 'value') && d.enumerable && typeof d.value === 'string', 'IMPORT_SOURCE_HOST26_FACTORIES_REQUIRED'); return d.value; });
  must(new Set(captured).size === requiredGroups.length
    && [...captured].sort().join(',') === [...requiredGroups].sort().join(','), 'IMPORT_SOURCE_HOST26_FACTORIES_REQUIRED');
  return Object.freeze({ providerVersion: version, sourceGroups: Object.freeze(captured), openSourceSession });
}
/** The source constructor may retain this capability, but cannot issue SQL while
 * actual factories, source authorization, mapping bytes and closure scope are checked.
 * Only the host retains activate(); no Pool exists before successful activation. */
export function createSourcePreflightDatabaseGate(createPool) {
  must(typeof createPool === 'function', 'IMPORT_SOURCE_HOST_DATABASE_FACTORY');
  let pool, activated = false, closed = false;
  const ready = () => { must(activated && !closed, 'IMPORT_SOURCE_HOST_DATABASE_PRECHECK'); return pool; };
  return {
    capability: Object.freeze({ connect: async () => ready().connect(), query: async (...args) => ready().query(...args) }),
    activate() { must(!activated && !closed, 'IMPORT_SOURCE_HOST_DATABASE_PRECHECK'); pool = createPool(); activated = true; return pool; },
    async close() { if (closed) return; closed = true; if (pool) await pool.end(); }
  };
}
export function validateSourceHostJob(value, at = Date.now()) {
  const c = bag(value, ['version', 'registrationId', 'deadlineUtc', 'maxSteps', 'binding', 'database', 'sources', 'providers']);
  must(c.version === 'NATIVE_IMPORT_SOURCE_HOST19_V1' && typeof c.registrationId === 'string' && /^[a-zA-Z0-9_.:-]{1,120}$/.test(c.registrationId), 'IMPORT_SOURCE_HOST_REGISTRATION');
  must(typeof c.deadlineUtc === 'string' && c.deadlineUtc.endsWith('Z') && Number.isFinite(Date.parse(c.deadlineUtc))
    && Date.parse(c.deadlineUtc) > at && Date.parse(c.deadlineUtc) - at <= 2147483647, 'IMPORT_SOURCE_HOST_WINDOW');
  must(Number.isSafeInteger(c.maxSteps) && c.maxSteps > 0 && c.maxSteps <= 1000000, 'IMPORT_SOURCE_HOST_LIMIT');
  const b = bag(c.binding, ['version', 'batchId', 'actorAccountId', 'fixedSourceNamespace', 'cutoffAt', 'selectionSha256', 'authorizedPayloadHash', 'target']);
  must(b.version === 'NATIVE_IMPORT_EXECUTION_19_V1' && uuid(b.batchId) && uuid(b.actorAccountId)
    && typeof b.fixedSourceNamespace === 'string' && /^[a-z][a-z0-9_.:-]*$/.test(b.fixedSourceNamespace)
    && hash(b.selectionSha256) && hash(b.authorizedPayloadHash), 'IMPORT_SOURCE_HOST_BINDING');
  must(typeof b.cutoffAt === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(b.cutoffAt) && Number.isFinite(Date.parse(b.cutoffAt)), 'IMPORT_SOURCE_HOST_CUTOFF');
  bag(b.target, ['database', 'role', 'serverAddress', 'serverPort', 'postmasterStartedAt']);
  const db = bag(c.database, ['host', 'port', 'database', 'user', 'tls', 'caFile', 'statementTimeoutMs']);
  must(typeof db.host === 'string' && db.host.length > 0 && Number.isInteger(db.port) && db.port > 0 && db.port <= 65535
    && typeof db.database === 'string' && db.database === b.target.database && typeof db.user === 'string' && db.user === b.target.role
    && Number.isSafeInteger(db.statementTimeoutMs) && db.statementTimeoutMs > 0 && db.statementTimeoutMs <= 2147483647, 'IMPORT_SOURCE_HOST_DATABASE');
  must(db.tls === 'verify-full' || db.tls === 'local-transport', 'IMPORT_SOURCE_HOST_TLS');
  if (db.tls === 'local-transport') must((['127.0.0.1', '::1'].includes(db.host) || isAbsolute(db.host)) && db.caFile === null, 'IMPORT_SOURCE_HOST_TLS');
  else if (db.caFile !== null) filePath(db.caFile);
  const s = bag(c.sources, ['base', 'v3Amendment', 'v3Approval', 'trustedApprovalSha256', 'approvedMoneyOverlaySha256', 'sourceRoot', 'spoolParent',
    'maxSpoolBytes', 'maxEvidenceSpoolBytes', 'referenceDecisionFile', 'trustedReferenceDecisionSha256', 'mappingFiles']);
  for (const key of ['base', 'v3Amendment', 'v3Approval', 'sourceRoot', 'spoolParent', 'referenceDecisionFile']) filePath(s[key]);
  for (const key of ['trustedApprovalSha256', 'approvedMoneyOverlaySha256', 'trustedReferenceDecisionSha256']) must(hash(s[key]), 'IMPORT_SOURCE_HOST_EXTERNAL_PIN_REQUIRED');
  for (const key of ['maxSpoolBytes', 'maxEvidenceSpoolBytes']) must(Number.isSafeInteger(s[key]) && s[key] > 0 && s[key] <= 512 * 1024 * 1024, 'IMPORT_SOURCE_HOST_SOURCE_LIMIT');
  must(s.mappingFiles && Object.getPrototypeOf(s.mappingFiles) === Object.prototype && Reflect.ownKeys(s.mappingFiles).length >= 1
    && Reflect.ownKeys(s.mappingFiles).length <= 16, 'IMPORT_SOURCE_HOST_NATIVE_MAPPING_REQUIRED');
  for (const name of Reflect.ownKeys(s.mappingFiles)) {
    const d = Object.getOwnPropertyDescriptor(s.mappingFiles, name);
    must(typeof name === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(name) && d?.enumerable && Object.hasOwn(d, 'value'), 'IMPORT_SOURCE_HOST_NATIVE_MAPPING_REQUIRED'); filePath(d.value);
  }
  const p = bag(c.providers, ['path', 'sha256']); filePath(p.path); must(hash(p.sha256), 'IMPORT_SOURCE_HOST_EXTERNAL_PIN_REQUIRED');
  return structuredClone(c);
}
async function pinned(path, pin, maximum) {
  filePath(path); let cursor = resolve(path), leaf = true, stat;
  for (;;) {
    const s = await lstat(cursor); must(!s.isSymbolicLink() && (leaf ? s.isFile() : s.isDirectory()), 'IMPORT_SOURCE_HOST_FILE');
    if (leaf) stat = s; leaf = false; const parent = dirname(cursor); if (cursor === parent) break; cursor = parent;
  }
  must(stat.size <= maximum, 'IMPORT_SOURCE_HOST_FILE_LIMIT');
  const bytes = await readFile(path), after = await lstat(path);
  must(bytes.length <= maximum && bytes.length === stat.size && after.isFile() && !after.isSymbolicLink() && after.dev === stat.dev
    && after.ino === stat.ino && after.size === stat.size && after.mtimeMs === stat.mtimeMs, 'IMPORT_SOURCE_HOST_FILE_CHANGED');
  if (pin !== null) must(createHash('sha256').update(bytes).digest('hex') === pin, 'IMPORT_SOURCE_HOST_PIN_MISMATCH');
  return bytes;
}

/** The job file is private controller input, not a data approval created by this host.
 * Missing decision bytes/providers fail before any Pool/source reader opens.
 * The controller freezes this module and the provider dependency closure for a single run.
 */
export async function openImportHost({ signal, configFile = process.env.NAIJUE_IMPORT_JOB_FILE }) {
  must(signal instanceof AbortSignal && !signal.aborted, 'IMPORT_SOURCE_HOST_ABORTED'); filePath(configFile);
  const jobBytes = await pinned(configFile, null, 1024 * 1024);
  const job = validateSourceHostJob(JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(jobBytes)));
  const nativeBytes = await pinned(job.sources.referenceDecisionFile, job.sources.trustedReferenceDecisionSha256, 4 * 1024 * 1024);
  const decision = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(nativeBytes));
  bag(decision, ['schemaVersion', 'validatorVersion', 'batchId', 'fixedSourceNamespace', 'selection', 'mappingFiles', 'decisions'], 'IMPORT_SOURCE_HOST_NATIVE_DECISION_REQUIRED');
  must(decision.schemaVersion === 1 && decision.validatorVersion === NATIVE_PRODUCT_REFERENCE_DECISION_VERSION
    && decision.batchId === job.binding.batchId && decision.fixedSourceNamespace === job.binding.fixedSourceNamespace
    && decision.selection?.entity === 'PRODUCT' && decision.selection.selectionSha256 === job.binding.selectionSha256,
  'IMPORT_SOURCE_HOST_NATIVE_DECISION_REQUIRED');
  // The existing native-product authorizer later checks every decision and mapping byte, before it can authorize a PRODUCT.
  await pinned(job.providers.path, job.providers.sha256, 4 * 1024 * 1024);
  const module = await import(pathToFileURL(job.providers.path).href);
  must(module.providerVersion === 'NATIVE_IMPORT_PRODUCTION_PROVIDERS_19_V1' && typeof module.openSourceSession === 'function', 'IMPORT_SOURCE_HOST_PROVIDERS_REQUIRED');
  must(Array.isArray(module.sourceGroups) && module.sourceGroups.length === HISTORY_CLOSURE_SOURCE_GROUPS.length
    && [...module.sourceGroups].sort().join(',') === [...HISTORY_CLOSURE_SOURCE_GROUPS].sort().join(','), 'IMPORT_SOURCE_HOST_FACTORIES_REQUIRED');
  const cancellation = new AbortController(), combined = AbortSignal.any([signal, cancellation.signal]);
  const active = () => must(!combined.aborted && Date.now() < Date.parse(job.deadlineUtc), 'IMPORT_SOURCE_HOST_ABORTED');
  const timer = setTimeout(() => cancellation.abort(), Math.max(1, Date.parse(job.deadlineUtc) - Date.now())); timer.unref();
  let pool, databaseGate, session, product, closure, sourceClosed = false, closed = false;
  async function closeSource() { if (!sourceClosed && session) { sourceClosed = true; await session.close(); } }
  async function close() {
    if (closed) return; closed = true; clearTimeout(timer); cancellation.abort(); const errors = [];
    for (const dispose of [async () => { if (closure) await closure.close(); }, async () => { if (product) await product.close(); }, closeSource,
      async () => { if (databaseGate) await databaseGate.close(); }]) try { await dispose(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'Import source host close failed');
  }
  try {
    active(); const db = job.database;
    const ca = db.caFile === null ? undefined : new TextDecoder('utf8', { fatal: true }).decode(await pinned(db.caFile, null, 1024 * 1024));
    // Credentials stay with the operator's PG environment/passfile. They are never read into job artifacts or logs.
    databaseGate = createSourcePreflightDatabaseGate(() => new Pool({ host: db.host, port: db.port, database: db.database, user: db.user,
      ssl: db.tls === 'local-transport' ? false : { rejectUnauthorized: true, ...(ca === undefined ? {} : { ca }) },
      max: 1, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000, statement_timeout: db.statementTimeoutMs,
      application_name: 'naijue-controlled-native-import' }));
    session = await module.openSourceSession({ binding: structuredClone(job.binding), sources: structuredClone(job.sources), pool: databaseGate.capability, signal: combined });
    must(session && typeof session.steps === 'function' && typeof session.close === 'function'
      && typeof session.authorizeStep === 'function' && typeof session.assertExecutionAllowed === 'function'
      && typeof session.assertAllowed === 'function' && typeof session.authorizeNativeCommand === 'function', 'IMPORT_SOURCE_HOST_SESSION_REQUIRED');
    must(session.openSources && Object.getPrototypeOf(session.openSources) === Object.prototype && Reflect.ownKeys(session.openSources).length === HISTORY_CLOSURE_SOURCE_GROUPS.length
      && HISTORY_CLOSURE_SOURCE_GROUPS.every(group => typeof Object.getOwnPropertyDescriptor(session.openSources, group)?.value === 'function'), 'IMPORT_SOURCE_HOST_FACTORIES_REQUIRED');
    must(session.closureScope?.batchId === job.binding.batchId && session.closureScope.fixedSourceNamespace === job.binding.fixedSourceNamespace
      && session.closureScope.selectionSha256 === job.binding.selectionSha256 && session.closureScope.authorizedPayloadHash === job.binding.authorizedPayloadHash,
    'IMPORT_SOURCE_HOST_CLOSURE_BINDING');
    let bootstrap = null; const bootstrapDescriptor = Object.getOwnPropertyDescriptor(session, 'bootstrap');
    if (bootstrapDescriptor) {
      must(bootstrapDescriptor.enumerable && Object.hasOwn(bootstrapDescriptor, 'value'), 'IMPORT_SOURCE_HOST_BOOTSTRAP_REQUIRED');
      bootstrap = bag(bootstrapDescriptor.value, ['authorizeStageSourceActor', 'stageNewBatch'], 'IMPORT_SOURCE_HOST_BOOTSTRAP_REQUIRED');
      must(Object.values(bootstrap).every(fn => typeof fn === 'function'), 'IMPORT_SOURCE_HOST_BOOTSTRAP_REQUIRED');
    }
    product = await openNativeProductAuthorizer({ sourceReader: session.nativeProductSourceReader,
      referenceDecisionFile: job.sources.referenceDecisionFile, trustedReferenceDecisionSha256: job.sources.trustedReferenceDecisionSha256, mappingFiles: job.sources.mappingFiles });
    closure = await openAuthorizedHistoryClosureReader({ scope: session.closureScope, openSources: session.openSources,
      trustedSelectionSha256: job.binding.selectionSha256, trustedAuthorizedPayloadHash: job.binding.authorizedPayloadHash });
    active(); pool = databaseGate.activate();
    return {
      executor: { pool, binding: structuredClone(job.binding), now: () => new Date().toISOString(), ...(bootstrap ? { bootstrap } : {}), authorization: {
        async assertExecutionAllowed(binding) { active(); must(requestHash(binding) === requestHash(job.binding), 'IMPORT_SOURCE_HOST_BINDING'); await session.assertExecutionAllowed(structuredClone(binding)); active(); },
        async authorizeStep(step) { active(); await session.authorizeStep(step); if (step.kind === 'PRODUCT') await product.authorize(step.payload); active(); },
        async assertAllowed(actor, command) { active(); await session.assertAllowed(actor, command); active(); },
        async authorizeNativeCommand(actor, command) {
          active(); await session.authorizeNativeCommand(actor, command);
          if (command.action === 'IMPORT_PUBLISH') { const expected = await closure.expected(); must(requestHash(command.historyClosure) === requestHash(expected.plan), 'IMPORT_SOURCE_HOST_PUBLISH_SOURCE_MISMATCH'); }
          active();
        },
        async authorizeClosure(input) { active(); await closure.authorizeStage(input); active(); }
      } },
      source: { async *steps() { let count = 0; for await (const step of session.steps()) { active(); must(count++ < job.maxSteps, 'IMPORT_SOURCE_HOST_STEP_LIMIT'); yield step; } active(); }, close: closeSource },
      close
    };
  } catch (error) { try { await close(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'Import host construction and cleanup failed'); } throw error; }
}

/** Executable successor job is a closed extension of the earlier input-only job.
 * Runtime metadata is a separate C pin, never the product-reference review. */
export function validateExecutableSourceHostJob26(value, at = Date.now()) {
  const root = bag(value,['version','registrationId','deadlineUtc','maxSteps','binding','database','sources','providers','runtime26Review']);
  const review = bag(root.runtime26Review,['reviewFile','trustedReviewSha256'],'IMPORT_SOURCE_HOST26_RUNTIME_REVIEW');
  filePath(review.reviewFile); must(hash(review.trustedReviewSha256),'IMPORT_SOURCE_HOST26_RUNTIME_REVIEW');
  const {runtime26Review,...ordinary} = root;
  return {...validateSourceHostJob26(ordinary,at),runtime26Review:structuredClone(review)};
}
/** Provider sees only ready(), which fails before complete source preflight.
 * Its successful result contains the actual D1-issued pool and runtime objects.
 * The original pool is retained exclusively for owner cleanup. No facade cap. */
export function createSourcePreflightRuntimeGate26(createPool,createIssuer,review) {
  must(typeof createPool==='function'&&typeof createIssuer==='function','IMPORT_SOURCE_HOST_DATABASE_FACTORY');
  const settings=bag(review,['reviewFile','trustedReviewSha256'],'IMPORT_SOURCE_HOST26_RUNTIME_REVIEW');
  filePath(settings.reviewFile);must(hash(settings.trustedReviewSha256),'IMPORT_SOURCE_HOST26_RUNTIME_REVIEW');
  let raw,endOriginal,issued,activation,closing,attempted=false,closed=false;
  const method=(object,key)=>{for(let current=object;current!==null;current=Object.getPrototypeOf(current)){const d=Object.getOwnPropertyDescriptor(current,key);if(d){must(Object.hasOwn(d,'value')&&typeof d.value==='function','IMPORT_SOURCE_HOST26_ISSUER_RESULT');return d.value.bind(object);}}fail('IMPORT_SOURCE_HOST26_ISSUER_RESULT');};
  const ready=()=>{must(!closed&&issued!==undefined,'IMPORT_SOURCE_HOST_DATABASE_PRECHECK');return issued;};
  return {capability:Object.freeze({ready}),
    activate(){must(!attempted&&!closed,'IMPORT_SOURCE_HOST_DATABASE_PRECHECK');attempted=true;
      activation=(async()=>{raw=createPool();must(raw&&typeof raw==='object','IMPORT_SOURCE_HOST_DATABASE_FACTORY');method(raw,'connect');endOriginal=method(raw,'end');
        const result=await createIssuer(raw,structuredClone(settings));
        const p=Object.getOwnPropertyDescriptor(result??{},'pool'),r=Object.getOwnPropertyDescriptor(result??{},'runtime26');
        must(p?.enumerable&&Object.hasOwn(p,'value')&&p.value&&typeof p.value==='object'
          &&r?.enumerable&&Object.hasOwn(r,'value')&&checkedNativeRuntime26Capability(r.value)!==undefined,'IMPORT_SOURCE_HOST26_ISSUER_RESULT');
        method(p.value,'connect');must(!closed,'IMPORT_SOURCE_HOST_DATABASE_PRECHECK');issued=Object.freeze({pool:p.value,runtime26:r.value});return issued;})();return activation;
    },
    close(){if(closing)return closing;closed=true;closing=(async()=>{if(activation)try{await activation;}catch{}if(endOriginal)await endOriginal();})();return closing;}
  };
}
/** Exactly the executable provider contract. Declared groups or a report cannot
 * stand in for independent preflight, real bootstrap, original evidence reader
 * or all11 concrete closure factories. Captures own functions without accessors. */
export function captureNativeSourceSession26(value,binding) {
  if(binding.phase==='CORE_INITIALIZATION_26_V1'){
    const s=bag(value,['steps','close','authorizeStep','assertExecutionAllowed','assertAllowed','authorizeNativeCommand','preflight','bootstrap26','now'],'IMPORT_SOURCE_HOST_SESSION_REQUIRED');
    for(const key of ['steps','close','authorizeStep','assertExecutionAllowed','assertAllowed','authorizeNativeCommand','preflight','now'])must(typeof s[key]==='function','IMPORT_SOURCE_HOST_SESSION_REQUIRED');
    const bootstrap=bag(s.bootstrap26,['authorizeStageSourceActor','stageNewBatch26'],'IMPORT_SOURCE_HOST_BOOTSTRAP_REQUIRED');must(Object.values(bootstrap).every(fn=>typeof fn==='function'),'IMPORT_SOURCE_HOST_BOOTSTRAP_REQUIRED');
    return Object.freeze({...s,bootstrap26:Object.freeze(bootstrap)});
  }
  const s=bag(value,['steps','close','authorizeStep','assertExecutionAllowed','assertAllowed','authorizeNativeCommand','preflight',
    'openSources','closureScope','nativeProductSourceReader','bootstrap26',...(Object.hasOwn(value??{},'stagedPrefixBinding26')?['stagedPrefixBinding26']:[]),...(Object.hasOwn(value??{},'adoptedClosure')?['adoptedClosure']:[]),...(Object.hasOwn(value??{},'now')?['now']:[])],'IMPORT_SOURCE_HOST_SESSION_REQUIRED');
  for(const key of ['steps','close','authorizeStep','assertExecutionAllowed','assertAllowed','authorizeNativeCommand','preflight'])
    must(typeof s[key]==='function','IMPORT_SOURCE_HOST_SESSION_REQUIRED');
  if(Object.hasOwn(s,'now'))must(typeof s.now==='function','IMPORT_SOURCE_HOST_SESSION_REQUIRED');
  const factories=bag(s.openSources,HISTORY_CLOSURE_SOURCE_GROUPS,'IMPORT_SOURCE_HOST_FACTORIES_REQUIRED');
  must(Object.values(factories).every(fn=>typeof fn==='function'),'IMPORT_SOURCE_HOST_FACTORIES_REQUIRED');
  historySettlementRequestHash(s.closureScope);const scope=structuredClone(s.closureScope);
  must(scope?.batchId===binding.batchId&&scope.fixedSourceNamespace===binding.fixedSourceNamespace
    &&scope.selectionSha256===binding.selectionSha256&&scope.authorizedPayloadHash===binding.authorizedPayloadHash,'IMPORT_SOURCE_HOST_CLOSURE_BINDING');
  const bootstrap=binding.phase==='FULL_SOURCE_CONTINUATION_26_V1'?null:bag(s.bootstrap26,['authorizeStageSourceActor','stageNewBatch26'],'IMPORT_SOURCE_HOST_BOOTSTRAP_REQUIRED');
  must(bootstrap===null?s.bootstrap26===null:Object.values(bootstrap).every(fn=>typeof fn==='function'),'IMPORT_SOURCE_HOST_BOOTSTRAP_REQUIRED');
  const reader=s.nativeProductSourceReader,d=Object.getOwnPropertyDescriptor(reader??{},'authorize');
  must(d?.enumerable&&Object.hasOwn(d,'value')&&typeof d.value==='function','IMPORT_SOURCE_HOST_SESSION_REQUIRED');
  const physical=Object.getOwnPropertyDescriptor(reader??{},'resolveFile');must(!physical||physical.enumerable&&Object.hasOwn(physical,'value')&&(physical.value===undefined||typeof physical.value==='function'),'IMPORT_SOURCE_HOST_SESSION_REQUIRED');
  if(Object.hasOwn(s,'adoptedClosure')){
   must(binding.phase==='FULL_SOURCE_CONTINUATION_26_V1','IMPORT_SOURCE_HOST26_ADOPTED_SCOPE');
   const a=bag(s.adoptedClosure,['expected','authorizeStage','authorizePublish'],'IMPORT_SOURCE_HOST26_ADOPTED_REQUIRED');
   must(Object.values(a).every(fn=>typeof fn==='function'),'IMPORT_SOURCE_HOST26_ADOPTED_REQUIRED');s.adoptedClosure=Object.freeze(a);
  }
  if(Object.hasOwn(s,'stagedPrefixBinding26')){
   must(binding.phase==='FULL_SOURCE_CONTINUATION_26_V1'&&Object.hasOwn(s,'adoptedClosure'),'IMPORT_SOURCE_HOST22_PREFIX_SCOPE');
   const prefix=bag(s.stagedPrefixBinding26,['capture'],'IMPORT_SOURCE_HOST22_PREFIX_REQUIRED');
   must(typeof prefix.capture==='function','IMPORT_SOURCE_HOST22_PREFIX_REQUIRED');s.stagedPrefixBinding26=Object.freeze(prefix);
  }
  return Object.freeze({...s,closureScope:scope,openSources:Object.freeze(factories),bootstrap26:bootstrap===null?null:Object.freeze(bootstrap)});
}
/** Keep the original source generator return (verified prior publication) while
 * retaining the same bounded step/core checks and iterator cleanup behavior. */
export async function* forwardSourceSteps26({steps,active,maxSteps,core}){
 let count=0;
 const checked=async function*(){const iterator=steps()[Symbol.asyncIterator]();let done=false;
  try{for(;;){const next=await iterator.next();active();if(next.done){done=true;return next.value;}const step=next.value;
    if(core)must(step?.kind==='MAIN'&&step.payload?.action==='IMPORT_CORE_STAGE','IMPORT_SOURCE_HOST26_CORE_ONLY');
    must(count++<maxSteps,'IMPORT_SOURCE_HOST_STEP_LIMIT');yield step;}}
  finally{if(!done)await iterator.return?.();}
 };
 return yield* checked();
}
/** Explicit exact26 host. No provider/source defaults, migrations, real49
 * bootstrap substitutes, raw-pool exposure or executable source authority. */
/** Pure metadata/target check only; execution still requires separately pinned
 * real source/session authority and the original independently issued client. */
// Exact issuer profiles only. V3 is the existing normal13 maintenance-xmin
// export; V4 independently observes preparation12; V5 completes all22 current
// maintained root/closure reads; V6 adds the original normal-write cross-history
// dependency. V7 retains exact23 and adds only the independently reviewed
// new-LIVE-pair exact137 catalog. None recognizes an arbitrary future profile.
const sourceHostPrefixFormats26=new Map([
 ['26_v22_staged_prefix_bind_from_v20','EXACT26_RUNTIME_CATALOG_EXPORT_V1'],
 ['26_hv2_source_xmin_from_v22','EXACT26_RUNTIME_CATALOG_EXPORT_V2'],
 ['26_hv2_history_set_guards_from_v22','EXACT26_RUNTIME_CATALOG_EXPORT_V1'],
 ['26_hv2_history_set_guards_source_xmin_from_v22','EXACT26_RUNTIME_CATALOG_EXPORT_V2'],
 ['26_hv2_history_set_guards_maintenance_xmin_from_v22','EXACT26_RUNTIME_CATALOG_EXPORT_V3'],
 ['26_hv2_history_set_guards_preparation_xmin_from_v22','EXACT26_RUNTIME_CATALOG_EXPORT_V4'],
 ['26_hv2_history_set_guards_complete_maintenance_xmin_from_v22','EXACT26_RUNTIME_CATALOG_EXPORT_V5'],
 ['26_hv2_history_set_guards_complete_write_xmin_from_v22','EXACT26_RUNTIME_CATALOG_EXPORT_V6'],
 ['26_hv2_live_ledger_pairs_complete_write_xmin_from_v22','EXACT26_RUNTIME_CATALOG_EXPORT_V7'],
 ['26_hv2_live_pairs_complete_write_acl_v8_from_v7','EXACT26_RUNTIME_CATALOG_EXPORT_V8'],
]);
export function validateSourceHostRuntimeReview26(metadata,binding,stagedPrefixBinding26) {
  bag(metadata,['version','decision','target','catalog','purposes','scope','independentReview','realImportExecutionAuthorized'],'IMPORT_SOURCE_HOST26_RUNTIME_REVIEW');
  const catalog=bag(metadata.catalog,['format','sha256','patchLevel'],'IMPORT_SOURCE_HOST26_RUNTIME_REVIEW');
  const prefixFormat=sourceHostPrefixFormats26.get(catalog.patchLevel),prefix22=prefixFormat!==undefined;
  if(prefix22){
    must(binding.phase==='FULL_SOURCE_CONTINUATION_26_V1','IMPORT_SOURCE_HOST26_RUNTIME_REVIEW');
    const prefix=bag(stagedPrefixBinding26,['capture'],'IMPORT_SOURCE_HOST22_PREFIX_REQUIRED');
    must(typeof prefix.capture==='function','IMPORT_SOURCE_HOST22_PREFIX_REQUIRED');
  }
  const approvedPatch=metadata.catalog?.patchLevel===(binding.phase?'26_v14_core_initialization':'26_v11_document_specification_save')
    ||binding.phase==='FULL_SOURCE_CONTINUATION_26_V1'&&(prefix22||['26_v16_history_responsible_from_v14','26_v20_history_insert_identity_from_v19'].includes(metadata.catalog?.patchLevel));
  must(metadata.version==='C_NATIVE_RUNTIME26_REVIEW_V1'&&metadata.decision==='ACCEPT_EXACT_RUNTIME26_TARGET_METADATA'
    &&metadata.scope==='EXACT_TARGET_METADATA_ONLY'&&metadata.realImportExecutionAuthorized===false&&catalog.format===(prefixFormat??'EXACT26_RUNTIME_CATALOG_EXPORT_V1')&&hash(metadata.catalog?.sha256)&&approvedPatch,'IMPORT_SOURCE_HOST26_RUNTIME_REVIEW');
  const target=bag(metadata.target,['database','databaseOid','actingRole','sessionUser','serverAddress','serverPort','postmasterStart'],'IMPORT_SOURCE_HOST26_RUNTIME_REVIEW'),b=binding.target;
  must(target.database===b.database&&target.actingRole===b.role&&target.serverAddress===b.serverAddress&&target.serverPort===b.serverPort
    &&target.postmasterStart===b.postmasterStartedAt,'IMPORT_SOURCE_HOST26_RUNTIME_TARGET');
}

export async function openImportHost26({signal,configFile=process.env.NAIJUE_IMPORT_JOB_FILE}) {
  must(signal instanceof AbortSignal&&!signal.aborted,'IMPORT_SOURCE_HOST_ABORTED');filePath(configFile);
  const bytes=await pinned(configFile,null,1048576),job=validateExecutableSourceHostJob26(JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes)));
  const core=job.binding.phase==='CORE_INITIALIZATION_26_V1';
  if(core)await pinned(job.sources.reviewFile,job.sources.trustedReviewSha256,4194304);
  const metadata=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(await pinned(job.runtime26Review.reviewFile,job.runtime26Review.trustedReviewSha256,65536)));
  // The v22 runtime profile also requires the source-owned capture port. Its
  // pinned provider loads the exact external grant/148/INIT references before
  // returning that session; validate it below before native reads or activation.
  const prefix22=sourceHostPrefixFormats26.has(metadata.catalog?.patchLevel);
  if(!prefix22)validateSourceHostRuntimeReview26(metadata,job.binding);
  const independent=bag(metadata.independentReview,['path','sha256','result'],'IMPORT_SOURCE_HOST26_RUNTIME_REVIEW');
  must(independent.result==='PASS','IMPORT_SOURCE_HOST26_RUNTIME_REVIEW');await pinned(independent.path,independent.sha256,8388608);
  await pinned(job.providers.path,job.providers.sha256,4194304);const module=captureNativeSourceProvider26(await import(pathToFileURL(job.providers.path).href),job.binding.phase);
  const cancellation=new AbortController(),combined=AbortSignal.any([signal,cancellation.signal]);
  const active=()=>must(!combined.aborted&&Date.now()<Date.parse(job.deadlineUtc),'IMPORT_SOURCE_HOST_ABORTED');
  const timer=setTimeout(()=>cancellation.abort(),Math.max(1,Date.parse(job.deadlineUtc)-Date.now()));timer.unref();
  let gate,session,sessionClose,product,closure,sourceClosed=false,closed=false;
  const completed=async(fn,...args)=>must(await fn(...args)===undefined,'IMPORT_SOURCE_HOST26_AUTHORITY_RESULT');
  async function closeSource(){if(!sourceClosed&&sessionClose){sourceClosed=true;await sessionClose();}}
  async function close(){if(closed)return;closed=true;clearTimeout(timer);cancellation.abort();const errors=[];
    for(const dispose of [async()=>{if(closure?.close)await closure.close();},async()=>{if(product)await product.close();},closeSource,async()=>{if(gate)await gate.close();}])try{await dispose();}catch(error){errors.push(error);}
    if(errors.length)throw new AggregateError(errors,'Import source host26 close failed');
  }
  try{
    active();const db=job.database,ca=db.caFile===null?undefined:new TextDecoder('utf8',{fatal:true}).decode(await pinned(db.caFile,null,1048576));
    gate=createSourcePreflightRuntimeGate26(()=>new Pool({host:db.host,port:db.port,database:db.database,user:db.user,
      ssl:db.tls==='local-transport'?false:{rejectUnauthorized:true,...(ca===undefined?{}:{ca})},max:1,connectionTimeoutMillis:10000,
      idleTimeoutMillis:10000,statement_timeout:db.statementTimeoutMs,application_name:'naijue-controlled-native-import26'}),createNativeRuntime26Issuer,job.runtime26Review);
    const raw=await module.openSourceSession({binding:structuredClone(job.binding),sources:structuredClone(job.sources),database:gate.capability,signal:combined});
    const closeDescriptor=Object.getOwnPropertyDescriptor(raw??{},'close');if(closeDescriptor?.enumerable&&Object.hasOwn(closeDescriptor,'value')&&typeof closeDescriptor.value==='function')sessionClose=closeDescriptor.value;
    session=captureNativeSourceSession26(raw,job.binding);
    if(prefix22)validateSourceHostRuntimeReview26(metadata,job.binding,session.stagedPrefixBinding26);
    if(!core){
      // Keep logical job identities for the later native authorizer. Only this
      // initial read resolves them through the captured exact original map.
      // All native scope checks still precede source-group construction/DB.
      const resolveFile=Object.getOwnPropertyDescriptor(session.nativeProductSourceReader,'resolveFile')?.value;
      const readHostReference=async(logical,pin,maximum)=>{
        active();const physical=resolveFile?await resolveFile({path:logical,sha256:pin}):{path:logical};active();
        must(physical&&typeof physical.path==='string'&&(physical.sha256===undefined||physical.sha256===pin),'IMPORT_SOURCE_HOST_NATIVE_REFERENCE_PATH');
        if(physical.bytes!==undefined)must(Number.isSafeInteger(physical.bytes)&&physical.bytes>0&&physical.bytes<=maximum,'IMPORT_SOURCE_HOST_NATIVE_REFERENCE_PATH');
        const bytes=await pinned(physical.path,pin,maximum);active();
        must(physical.bytes===undefined||bytes.length===physical.bytes,'IMPORT_SOURCE_HOST_NATIVE_REFERENCE_PATH');return bytes;
      };
      const nativeBytes=await readHostReference(job.sources.referenceDecisionFile,job.sources.trustedReferenceDecisionSha256,8388608);
      const decision=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(nativeBytes));
      bag(decision,['schemaVersion','validatorVersion','schemaProfile','batchId','fixedSourceNamespace','selection','mappingFiles','decisions'],'IMPORT_SOURCE_HOST_NATIVE_DECISION_REQUIRED');
      must(decision.schemaVersion===2&&decision.validatorVersion===NATIVE_PRODUCT_REFERENCE_DECISION_VERSION_26&&decision.schemaProfile==='EXACT26'
        &&decision.batchId===job.binding.batchId&&decision.fixedSourceNamespace===job.binding.fixedSourceNamespace
        &&decision.selection?.entity==='PRODUCT'&&decision.selection.selectionSha256===job.binding.selectionSha256
        &&Array.isArray(decision.decisions)&&decision.decisions.length>0,'IMPORT_SOURCE_HOST_NATIVE_DECISION_REQUIRED');
      // All three are independently supplied metadata pins. Source/native scope is
      // still checked by the genuine source session and product authorizer below.
      await readHostReference(job.sources.reviewFile,job.sources.trustedReviewSha256,4194304);
    }
    await completed(session.preflight,structuredClone(job.binding));await completed(session.assertExecutionAllowed,structuredClone(job.binding));active();
    if(!core){product=await openNativeProductAuthorizer26({sourceReader:session.nativeProductSourceReader,referenceDecisionFile:job.sources.referenceDecisionFile,
      trustedReferenceDecisionSha256:job.sources.trustedReferenceDecisionSha256,mappingFiles:job.sources.mappingFiles,
      reviewFile:job.sources.reviewFile,trustedReviewSha256:job.sources.trustedReviewSha256},{resolveFile:Object.getOwnPropertyDescriptor(session.nativeProductSourceReader,'resolveFile')?.value});
    closure=session.adoptedClosure??await openAuthorizedHistoryClosureReader26({scope:session.closureScope,openSources:session.openSources,
      trustedSelectionSha256:job.binding.selectionSha256,trustedAuthorizedPayloadHash:job.binding.authorizedPayloadHash});}
    active();const runtime=await gate.activate();active();
    return {executor:{pool:runtime.pool,runtime26:runtime.runtime26,binding:structuredClone(job.binding),now:session.now??(()=>new Date().toISOString()),bootstrap26:session.bootstrap26,
      ...(session.stagedPrefixBinding26?{stagedPrefixBinding26:{async capture(command){active();const expected=await session.stagedPrefixBinding26.capture(command);active();return expected;}}}:{}),
      authorization:{async assertExecutionAllowed(binding){active();must(requestHash(binding)===requestHash(job.binding),'IMPORT_SOURCE_HOST_BINDING');await completed(session.assertExecutionAllowed,structuredClone(binding));active();},
        async authorizeStep(step){active();await completed(session.authorizeStep,step);if(step.kind==='PRODUCT')await product.authorize(step.payload);active();},
        async assertAllowed(actor,command){active();await completed(session.assertAllowed,actor,command);active();},
        async authorizeNativeCommand(actor,command){active();await completed(session.authorizeNativeCommand,actor,command);if(command.action==='IMPORT_PUBLISH'){if(session.adoptedClosure)await completed(session.adoptedClosure.authorizePublish,command);else{const expected=await closure.expected();must(requestHash(command.historyClosure)===requestHash(expected.plan),'IMPORT_SOURCE_HOST_PUBLISH_SOURCE_MISMATCH');}}active();},
        async authorizeClosure(input){active();must(!core&&closure,'IMPORT_SOURCE_HOST26_CORE_ONLY');await closure.authorizeStage(input);active();}}},
      source:{steps:()=>forwardSourceSteps26({steps:()=>session.steps(),active,maxSteps:job.maxSteps,core}),close:closeSource},close};
  }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Import host26 construction and cleanup failed');}throw error;}
}
