/** Finite real-source host composition. No built-in native mapping or synthetic source factory. */
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve, dirname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { requestHash } from '../../packages/application/src/request-hash.ts';
import { NATIVE_PRODUCT_REFERENCE_DECISION_VERSION } from '../../packages/application/src/native-product-import.ts';
import { openNativeProductAuthorizer } from '../import-v2/authorized-native-product-reader.mjs';
import { openAuthorizedHistoryClosureReader, HISTORY_CLOSURE_SOURCE_GROUPS } from '../import-v2/authorized-history-closure-reader.mjs';

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
  let pool, session, product, closure, sourceClosed = false, closed = false;
  async function closeSource() { if (!sourceClosed && session) { sourceClosed = true; await session.close(); } }
  async function close() {
    if (closed) return; closed = true; clearTimeout(timer); cancellation.abort(); const errors = [];
    for (const dispose of [async () => { if (closure) await closure.close(); }, async () => { if (product) await product.close(); }, closeSource,
      async () => { if (pool) await pool.end(); }]) try { await dispose(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'Import source host close failed');
  }
  try {
    active(); const db = job.database;
    const ca = db.caFile === null ? undefined : new TextDecoder('utf8', { fatal: true }).decode(await pinned(db.caFile, null, 1024 * 1024));
    // Credentials stay with the operator's PG environment/passfile. They are never read into job artifacts or logs.
    pool = new Pool({ host: db.host, port: db.port, database: db.database, user: db.user,
      ssl: db.tls === 'local-transport' ? false : { rejectUnauthorized: true, ...(ca === undefined ? {} : { ca }) },
      max: 1, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000, statement_timeout: db.statementTimeoutMs,
      application_name: 'naijue-controlled-native-import' });
    session = await module.openSourceSession({ binding: structuredClone(job.binding), sources: structuredClone(job.sources), pool, signal: combined });
    must(session && typeof session.steps === 'function' && typeof session.close === 'function'
      && typeof session.authorizeStep === 'function' && typeof session.assertExecutionAllowed === 'function'
      && typeof session.assertAllowed === 'function' && typeof session.authorizeNativeCommand === 'function', 'IMPORT_SOURCE_HOST_SESSION_REQUIRED');
    must(session.openSources && Object.getPrototypeOf(session.openSources) === Object.prototype && Reflect.ownKeys(session.openSources).length === HISTORY_CLOSURE_SOURCE_GROUPS.length
      && HISTORY_CLOSURE_SOURCE_GROUPS.every(group => typeof Object.getOwnPropertyDescriptor(session.openSources, group)?.value === 'function'), 'IMPORT_SOURCE_HOST_FACTORIES_REQUIRED');
    must(session.closureScope?.batchId === job.binding.batchId && session.closureScope.fixedSourceNamespace === job.binding.fixedSourceNamespace
      && session.closureScope.selectionSha256 === job.binding.selectionSha256 && session.closureScope.authorizedPayloadHash === job.binding.authorizedPayloadHash,
    'IMPORT_SOURCE_HOST_CLOSURE_BINDING');
    product = await openNativeProductAuthorizer({ sourceReader: session.nativeProductSourceReader,
      referenceDecisionFile: job.sources.referenceDecisionFile, trustedReferenceDecisionSha256: job.sources.trustedReferenceDecisionSha256, mappingFiles: job.sources.mappingFiles });
    closure = await openAuthorizedHistoryClosureReader({ scope: session.closureScope, openSources: session.openSources,
      trustedSelectionSha256: job.binding.selectionSha256, trustedAuthorizedPayloadHash: job.binding.authorizedPayloadHash });
    active();
    return {
      executor: { pool, binding: structuredClone(job.binding), now: () => new Date().toISOString(), authorization: {
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
