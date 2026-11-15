import {DatabaseSync} from 'node:sqlite';
import {open, lstat} from 'node:fs/promises';
import {stableImportId} from '../../../../../T45/revisions/20261115-r3-party-single-projection-carrier-local-01/source/packages/application/src/inventory-cutoff-import.ts';
import {requestHash} from '../../../../../T45/revisions/20261115-r3-party-single-projection-carrier-local-01/source/packages/application/src/request-hash.ts';

const MAX_ROWS = 500;
const MAX_BYTES = 7 * 1024 * 1024;
const FORMAT = 'STANDARD_BATCHED_STREAM_PLAN_V2';

// The input is the existing, bound non-coalesced program. Only transaction
// boundaries change. Original requests, sequences and operation keys survive.
export async function prepareBatchedStreamPlan(path, program, context) {
  const reservation = await open(path, 'wx', 0o600);
  await reservation.close();
  const db = new DatabaseSync(path);
  try {
    db.exec(`PRAGMA journal_mode=DELETE; PRAGMA cache_size=-4096; PRAGMA temp_store=FILE;
      CREATE TABLE meta (name TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE step (ordinal INTEGER PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE batch (ordinal INTEGER PRIMARY KEY, value TEXT NOT NULL);
      BEGIN`);
    const identity = structuredClone(program.identity);
    const rootOperationId = program.initialize.operation_id;
    const batchIdentity = {...identity, rootOperationId};
    const insertStep = db.prepare('INSERT INTO step VALUES (?,?)');
    const insertBatch = db.prepare('INSERT INTO batch VALUES (?,?)');
    let ordinal = 0;
    let batchOrdinal = 0;
    let predecessor = null;
    let previousLastOperationId = null;
    let previousDescriptorSha256 = null;
    let pending = null;
    let document = null;
    let phaseRank = 0;
    let baselineClosed = false;
    let documentsOpened = false;
    let finalized = false;
    let oversizedGroups = 0;
    let maxGroupRows = 0;
    let maxGroupBytes = 0;

    function bind(request, batchId) {
      if (request.batch_id !== batchId || request.plan_sha256 !== identity.planSha256
        || request.package_manifest_sha256 !== identity.packageSha256
        || request.namespace !== identity.namespace || request.cutoff_at !== identity.cutoffAt) {
        throw Error('BATCH_REQUEST_BINDING_INVALID');
      }
    }
    function flush() {
      if (!pending) return;
      const subBatchId = stableImportId('standard-import-sub-batch-v1',
        rootOperationId, identity.batchId, identity.packageSha256, identity.planSha256,
        pending.phase, String(pending.first), String(pending.last));
      const descriptor = {...pending, ordinal: batchOrdinal, subBatchId, predecessor,
        previousLastOperationId, previousDescriptorSha256};
      descriptor.descriptorSha256 = requestHash({identity: batchIdentity, descriptor});
      insertBatch.run(batchOrdinal++, JSON.stringify(descriptor));
      if (pending.rows > MAX_ROWS || pending.bytes > MAX_BYTES) oversizedGroups++;
      maxGroupRows = Math.max(maxGroupRows, pending.rows);
      maxGroupBytes = Math.max(maxGroupBytes, pending.bytes);
      predecessor = subBatchId;
      previousLastOperationId = descriptor.lastOperationId;
      previousDescriptorSha256 = descriptor.descriptorSha256;
      pending = null;
    }
    function unit(phase, first, last, rows, bytes, firstOperationId, lastOperationId) {
      if (pending && (pending.phase !== phase || pending.rows + rows > MAX_ROWS
        || pending.bytes + bytes > MAX_BYTES)) flush();
      if (!pending) pending = {phase, first, last, rows: 0, bytes: 0, firstOperationId, lastOperationId};
      pending.last = last;
      pending.lastOperationId = lastOperationId;
      pending.rows += rows;
      pending.bytes += bytes;
      // One oversized document remains atomic across bounded requests.
      if (pending.rows >= MAX_ROWS || pending.bytes >= MAX_BYTES) flush();
    }
    bind(program.initialize, identity.batchId);
    if (program.initialize.payload.document_batch_id !== identity.documentBatchId) {
      throw Error('BATCH_DOCUMENT_ID_INVALID');
    }
    const initializer = JSON.stringify({method: 'initialize', request: program.initialize});
    insertStep.run(ordinal, initializer);
    unit('CORE', ordinal, ordinal, 0, Buffer.byteLength(initializer), rootOperationId, rootOperationId);
    ordinal++;
    flush();

    for await (const step of program.steps) {
      if (finalized) throw Error('BATCH_STEP_AFTER_FINALIZE');
      const payload = step.request.payload;
      let phase;
      let rank;
      if (step.method === 'masterChunk') { phase = 'MASTER'; rank = 0; }
      else if (step.method === 'baselineKeys') { phase = 'KEYS'; rank = 1; }
      else if (step.method === 'publish' && payload.phase === 'BASELINE') {
        if (baselineClosed) throw Error('BATCH_BASELINE_DUPLICATE');
        phase = 'BASELINE_CLOSE'; rank = 2; baselineClosed = true;
      } else if (step.method === 'documentChunk' && payload.mode === 'STAGE') {
        if (!baselineClosed || documentsOpened) throw Error('BATCH_DOCUMENT_OPEN_ORDER');
        phase = 'DOCUMENT_OPEN'; rank = 3; documentsOpened = true;
      } else if (step.method === 'documentChunk' && payload.mode === 'CHUNK') {
        if (!documentsOpened) throw Error('BATCH_DOCUMENT_OPEN_REQUIRED');
        phase = 'HISTORY'; rank = 4;
      } else if (step.method === 'publish' && payload.phase === 'DOCUMENTS') {
        if (!documentsOpened || document) throw Error('BATCH_DOCUMENT_INCOMPLETE');
        phase = 'FINALIZE'; rank = 5; finalized = true;
      } else throw Error('BATCH_STEP_INVALID');
      if (rank < phaseRank) throw Error('BATCH_STEP_ORDER_INVALID');
      phaseRank = rank;
      bind(step.request, rank >= 3 ? identity.documentBatchId : identity.batchId);
      const serialized = JSON.stringify(step);
      const rows = payload.rows ?? [];
      const bytes = Buffer.byteLength(serialized);
      if (!Array.isArray(rows) || rows.length > MAX_ROWS) throw Error('BATCH_REQUEST_ROWS_INVALID');
      insertStep.run(ordinal, serialized);
      if (phase === 'HISTORY') {
        const completed = payload.documents;
        if (!Array.isArray(completed) || completed.length > 1) {
          throw Error('BATCH_NON_COALESCED_DOCUMENT_STREAM_REQUIRED');
        }
        const headers = rows.filter(row => ['SALES_HEADER', 'TRANSFER_HEADER'].includes(row.entity_type));
        if (!document) {
          if (headers.length !== 1 || rows[0] !== headers[0]) throw Error('BATCH_DOCUMENT_HEADER_REQUIRED');
          document = {id: headers[0].target_id, kind: headers[0].entity_type === 'SALES_HEADER' ? 'SALES' : 'TRANSFER',
            first: ordinal, rows: 0, bytes: 0, firstOperationId: step.request.operation_id};
        } else if (headers.length) throw Error('BATCH_DOCUMENT_INTERLEAVED');
        for (const row of rows) {
          if (row.entity_type.endsWith('_HEADER')) continue;
          const parent = document.kind === 'SALES' ? row.fields.sales_id : row.fields.transfer_id;
          const allowed = document.kind === 'SALES' ? ['SALES_LINE', 'SALES_SETTLEMENT'] : ['TRANSFER_LINE'];
          if (!allowed.includes(row.entity_type) || parent !== document.id) throw Error('BATCH_DOCUMENT_PARENT_INVALID');
        }
        document.rows += rows.length;
        document.bytes += bytes;
        if (completed.length) {
          if (completed[0].id !== document.id || completed[0].kind !== document.kind) {
            throw Error('BATCH_DOCUMENT_CLOSE_MISMATCH');
          }
          unit(phase, document.first, ordinal, document.rows, document.bytes,
            document.firstOperationId, step.request.operation_id);
          document = null;
        }
      } else {
        if (document) throw Error('BATCH_DOCUMENT_INCOMPLETE');
        unit(phase, ordinal, ordinal, rows.length, bytes, step.request.operation_id, step.request.operation_id);
        if (['BASELINE_CLOSE', 'DOCUMENT_OPEN', 'FINALIZE'].includes(phase)) flush();
      }
      ordinal++;
    }
    if (!finalized || document) throw Error('BATCH_PROGRAM_INCOMPLETE');
    flush();
    const metadata = {format: FORMAT, identity, rootOperationId, batchCount: batchOrdinal, stepCount: ordinal,
      oversizedGroups, maxGroupRows, maxGroupBytes, ...(context === undefined ? {} : {context})};
    db.prepare('INSERT INTO meta VALUES (?,?)').run('plan', JSON.stringify(metadata));
    db.exec('COMMIT');
    return metadata;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  } finally { db.close(); }
}

export async function openBatchedStreamPlan(path, expectedIdentity) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('BATCH_PLAN_FILE_INVALID');
  const db = new DatabaseSync(path, {readOnly: true});
  try {
    db.exec('PRAGMA query_only=ON; PRAGMA cache_size=-4096; BEGIN');
    const metadata = JSON.parse(db.prepare("SELECT value FROM meta WHERE name='plan'").get()?.value ?? 'null');
    if (metadata?.format !== FORMAT || (expectedIdentity !== undefined && requestHash(metadata.identity) !== requestHash(expectedIdentity))) {
      throw Error('BATCH_PLAN_IDENTITY_MISMATCH');
    }
    const steps = db.prepare('SELECT value FROM step WHERE ordinal BETWEEN ? AND ? ORDER BY ordinal');
    return {
      metadata,
      initialize() { return JSON.parse(db.prepare('SELECT value FROM step WHERE ordinal=0').get().value).request; },
      *batches() {
        for (const row of db.prepare('SELECT value FROM batch ORDER BY ordinal').iterate()) yield JSON.parse(row.value);
      },
      async *steps(batch) {
        for (const row of steps.iterate(batch.first, batch.last)) yield JSON.parse(row.value);
      },
      close() { db.close(); },
    };
  } catch (error) { db.close(); throw error; }
}
