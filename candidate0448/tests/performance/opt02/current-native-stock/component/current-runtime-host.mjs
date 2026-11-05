/** Captured-client portion of the NEW current-runtime host.
 * No cluster, connection or SQL on import. Physical birth/bootstrap and the
 * reference -> stopped expected -> independent acceptance orchestration are
 * deliberately not implied by creating this boundary. Never an issuer review. */
import { Client } from 'pg';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { captureData, budgetedQuery, settleClient, identifier, literal } from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
import { physicalClientFence } from '../../legacy-cutoff/physical-send.mjs';
import { guardedLegacyPool } from '../../legacy-cutoff/wire-boundary.mjs';
import { createGlobalGate } from '../sequence-acl-micro/contract.mjs';
import { captureFiveRoleTarget, renderPostCutoffFiveRoleGuard } from './five-role-guard.mjs';
import { assertPlan, sourceCohortFor } from '../reference-compiler-cohort-v2/source-cohort.mjs';
import { LOGICAL, assertFinitePolicy } from '../reference-compiler-cohort-v2/universe.mjs';
import { renderFiniteGrants } from '../reference-compiler-cohort-v2/render.mjs';
import { assertAliasFourReadPolicy, renderAliasFourGrants } from '../reference-compiler-alias4-v1/alias4-policy.mjs';
import { installOriginalSourceSchema } from './install-source-schema.mjs';
import { buildReferenceFixture, assertFixture, seedNewReference } from './fixture.mjs';
import { snapshotSource } from './authorizer.mjs';
import { requestHash } from '../../../../../packages/application/src/request-hash.ts';
import { verifyReferenceSource, verifyReferenceBalances } from './source-verification.mjs';
import { createReferencePublication, verifyReferenceAcknowledgement } from './publication.mjs';
import { buildScaledReferenceFixture, assertScaledFixture, seedScaledReferenceFixture } from './scaled-fixture.mjs';
import { createScaledReferencePublication, verifyScaledReferenceAcknowledgement } from './scaled-publication.mjs';
import { verifyScaledReferenceSource, verifyScaledReferenceBalances } from './scaled-source-verification.mjs';
import { oneTransaction } from '../../../opt00/pg-component/component.mjs';
import { createNodeScryptPasswords } from '../../../../../packages/authentication/src/passwords.ts';
import { assertCurrentRuntimeQueryMetrics, observeCapturedRuntimeQuery } from './current-runtime-query-metrics.mjs';

const need = (ok, code) => { if (!ok) throw Object.assign(new Error(code), { code }); };
const boundaries = new WeakSet(), runtimePools = new WeakSet();
export const HOST_STATUS = 'CAPTURED_CLIENT_BOUNDARY_ONLY_BOOTSTRAP_AND_ENGINE_NOT_YET_WIRED';
/** Module-cohort check only; NOT physical birth, metadata review or PG proof. */
export function assertCurrentRuntimePool(pool) {
  need(runtimePools.has(pool), 'ORIGINAL_CAPTURED_CURRENT_RUNTIME_POOL_REQUIRED'); return pool;
}
/** Preserve the original publication failure AND a failed captured close.
 * This never repairs, retries, rolls back or issues any SQL. */
export async function runOriginalPublicationAndClose(work, close) {
  need(typeof work === 'function' && typeof close === 'function', 'EXPLICIT_ORIGINAL_PUBLICATION_AND_CLOSE_REQUIRED');
  let failed = false, firstFailure;
  try { return await work(); }
  catch (error) { failed = true; firstFailure = error; throw error; }
  finally {
    try { await close(); }
    catch (closeFailure) {
      if (failed) throw new AggregateError([firstFailure, closeFailure], 'ORIGINAL_PUBLICATION_AND_CAPTURED_CLOSE_FAILED', { cause: firstFailure });
      throw closeFailure;
    }
  }
}
const OWNER_SETUP_IDENTITY_SQL = 'SELECT session_user::text session,current_user::text acting,pg_backend_pid() pid';
export const PUBLISHED_REFERENCE_STATE_SQL = `/* current-reference:published-state */
SELECT status,source_name,source_manifest_ref,source_hash,inventory_mode,checkpoint,
 to_char(cutoff_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') cutoff_at,
 history_expected_counts,history_payload_hash
FROM naijue_erp.import_batch WHERE id=$1::uuid`;
export const DIRECT_RUNTIME_IDENTITY_SQL = `/* current-runtime-host:direct-login */
SELECT current_user::text AS acting_role,session_user::text AS session_role,
 current_database() AS database,pg_backend_pid() AS pid,
 inet_server_addr()=inet '127.0.0.1' AS address_match,inet_server_port() AS port,
 pg_postmaster_start_time()::text AS postmaster_start,
 current_setting('server_version_num') AS server_version,
 current_setting('session_replication_role') AS replication_role`;

/** The exact same global quarantine is checked synchronously at EVERY actual
 * Client.query, including timeout SETs, after all awaited guards. No retries. */
export function createCapturedQueryBoundary(input) {
  const { budget, queryMetrics } = captureData(input, ['budget', ...(Object.hasOwn(input ?? {}, 'queryMetrics') ? ['queryMetrics'] : [])]);
  need(typeof budget?.remaining === 'function', 'FINITE_HOST_BUDGET_REQUIRED');
  if (queryMetrics !== undefined) assertCurrentRuntimeQueryMetrics(queryMetrics);
  const gate = createGlobalGate(), records = new Map(), receipts = [];
  function capture(client, kind) {
    need(client && typeof client === 'object' && ['admin', 'owner-setup-writer', 'runtime'].includes(kind), 'CAPTURED_HOST_CLIENT_REQUIRED');
    need(!records.has(client), 'HOST_CLIENT_CAPTURE_ONCE');
    const original = physicalClientFence(client, gate);
    // Default is the exact original fence. Optional TEST metrics observe only
    // captured ordinary runtime sends, never admin/setup/config/passwords.
    const fenced = queryMetrics !== undefined && kind === 'runtime'
      ? Object.freeze({ connection: original.connection, query(...args) {
        return observeCapturedRuntimeQuery(queryMetrics, args[0], () => original.query(...args));
      } }) : original;
    records.set(client, { kind, fenced, closePromise: null });
    return client;
  }
  function record(client) {
    const entry = records.get(client); need(entry && !entry.closePromise, 'LIVE_CAPTURED_HOST_CLIENT_REQUIRED');
    return entry;
  }
  async function query(client, text, values = []) {
    const entry = record(client);
    try { return await budgetedQuery(entry.fenced, text, values, budget); }
    catch (error) {
      if (text === 'COMMIT') gate.quarantine(error);
      throw error;
    }
  }
  async function commit(work) {
    need(typeof work === 'function' && !gate.quarantined(), 'ONE_EXPLICIT_COMMIT_CALLBACK_REQUIRED');
    try { return await work(); } catch (error) { gate.quarantine(error); throw error; }
  }
  function closeClient(client) {
    const entry = records.get(client); need(entry, 'CLOSE_ONLY_CAPTURED_HOST_CLIENT');
    if (!entry.closePromise) entry.closePromise = (async () => {
      const result = await settleClient(client);
      const receipt = Object.freeze({ kind: entry.kind, pid: Number.isInteger(client.processID) ? client.processID : null, ...result });
      receipts.push(receipt); return receipt;
    })();
    return entry.closePromise;
  }
  const boundary = Object.freeze({ gate, capture, query, commit, closeClient,
    hasCaptured(client, kind) { return records.get(client)?.kind === kind; },
    fence(client) { return record(client).fenced; },
    async closeAll() {
      const settled = await Promise.allSettled([...records.keys()].map(closeClient));
      need(settled.every(row => row.status === 'fulfilled' && row.value.confirmed === true), 'ALL_HOST_CLIENT_CLOSES_MUST_CONFIRM');
      return Object.freeze([...receipts]);
    },
    receipts: () => Object.freeze([...receipts]),
  });
  boundaries.add(boundary); return boundary;
}

/** New setup-only two captured ADMIN sessions, not a rewrite of the original
 * installer target guard. The extra session is original owner publication,
 * never the ordinary runtime role. Every other original target/role condition
 * is byte-preserved; the original installer still uses its untouched guard. */
export function renderOwnerPublicationGuard(planInput, targetInput, adminPid, writerPid) {
  const plan = assertPlan(planInput), cohort = sourceCohortFor(plan);
  const target = cohort.sourcePlan.targetSnapshot(targetInput);
  need(Number.isInteger(adminPid) && adminPid > 1 && Number.isInteger(writerPid) && writerPid > 1
    && writerPid !== adminPid, 'TWO_DISTINCT_CAPTURED_SETUP_PIDS_REQUIRED');
  const original = cohort.sourcePlan.targetGuard(target);
  const clause = "AND NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid())";
  need(original.split(clause).length === 2, 'UNIQUE_ORIGINAL_SINGLE_ADMIN_CLAUSE_REQUIRED');
  const replacement = `AND pg_backend_pid()=${adminPid}
 AND (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend' AND pid IN(${adminPid},${writerPid}))=2
 AND NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE backend_type='client backend'
  AND (pid NOT IN(${adminPid},${writerPid}) OR usename<>${literal(target.admin)} OR datname<>${literal(target.database)}))`;
  return original.replace(clause, replacement);
}

/** Current immutable source batch + original balances, not an assertion that
 * all native products/SKUs are forever the initial seed. Ordinary CREATE may
 * legitimately add new identities; no acceptance observation becomes expected. */
export async function verifyPublishedReferenceState(query, fixtureInput) {
  const fixture = assertFixture(fixtureInput); need(typeof query === 'function', 'FENCED_SOURCE_STATE_QUERY_REQUIRED');
  const rows = (await query(PUBLISHED_REFERENCE_STATE_SQL, [fixture.batchId])).rows;
  need(rows.length === 1, 'ONE_CURRENT_ORIGINAL_PUBLISHED_BATCH_REQUIRED');
  const row = captureData(rows[0], ['status', 'source_name', 'source_manifest_ref', 'source_hash',
    'inventory_mode', 'checkpoint', 'cutoff_at', 'history_expected_counts', 'history_payload_hash']);
  need(row.status === 'IMPORTED' && row.source_name === fixture.commands[0].sourceName
    && row.source_manifest_ref === fixture.commands[0].sourceManifestRef && row.source_hash === fixture.commands[0].sourceHash
    && row.inventory_mode === 'CUTOFF_STOCK_BASELINE' && row.cutoff_at === fixture.cutoffAt.slice(0, -1) + '000Z'
    && row.history_expected_counts === null && row.history_payload_hash === null
    && requestHash(snapshotSource(row.checkpoint)) === requestHash(fixture.checkpoints[3]),
  'CURRENT_PUBLISHED_REFERENCE_SOURCE_OR_CHECKPOINT_CHANGED');
  const balances = await verifyReferenceBalances(query, fixture);
  return Object.freeze({ originalBatchPublished: true, originalCheckpointSequence: 3, originalCheckpointCursor: 10,
    originalBalances: balances, additionalNativeProductSkuIdsForbidden: false, authority: 'NONE' });
}

/** Separate closed 303-row dataset. Never treats a cloned/old fixture as scaled. */
export async function verifyPublishedScaledReferenceState(query, fixtureInput) {
  const fixture = assertScaledFixture(fixtureInput); need(typeof query === 'function', 'FENCED_SOURCE_STATE_QUERY_REQUIRED');
  const rows = (await query(PUBLISHED_REFERENCE_STATE_SQL, [fixture.batchId])).rows;
  need(rows.length === 1, 'ONE_CURRENT_ORIGINAL_PUBLISHED_BATCH_REQUIRED');
  const row = captureData(rows[0], ['status', 'source_name', 'source_manifest_ref', 'source_hash',
    'inventory_mode', 'checkpoint', 'cutoff_at', 'history_expected_counts', 'history_payload_hash']);
  need(row.status === 'IMPORTED' && row.source_name === fixture.commands[0].sourceName
    && row.source_manifest_ref === fixture.commands[0].sourceManifestRef && row.source_hash === fixture.commands[0].sourceHash
    && row.inventory_mode === 'CUTOFF_STOCK_BASELINE' && row.cutoff_at === fixture.cutoffAt.slice(0, -1) + '000Z'
    && row.history_expected_counts === null && row.history_payload_hash === null
    && requestHash(snapshotSource(row.checkpoint)) === requestHash(fixture.checkpoints[3]),
  'CURRENT_PUBLISHED_REFERENCE_SOURCE_OR_CHECKPOINT_CHANGED');
  const balances = await verifyScaledReferenceBalances(query, fixture);
  return Object.freeze({ originalBatchPublished: true, originalCheckpointSequence: 3, originalCheckpointCursor: 107,
    originalBalances: balances, additionalNativeProductSkuIdsForbidden: false, authority: 'NONE' });
}

/** The source-plan install and original legacy-cutoff publication are setup,
 * never the ordinary Supplier/Product business proof. All actual source SQL,
 * owner setup writers and the later ordinary pool share ONE physical gate.
 * This function does not create a cluster or choose an existing database. */
const ORIGINAL_REFERENCE_FUNCTIONS = Object.freeze({ build: buildReferenceFixture, seed: seedNewReference,
  seedEvidenceName: 'reference105-seed-acknowledged.json', publication: createReferencePublication,
  source: verifyReferenceSource, balances: verifyReferenceBalances,
  acknowledgement: verifyReferenceAcknowledgement, published: verifyPublishedReferenceState });
const SCALED_REFERENCE_FUNCTIONS = Object.freeze({ build: buildScaledReferenceFixture, seed: seedScaledReferenceFixture,
  seedEvidenceName: 'reference303-seed-acknowledged.json', publication: createScaledReferencePublication,
  source: verifyScaledReferenceSource, balances: verifyScaledReferenceBalances,
  acknowledgement: verifyScaledReferenceAcknowledgement, published: verifyPublishedScaledReferenceState });
const ORIGINAL_335_PREPARATION = Object.freeze({ assertPolicy: assertFinitePolicy, renderGrants: renderFiniteGrants, reference: ORIGINAL_REFERENCE_FUNCTIONS });
const ALIAS4_339_PREPARATION = Object.freeze({ assertPolicy: assertAliasFourReadPolicy, renderGrants: renderAliasFourGrants, reference: ORIGINAL_REFERENCE_FUNCTIONS });
const SCALED_ALIAS4_339_PREPARATION = Object.freeze({ assertPolicy: assertAliasFourReadPolicy, renderGrants: renderAliasFourGrants, reference: SCALED_REFERENCE_FUNCTIONS });
/** Fixed entry points only. A caller cannot supply a profile or renderer. */
export async function preparePublishedCurrentReference(input) {
  return await prepareReferenceOnProfile(input, ORIGINAL_335_PREPARATION);
}
export async function preparePublishedCurrentReferenceAlias4(input) {
  return await prepareReferenceOnProfile(input, ALIAS4_339_PREPARATION);
}
/** Only the new explicit entry opts into the fixed scaled source dataset. */
export async function preparePublishedScaledReferenceAlias4(input) {
  return await prepareReferenceOnProfile(input, SCALED_ALIAS4_339_PREPARATION);
}
async function prepareReferenceOnProfile(input, profile) {
  const args = captureData(input, ['plan', 'policy', 'target', 'budget', 'queryBoundary', 'adminClient',
    'adminPassword', 'artifactRoot', 'verifyPhysical', 'verifySources', 'registerSecret', 'save']);
  const plan = assertPlan(args.plan), policy = profile.assertPolicy(args.policy), cohort = sourceCohortFor(plan);
  need(boundaries.has(args.queryBoundary) && args.queryBoundary.hasCaptured(args.adminClient, 'admin'),
    'ONE_SHARED_CAPTURED_ADMIN_QUERY_BOUNDARY_REQUIRED');
  need(typeof args.adminPassword === 'string' && args.adminPassword.length >= 32
    && typeof args.artifactRoot === 'string' && path.isAbsolute(args.artifactRoot)
    && ['verifyPhysical', 'verifySources', 'registerSecret', 'save'].every(key => typeof args[key] === 'function'),
  'EXPLICIT_BIRTH_SOURCE_ARTIFACT_SECRET_AND_EVIDENCE_CALLBACKS_REQUIRED');
  const boundary = args.queryBoundary, target = cohort.sourcePlan.targetSnapshot(args.target), fixture = profile.reference.build();
  const unchanged = async () => { args.budget.remaining(); await args.verifySources(); await args.verifyPhysical(); };
  const query = async (text, values = []) => { await unchanged(); return await boundary.query(args.adminClient, text, values); };
  let writerLive = null;
  const guard = async () => { await unchanged(); await query(writerLive
    ? renderOwnerPublicationGuard(plan, target, args.adminClient.processID, writerLive.processID)
    : cohort.sourcePlan.targetGuard(target)); };
  const sourceEvents = [];
  const installed = await installOriginalSourceSchema({ plan, target, query, gate: boundary.gate,
    beforeFile: async () => { await unchanged(); }, onSourceEvent: async event => {
      // Event digests only; no SQL parameters or passwords in these records.
      sourceEvents.push({ ...event });
    } });
  need(sourceEvents.length === 715, '714_ORIGINAL_SOURCE_EVENTS_AND_ONE_V22_CARRIER_REQUIRED');
  await args.save('original-source-install-events.json', sourceEvents);
  await guard();
  const emptySchema = await cohort.sourceObserver.observe(query, plan);
  await args.save('empty-source-schema-observation.json', emptySchema);
  const appPassword = randomBytes(32).toString('base64url'); args.registerSecret(appPassword);
  const passwordHash = await createNodeScryptPasswords().hash(appPassword); args.registerSecret(passwordHash);
  const seed = await oneTransaction(query, async () => {
    await guard(); await query(`SET LOCAL ROLE ${identifier(target.owner)}`);
    const proof = await profile.reference.seed(query, fixture, passwordHash);
    await query('RESET ROLE'); await guard(); return proof;
  });
  await args.save(profile.reference.seedEvidenceName, seed);
  await mkdir(args.artifactRoot, { mode: 0o700 });
  for (const artifact of fixture.artifacts) await writeFile(path.join(args.artifactRoot, artifact.path.split('/').at(-1)),
    artifact.utf8, { flag: 'wx', mode: 0o600 });
  const readArtifact = async logical => {
    const artifact = fixture.artifacts.find(a => a.path === logical); need(artifact, 'ONLY_THREE_NEW_REFERENCE_ARTIFACTS');
    return await readFile(path.join(args.artifactRoot, artifact.path.split('/').at(-1)));
  };
  const writer = guardedLegacyPool({ gate: boundary.gate, budget: args.budget,
    async openCaptured() {
      need(writerLive === null, 'ONE_ORIGINAL_PUBLICATION_SETUP_WRITER'); await guard();
      const client = new Client({ host: '127.0.0.1', port: target.port, database: target.database,
        user: target.admin, password: args.adminPassword, ssl: false,
        application_name: 'dot-current-reference-owner-setup-only', options: '-c search_path=pg_catalog -c session_replication_role=origin',
        connectionTimeoutMillis: Math.min(5000, args.budget.remaining()), query_timeout: 45000,
        statement_timeout: 45000, lock_timeout: 3000, idle_in_transaction_session_timeout: 60000 });
      boundary.capture(client, 'owner-setup-writer');
      try {
        await client.connect(); writerLive = client;
        await boundary.query(client, `SET ROLE ${identifier(target.owner)}`);
        const identity = (await boundary.query(client, OWNER_SETUP_IDENTITY_SQL)).rows[0];
        need(identity?.session === target.admin && identity.acting === target.owner && identity.pid === client.processID,
          'ORIGINAL_PUBLICATION_OWNER_SETUP_NOT_ORDINARY_RUNTIME');
        const fenced = boundary.fence(client);
        return Object.freeze({ physical: client, async query(config) {
          if (!/^SET statement_timeout='[1-9][0-9]{0,4}ms'$/.test(config.text)) {
            await guard();
            // ROLLBACK must be first SQL on a possibly aborted writer tx.
            if (config.text !== 'ROLLBACK') {
              const row = (await boundary.query(client, OWNER_SETUP_IDENTITY_SQL)).rows[0];
              need(row?.session === target.admin && row.acting === target.owner && row.pid === client.processID,
                'CAPTURED_SOURCE_PUBLICATION_WRITER_OWNER_IDENTITY_REQUIRED');
            }
          }
          return await fenced.query(config);
        } });
      } catch (error) { await boundary.closeClient(client); writerLive = null; throw error; }
    },
    async closeCaptured(adapter) { const result = await boundary.closeClient(adapter.physical); writerLive = null; return result; },
  });
  const acknowledgements = [], beforePublish = [];
  const publication = await runOriginalPublicationAndClose(async () => {
    const producer = profile.reference.publication({ fixture, pool: writer, readArtifact, now: () => new Date().toISOString(),
      beforeCommand: async index => {
        await writer.awaitIdle(); await guard();
        const source = await profile.reference.source(query, fixture, passwordHash, index);
        if (index === 3) {
          const balances = await profile.reference.balances(query, fixture);
          beforePublish.push({ index, source, balances }); await args.save('before-original-publish-source-closure.json', beforePublish[0]);
        }
      },
      onAcknowledged: async (index, result, occurredAt) => {
        await writer.awaitIdle(); await guard();
        acknowledgements.push(await profile.reference.acknowledgement(fixture, query, index, result, occurredAt));
      } });
    const result = await producer.execute(); await writer.awaitIdle(); return result;
  }, () => writer.close());
  need(acknowledgements.length === 4 && beforePublish.length === 1, 'FOUR_REAL_SOURCE_COMMAND_ACKS_AND_PREPUBLICATION_BALANCES_REQUIRED');
  await args.save('original-publication-acknowledged.json', publication);
  await args.save('original-publication-receipt-audit-ledger.json', acknowledgements);
  await profile.reference.balances(query, fixture);
  for (const database of ['postgres', 'template0', 'template1']) await boundary.commit(() => query(`REVOKE ALL ON DATABASE ${identifier(database)} FROM PUBLIC`));
  const runtimePassword = randomBytes(32).toString('base64url'); args.registerSecret(runtimePassword);
  const grants = profile.renderGrants(policy);
  await oneTransaction(query, async () => {
    await guard();
    await query(`CREATE ROLE ${identifier(LOGICAL.runtime)} LOGIN PASSWORD ${literal(runtimePassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 4`);
    await query(`SET LOCAL ROLE ${identifier(target.owner)}`);
    for (const statement of grants.statements) await query(statement);
    await query('RESET ROLE');
  });
  const finalTarget = { ...target, runtime: LOGICAL.runtime };
  const session = createCurrentRuntimeSession({ target: finalTarget, budget: args.budget, queryBoundary: boundary,
    adminClient: args.adminClient, runtimePassword, verifyPhysical: args.verifyPhysical, verifySources: args.verifySources,
    verifyPublished: async adminQuery => { await profile.reference.published(adminQuery, fixture); } });
  await session.guard();
  return Object.freeze({ session, fixture, policy, installation: installed, originalPublication: publication,
    acknowledgements: Object.freeze(acknowledgements), emptySchemaObservation: emptySchema,
    scope: 'NEW_SOURCE_INSTALL_AND_REAL_LEGACY_PUBLICATION_SETUP_NOT_YET_ORDINARY_BUSINESS_OR_EXPECTED_REVIEW' });
}

/** Caller must supply the independently birth/source/publication checks from
 * the new host. They are NOT replaced by a role label or this SQL guard.
 * Runtime connections are constructed here as genuine direct LOGIN clients;
 * no SET ROLE, owner fallback, grants or adaptive ACL repair occur here. */
export function createCurrentRuntimeSession(input) {
  const args = captureData(input, ['target', 'budget', 'adminClient', 'runtimePassword',
    'verifyPhysical', 'verifySources', 'verifyPublished', ...(Object.hasOwn(input ?? {}, 'queryBoundary') ? ['queryBoundary'] : [])]);
  const target = captureFiveRoleTarget(args.target);
  need(typeof args.runtimePassword === 'string' && args.runtimePassword.length >= 32
    && ['verifyPhysical', 'verifySources', 'verifyPublished'].every(key => typeof args[key] === 'function'),
  'EXPLICIT_MEMORY_PASSWORD_AND_INDEPENDENT_HOST_CHECKS_REQUIRED');
  need(Number.isInteger(args.adminClient?.processID) && args.adminClient.processID > 1, 'CAPTURED_ADMIN_PID_REQUIRED');
  const boundary = args.queryBoundary ?? createCapturedQueryBoundary({ budget: args.budget });
  need(boundaries.has(boundary), 'ORIGINAL_HOST_GLOBAL_QUERY_BOUNDARY_REQUIRED');
  if (!boundary.hasCaptured(args.adminClient, 'admin')) boundary.capture(args.adminClient, 'admin');
  const sessions = [], current = new Set(); let opening = false;
  async function unchanged() { await args.verifySources(); await args.verifyPhysical(); }
  async function adminQuery(text, values = []) {
    await unchanged(); return await boundary.query(args.adminClient, text, values);
  }
  async function guard() {
    await unchanged();
    const pids = [args.adminClient.processID, ...[...current].map(client => client.processID)];
    await adminQuery(renderPostCutoffFiveRoleGuard(target, pids));
  }
  const pool = guardedLegacyPool({ gate: boundary.gate, budget: args.budget,
    async openCaptured() {
      need(!opening && current.size === 0, 'ONE_CAPTURED_ORDINARY_RUNTIME_LEASE_AT_A_TIME'); opening = true;
      let client;
      try {
        await guard(); await args.verifyPublished(adminQuery); args.budget.remaining();
        client = new Client({ host: '127.0.0.1', port: target.port, database: target.database,
          user: target.runtime, password: args.runtimePassword, ssl: false,
          application_name: 'dot-current-native-ordinary-login',
          connectionTimeoutMillis: Math.min(5000, args.budget.remaining()), query_timeout: 45000,
          statement_timeout: 45000, lock_timeout: 3000, idle_in_transaction_session_timeout: 60000,
          // origin is observed below, not SET by an ordinary LOGIN without
          // parameter privilege. Granting that privilege would widen policy.
          options: '-c search_path=pg_catalog' });
        boundary.capture(client, 'runtime'); await client.connect(); current.add(client);
        await guard();
        const rows = (await boundary.query(client, DIRECT_RUNTIME_IDENTITY_SQL)).rows;
        need(rows.length === 1, 'ONE_ACTUAL_DIRECT_RUNTIME_IDENTITY_REQUIRED'); const row = rows[0];
        need(row.acting_role === target.runtime && row.session_role === target.runtime
          && row.database === target.database && row.pid === client.processID && row.address_match === true
          && row.port === target.port && row.postmaster_start === target.postmasterStart
          && row.server_version === '170011' && row.replication_role === 'origin',
        'ACTUAL_DIRECT_NONOWNER_RUNTIME_LOGIN_REQUIRED');
        sessions.push(Object.freeze({ ...row }));
        const fenced = boundary.fence(client);
        return Object.freeze({ physical: client, async query(config) {
          const q = captureData(config, ['text', 'values', 'query_timeout']);
          need(typeof q.text === 'string' && Number.isInteger(q.query_timeout) && q.query_timeout > 0
            && q.query_timeout <= 45000, 'BOUNDED_ORIGINAL_RUNTIME_WIRE_QUERY_REQUIRED');
          if (/^SET statement_timeout='[1-9][0-9]{0,4}ms'$/.test(q.text)) {
            need(q.values === undefined && Number(q.text.match(/[0-9]+/)[0]) <= 45000, 'ONLY_HOST_BUDGET_TIMEOUT_SET');
          } else {
            need(!/^\s*(?:SET\s+(?:LOCAL\s+)?ROLE|RESET\s+ROLE)\b/i.test(q.text), 'NO_OWNER_OR_SET_ROLE_BUSINESS_FALLBACK');
            await guard();
          }
          return await fenced.query(config);
        } });
      } catch (error) {
        if (client) { await boundary.closeClient(client); current.delete(client); }
        throw error;
      } finally { opening = false; }
    },
    async closeCaptured(adapter) {
      const result = await boundary.closeClient(adapter.physical); current.delete(adapter.physical); return result;
    },
  });
  runtimePools.add(pool);
  return Object.freeze({ target, pool, gate: boundary.gate, adminQuery, guard,
    commitBoundary: boundary.commit,
    sessions: () => Object.freeze([...sessions]),
    closeRuntime: () => pool.close(),
    async close() {
      // Close-only after quarantine. Never send ROLLBACK or catalog SQL here.
      let failure; try { await pool.close(); } catch (error) { failure = error; }
      const receipts = await boundary.closeAll(); if (failure) throw failure; return receipts;
    },
  });
}
