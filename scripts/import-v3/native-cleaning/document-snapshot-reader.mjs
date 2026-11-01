import {readLegacyReferenceTables} from './reference-snapshot-reader.mjs';

/** Read original headers and every revision in one PostgreSQL snapshot.
 * JSON stays text: JS number/date conversion must not change source facts.
 * Caller owns the existing pool, private output and target authorization.
 */
export function readLegacyDocumentSnapshot(pool, options) {
  return readLegacySnapshot(pool, options, false);
}

/** Catalogue/reference rows and documents share the same owned connection/transaction.
 * This does not yet include inventory, credential conversion or target writes.
 */
export function readLegacyDocumentAndReferenceSnapshot(pool, options) {
  return readLegacySnapshot(pool, options, true);
}

async function readLegacySnapshot(pool, {
  pageRows = 100, onDocuments, onRevisions, onReferences, signal,
}, includeReferences) {
  if (!Number.isSafeInteger(pageRows) || pageRows < 1 || pageRows > 500) {
    throw new Error('INVALID_DOCUMENT_PAGE_SIZE');
  }
  if (typeof onDocuments !== 'function' || typeof onRevisions !== 'function') {
    throw new Error('DOCUMENT_SNAPSHOT_SINK_REQUIRED');
  }
  if (includeReferences && typeof onReferences !== 'function') throw new Error('REFERENCE_SNAPSHOT_SINK_REQUIRED');
  const client = await pool.connect();
  let transaction = false, releaseError;
  const progress = {
    documents: { expected: null, rowsRead: '0', eofObserved: false },
    revisions: { expected: null, rowsRead: '0', eofObserved: false },
  };
  const active = () => signal?.throwIfAborted();
  try {
    active();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    } catch (error) {
      // A failed/unknown BEGIN must not return a possibly open transaction to the pool.
      releaseError = error;
      throw error;
    }
    transaction = true;
    await client.query("SET LOCAL timezone='UTC'");
    await client.query("SET LOCAL statement_timeout='3s'");
    await client.query("SET LOCAL lock_timeout='1s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='5s'");
    const metadata = await client.query(`SELECT current_database() AS database,
      current_user AS role, pg_current_snapshot()::text AS snapshot,
      current_setting('transaction_read_only') AS read_only,
      current_setting('transaction_isolation') AS isolation`);
    const identity = metadata.rows[0];
    if (identity?.read_only !== 'on' || identity.isolation !== 'repeatable read') {
      throw new Error('DOCUMENT_READONLY_SNAPSHOT_REQUIRED');
    }
    const references = includeReferences
      ? await readLegacyReferenceTables(client, {pageRows, onReferences, signal}) : undefined;
    const counts = await client.query(`SELECT
      (SELECT count(*)::text FROM erp_prod_runtime.document) AS documents,
      (SELECT count(*)::text FROM erp_prod_runtime.revision) AS revisions`);
    const expected = counts.rows[0];
    for (const key of ['documents', 'revisions']) {
      if (!/^(0|[1-9][0-9]*)$/.test(expected?.[key])) throw new Error('INVALID_SOURCE_COUNT');
      progress[key].expected = expected[key];
    }
    const headers = new Map(), revisionKeys = new Set(), currentFound = new Set();
    const totals = { documents: 0n, revisions: 0n };
    const jsonBytes = {documents: 0n, revisions: 0n}, largestRowBytes = {documents: 0n, revisions: 0n};
    const consume = async (cursor, kind, sink) => {
      for (;;) {
        active();
        const page = await client.query(`FETCH FORWARD ${pageRows} FROM ${cursor}`);
        if (!Array.isArray(page.rows) || page.rows.length > pageRows) throw new Error('INVALID_SOURCE_PAGE');
        if (page.rows.length === 0) { progress[kind].eofObserved = true; break; } // Explicit EOF.
        for (const row of page.rows) {
          if (typeof row.source_document_id !== 'string' || typeof row.raw_json !== 'string') {
            throw new Error('INVALID_SOURCE_ROW');
          }
          if (kind === 'documents') {
            if (headers.has(row.source_document_id)) throw new Error('DUPLICATE_DOCUMENT_ID');
            headers.set(row.source_document_id, row.source_revision);
          } else {
            const key = JSON.stringify([row.source_document_id, row.source_revision]);
            if (revisionKeys.has(key)) throw new Error('DUPLICATE_REVISION_KEY');
            revisionKeys.add(key);
            if (!headers.has(row.source_document_id)) throw new Error('REVISION_DOCUMENT_OUTSIDE_COHORT');
            if (headers.get(row.source_document_id) === row.source_revision) currentFound.add(row.source_document_id);
          }
          if (typeof row.source_revision !== 'string' || !/^-?[0-9]+$/.test(row.source_revision)) {
            throw new Error('INVALID_SOURCE_REVISION');
          }
          const bytes = BigInt(Buffer.byteLength(row.raw_json, 'utf8'));
          jsonBytes[kind] += bytes;
          if (bytes > largestRowBytes[kind]) largestRowBytes[kind] = bytes;
        }
        totals[kind] += BigInt(page.rows.length);
        progress[kind].rowsRead = totals[kind].toString();
        if (totals[kind] > BigInt(expected[kind])) throw new Error('SOURCE_COUNT_EXCEEDED');
        await sink(page.rows); // Private provisional output until the returned completion receipt.
        active();
      }
      if (totals[kind] !== BigInt(expected[kind])) throw new Error('SOURCE_EOF_COUNT_MISMATCH');
      await client.query(`CLOSE ${cursor}`);
    };
    await client.query(`DECLARE cleaning_documents NO SCROLL CURSOR FOR
      SELECT d.id::text AS source_document_id, d.current_revision::text AS source_revision,
      to_jsonb(d)::text AS raw_json FROM erp_prod_runtime.document d ORDER BY d.id`);
    await consume('cleaning_documents', 'documents', onDocuments);
    await client.query(`DECLARE cleaning_revisions NO SCROLL CURSOR FOR
      SELECT r.document_id::text AS source_document_id, r.revision::text AS source_revision,
      to_jsonb(r)::text AS raw_json FROM erp_prod_runtime.revision r ORDER BY r.document_id, r.revision`);
    await consume('cleaning_revisions', 'revisions', onRevisions);
    if (currentFound.size !== headers.size) throw new Error('CURRENT_REVISION_MISSING');
    active();
    await client.query('ROLLBACK');
    transaction = false;
    return { status: includeReferences ? 'COMPLETE_DOCUMENT_AND_REFERENCE_SNAPSHOT' : 'COMPLETE_DOCUMENT_SNAPSHOT', identity,
      counts: { documents: totals.documents.toString(), revisions: totals.revisions.toString() },
      eof: { documents: true, revisions: true }, currentPointersVerified: true,
      rawJsonUtf8Bytes: Object.fromEntries(Object.entries(jsonBytes).map(([key, value]) => [key, value.toString()])),
      largestRawJsonRowUtf8Bytes: Object.fromEntries(Object.entries(largestRowBytes).map(([key, value]) => [key, value.toString()])),
      businessWrites: false, ...(includeReferences ? {references} : {}) };
  } catch (error) {
    // Counts only, never source values. Partial output is not a completion receipt.
    if (error instanceof Error && Object.isExtensible(error)) {
      error.snapshotProgress = Object.freeze(Object.fromEntries(
        Object.entries(progress).map(([key, value]) => [key, Object.freeze({ ...value })])));
    }
    throw error;
  } finally {
    if (transaction) {
      try { await client.query('ROLLBACK'); } catch (error) { releaseError = error; }
    }
    client.release(releaseError);
  }
}
