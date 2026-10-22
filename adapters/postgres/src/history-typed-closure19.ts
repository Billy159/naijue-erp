import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { captureHistoryTypedClosureStageInput } from "../../../packages/application/src/history-typed-closure.ts";
import { assertHistoryPublicationSchema19 } from "../../../packages/application/src/history-typed-publication.ts";
import type { HistoryTypedClosureStageInput } from "../../../packages/application/src/history-typed-closure.ts";
import { assertNativeImportAccountingSchema19Guards } from "./native-import-accounting-capability.ts";
import type { PgSalesClient, PgSalesPool } from "./sales-unit-of-work.ts";

export interface HistoryTypedClosure19StageAuthorization {
 readonly authorizeStage: (wholeInput: HistoryTypedClosureStageInput) => Promise<void>;
}
const must = (value: unknown, message: string): void => requireDomain(value, "HISTORY_CLOSURE_STAGE_MISMATCH", message);
/** Independent exact19 STAGE successor. Frozen exact18 entry is unchanged.
 * Trusted internal source-authorized STAGE, never an HTTP/publication capability.
 * Registry and full runtime guards must recognize19 before this can write any row. */
export class PostgresHistoryTypedClosure19Store {
 private readonly pool: PgSalesPool;
 private readonly authorizeStage: HistoryTypedClosure19StageAuthorization["authorizeStage"];
 constructor(pool: PgSalesPool, config: HistoryTypedClosure19StageAuthorization) {
  const keys = config && Reflect.ownKeys(config), descriptor = config && Object.getOwnPropertyDescriptor(config, "authorizeStage");
  if (typeof pool?.connect !== "function" || !config || Object.getPrototypeOf(config) !== Object.prototype || keys?.length !== 1 || keys[0] !== "authorizeStage" || !descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "function") throw TypeError("Explicit own-data whole-source closure authorizer and owned pool required");
  this.pool = pool; this.authorizeStage = descriptor.value;
 }
 async stage(original: HistoryTypedClosureStageInput): Promise<{ inserted: number; replayed: number }> {
  const input = captureHistoryTypedClosureStageInput(original);
  // Neither an asynchronous caller nor the authorizer can mutate the captured write input.
  const authorizeStage = this.authorizeStage;
  await authorizeStage(structuredClone(input));
  const client = await this.pool.connect(); let began = false, committing = false, discard: Error | undefined;
  try {
   await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
   const result = await this.write(client, input); committing = true; await client.query("COMMIT"); return result;
  } catch (error) {
   if (!began || committing) discard = error instanceof Error ? error : Error("Closure STAGE outcome unknown");
   else try { await client.query("ROLLBACK"); } catch (rollback) { discard = rollback instanceof Error ? rollback : Error("Closure rollback failed"); throw new AggregateError([error, rollback], "Closure STAGE and rollback failed; client discarded"); }
   throw error;
  } finally { client.release(discard); }
 }
 private async write(client: PgSalesClient, input: HistoryTypedClosureStageInput): Promise<{ inserted: number; replayed: number }> {
  await client.query("/* history19-closure:lock */ SELECT naijue_erp.cutoff_import_lock()");
  const schema = (await client.query("/* history19-closure:schema */ SELECT array_agg(version ORDER BY version) versions FROM naijue_erp.schema_migration")).rows;
  must(schema.length === 1, "Single exact schema prefix required");
  assertHistoryPublicationSchema19(schema[0]!.versions);
  await assertNativeImportAccountingSchema19Guards(client);
  const rows = (await client.query(`/* history19-closure:batch */ SELECT id,source_name,source_hash,mapping_version,status,history_payload_hash,
    history_expected_counts=$2::jsonb exact_counts,EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED') published
    FROM naijue_erp.import_batch WHERE id=$1::uuid FOR UPDATE`, [input.batchId, JSON.stringify(input.plan.expectedCounts)])).rows;
  const b = rows[0], p = input.plan;
  must(rows.length === 1 && b?.source_name === input.fixedSourceNamespace && b.source_hash === p.selectionSha256 && b.mapping_version === "V2_HISTORY_NULLABLE_1" && (b.status === "STAGED" || b.status === "VALIDATING") && b.history_payload_hash === p.authorizedPayloadHash && b.exact_counts === true && b.published === false, "Exact selected unpublished namespace and metadata required");
  // Independent SQL scope locks, every field/coverage/root; absence cannot degrade to count equality.
  await client.query("/* history19-closure:readback */ SELECT naijue_erp.assert_history_typed_closure($1::uuid,$2::jsonb,$3::jsonb)", [input.batchId, JSON.stringify(p), JSON.stringify(input.documents)]);
  const manifest = { batch_id: input.batchId, validator_version: p.version, selection_sha256: p.selectionSha256, authorized_payload_hash: p.authorizedPayloadHash, source_manifest_sha256: p.sourceManifestSha256, typed_manifest_sha256: p.typedManifestSha256, document_manifest_sha256: p.documentManifestSha256, expected_counts: p.expectedCounts, source_entity_counts: p.sourceEntityCounts, document_count: p.documentCount };
  const previous = await this.manifest(client, input.batchId, manifest);
  if (previous.length) { must(previous.length === 1 && previous[0]!.exact === true, "Changed existing closure manifest refused"); await this.verifyDocuments(client, input); return { inserted: 0, replayed: 1 }; }
  const inserted = await client.query("/* history19-closure:insert */ INSERT INTO naijue_erp.import_history_closure_manifest SELECT (jsonb_populate_record(NULL::naijue_erp.import_history_closure_manifest,$1::jsonb)).* RETURNING batch_id", [JSON.stringify(manifest)]);
  must(inserted.rowCount === 1, "Exactly one new closure manifest required");
  for (const d of [...input.documents].sort((a, b) => Buffer.compare(Buffer.from(a.kind + "/" + a.headerId), Buffer.from(b.kind + "/" + b.headerId)))) {
   const row = { batch_id: input.batchId, document_kind: d.kind, source_key: d.sourceKey, header_source_row_id: d.headerSourceRowId, sales_header_id: d.kind === "SALES" ? d.headerId : null, transfer_header_id: d.kind === "TRANSFER" ? d.headerId : null, header_source_sha256: d.headerSourceSha256, line_count: d.lineCount, settlement_count: d.settlementCount, source_document_sha256: d.sourceDocumentSha256, typed_document_sha256: d.typedDocumentSha256 };
   const result = await client.query("/* history19-closure:document-insert */ INSERT INTO naijue_erp.import_history_document_manifest SELECT (jsonb_populate_record(NULL::naijue_erp.import_history_document_manifest,$1::jsonb)).* RETURNING header_source_row_id", [JSON.stringify(row)]); must(result.rowCount === 1, "Exactly one independently authorized document required");
  }
  const saved = await this.manifest(client, input.batchId, manifest); must(saved.length === 1 && saved[0]!.exact === true, "Complete inserted manifest readback required");
  await this.verifyDocuments(client, input);
  return { inserted: 1, replayed: 0 };
 }
 private async manifest(client: PgSalesClient, batchId: string, expected: object): Promise<Record<string, unknown>[]> {
  return (await client.query("/* history19-closure:manifest */ SELECT to_jsonb(m)=$2::jsonb exact FROM naijue_erp.import_history_closure_manifest m WHERE m.batch_id=$1::uuid FOR UPDATE", [batchId, JSON.stringify(expected)])).rows;
 }
 private async verifyDocuments(client: PgSalesClient, input: HistoryTypedClosureStageInput): Promise<void> {
  // Bidirectional full-row comparison: a same-count document substitution cannot pass.
  const result = (await client.query(`/* history19-closure:documents-exact */ WITH expected AS (
   SELECT x->>'kind' document_kind,x->>'sourceKey' source_key,x->>'headerSourceRowId' header_source_row_id,x->>'headerId' header_id,
    x->>'headerSourceSha256' header_source_sha256,(x->>'lineCount')::integer line_count,(x->>'settlementCount')::integer settlement_count,
    x->>'sourceDocumentSha256' source_document_sha256,x->>'typedDocumentSha256' typed_document_sha256 FROM jsonb_array_elements($2::jsonb) x),
   actual AS(SELECT document_kind,source_key,header_source_row_id::text,COALESCE(sales_header_id,transfer_header_id)::text header_id,header_source_sha256,line_count,settlement_count,source_document_sha256,typed_document_sha256 FROM naijue_erp.import_history_document_manifest WHERE batch_id=$1::uuid)
   SELECT NOT EXISTS((SELECT * FROM actual EXCEPT SELECT * FROM expected) UNION ALL(SELECT * FROM expected EXCEPT SELECT * FROM actual)) exact`, [input.batchId, JSON.stringify(input.documents)])).rows;
  must(result.length === 1 && result[0]!.exact === true, "Exact bidirectional whole document manifest required");
 }
}
