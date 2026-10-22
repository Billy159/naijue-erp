import { assertNativeImportAccountingGuards } from "./native-import-accounting-capability.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { assertReviewedNativeImportSchema } from "../../../packages/application/src/native-import-schema-contract.ts";
import { NATIVE_CATALOGUE_COLUMNS, NATIVE_CATALOGUE_IMPORT_VERSION, nativeCatalogueSourceEvidence,
  validatePreparedNativeCatalogueImportChunk } from "../../../packages/application/src/native-catalogue-import.ts";
import type { NativeCatalogueEntity, NativeCatalogueImportResult, NativeCatalogueImportStore, PreparedNativeCatalogueImportChunk,
  PreparedNativeCatalogueImportRow } from "../../../packages/application/src/native-catalogue-import.ts";
import type { JsonObject } from "../../../packages/application/src/history-storage-contract.ts";
import type { PgSalesClient, PgSalesPool } from "./sales-unit-of-work.ts";

const TABLES: Readonly<Record<NativeCatalogueEntity, string>> = { CATEGORY: "product_category", COLOR: "color", FIT: "fit", SIZE: "size",
  SIZE_GROUP: "size_group", SEASON: "season", SIZE_GROUP_MEMBER: "size_group_member" };
const TARGET_COLUMNS = ["category_id", "color_id", "fit_id", "size_id", "size_group_id", "season_id", "member_group_id", "member_size_id"] as const;
const TARGET_COLUMN: Readonly<Record<Exclude<NativeCatalogueEntity, "SIZE_GROUP_MEMBER">, typeof TARGET_COLUMNS[number]>> = {
  CATEGORY: "category_id", COLOR: "color_id", FIT: "fit_id", SIZE: "size_id", SIZE_GROUP: "size_group_id", SEASON: "season_id"
};
export function nativeCatalogueBindingEvidence(row: PreparedNativeCatalogueImportRow): JsonObject {
  const binding: JsonObject = { batch_id: row.source.batchId, entity_type: row.entity, source_key: row.source.sourceKey,
    source_row_id: row.source.id, native_snapshot: row.nativeSnapshot, evidence_fingerprint: row.fingerprint, validator_version: NATIVE_CATALOGUE_IMPORT_VERSION };
  for (const column of TARGET_COLUMNS) binding[column] = null;
  if (row.entity === "SIZE_GROUP_MEMBER") { binding.member_group_id = row.nativeSnapshot.size_group_id!; binding.member_size_id = row.nativeSnapshot.size_id!; }
  else binding[TARGET_COLUMN[row.entity]] = row.nativeSnapshot.id!;
  return binding;
}
/** Trusted internal schema14 adapter. STAGE authority is supplied at orchestration.
 * No connection by default, no DDL/source loader/authority implementation, no live
 * field relaxation, no SKU/stock writes, no publication or automatic retry. */
export class PostgresNativeCatalogueImportStore implements NativeCatalogueImportStore {
  private readonly pool: PgSalesPool;
  constructor(pool: PgSalesPool) { this.pool = pool; }
  async stage(input: PreparedNativeCatalogueImportChunk): Promise<NativeCatalogueImportResult> {
    const chunk = structuredClone(input); validatePreparedNativeCatalogueImportChunk(chunk);
    const client = await this.pool.connect(); let began = false, committing = false, discard: Error | undefined;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      const result = await this.write(client, chunk);
      committing = true; await client.query("COMMIT"); return result;
    } catch (error) {
      if (!began || committing) discard = error instanceof Error ? error : new Error("Native catalogue import outcome unknown");
      if (began && !committing) try { await client.query("ROLLBACK"); } catch (rollback) {
        discard = rollback instanceof Error ? rollback : new Error("Native catalogue rollback failed");
        throw new AggregateError([error, rollback], "Native catalogue import failed; discard connection");
      }
      throw error;
    } finally { client.release(discard); }
  }
  private async write(client: PgSalesClient, chunk: PreparedNativeCatalogueImportChunk): Promise<NativeCatalogueImportResult> {
    await client.query("/* native-catalogue-import:lock */ SELECT naijue_erp.cutoff_import_lock()");
    const schema = (await client.query(`/* native-catalogue-import:schema */ SELECT
      array_agg(version ORDER BY version) AS installed_versions FROM naijue_erp.schema_migration`)).rows;
    requireDomain(schema.length === 1, "NATIVE_CATALOGUE_SCHEMA_NOT_READY", "Exact reviewed native import schema prefix required");
    const reviewedSchema = assertReviewedNativeImportSchema(schema[0]!.installed_versions,
      { minimumVersion: 14, errorCode: "NATIVE_CATALOGUE_SCHEMA_NOT_READY" });
    if ((reviewedSchema.versions.length === 18 || reviewedSchema.versions.length === 19)) await assertNativeImportAccountingGuards(client);
    const batchRows = (await client.query(`/* native-catalogue-import:batch */ SELECT id,mapping_version,status,source_hash,source_name,
      EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED') AS already_published
      FROM naijue_erp.import_batch WHERE id=$1::uuid FOR UPDATE`, [chunk.batchId])).rows;
    const b = batchRows[0];
    requireDomain(batchRows.length === 1 && b?.id === chunk.batchId && b.mapping_version === chunk.mappingVersion
      && (b.status === "STAGED" || b.status === "VALIDATING") && b.source_hash === chunk.selection.selectionSha256
      && b.source_name === chunk.fixedSourceNamespace && b.already_published === false,
    "NATIVE_CATALOGUE_BATCH", "Exact selection/namespace in an open, unpublished batch required");
    const targetKey = (row: PreparedNativeCatalogueImportRow): string => `${row.entity}/${row.targetKey}`;
    const sorted = [...chunk.rows].sort((a, b) => `${TABLES[a.entity]}/${a.targetKey}`.localeCompare(`${TABLES[b.entity]}/${b.targetKey}`));
    const targets = new Map<string, { exists: boolean; currentMatchesCreation: boolean }>();
    // Lock stable native identities (and colliding unique-code candidates) before
    // consulting immutable evidence. Current field drift is NOT a replay decision.
    for (const row of sorted) {
      const member = row.entity === "SIZE_GROUP_MEMBER", uniqueCode = ["COLOR", "FIT", "SIZE_GROUP", "SEASON"].includes(row.entity);
      const predicate = member ? "n.size_group_id=$1::uuid AND n.size_id=$3::uuid" : `n.id=$1::uuid${uniqueCode ? " OR n.code=$3" : ""}`;
      const n = row.nativeSnapshot;
      const actual = (await client.query(`/* native-catalogue-import:target:${row.entity} */ SELECT
        ${member ? "n.size_group_id,n.size_id" : "n.id"}, to_jsonb(n)=$2::jsonb AS native_equal
        FROM naijue_erp.${TABLES[row.entity]} n WHERE ${predicate} ORDER BY ${member ? "n.size_group_id,n.size_id" : "n.id"} FOR UPDATE`,
      member || uniqueCode ? [member ? n.size_group_id : n.id, JSON.stringify(n), member ? n.size_id : n.code] : [n.id, JSON.stringify(n)])).rows;
      const own = actual.filter(a => member ? a.size_group_id === n.size_group_id && a.size_id === n.size_id : a.id === n.id);
      requireDomain(own.length <= 1 && (own.length === 1 || actual.length === 0), "NATIVE_CATALOGUE_TARGET_CONFLICT",
        "An absent native identity cannot acquire a competing unique code; never adopt a different target");
      targets.set(targetKey(row), { exists: own.length === 1, currentMatchesCreation: own.length === 0 || own[0]!.native_equal === true });
    }
    const byTarget = new Map(chunk.rows.filter(r => r.entity !== "SIZE_GROUP_MEMBER").map(r => [targetKey(r), r]));
    const refs = new Map<string, { entity: "CATEGORY" | "SIZE" | "SIZE_GROUP"; sourceKey: string; nativeId: string; nativeSnapshot: JsonObject }>();
    for (const row of sorted) for (const ref of Object.values(row.references)) refs.set(`${ref.entity}/${ref.nativeId}`, ref);
    const referenceCurrentMatches = new Map<string, boolean>();
    for (const [key, ref] of [...refs.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (byTarget.has(key)) { referenceCurrentMatches.set(key, targets.get(key)!.currentMatchesCreation); continue; }
      const actual = (await client.query(`/* native-catalogue-import:reference-target */ SELECT to_jsonb(n)=$2::jsonb AS native_equal
        FROM naijue_erp.${TABLES[ref.entity]} n WHERE id=$1::uuid FOR SHARE`, [ref.nativeId, JSON.stringify(ref.nativeSnapshot)])).rows;
      requireDomain(actual.length === 1, "NATIVE_CATALOGUE_REFERENCE_STALE", "Locked native dependency identity must exist; never repair an orphan");
      referenceCurrentMatches.set(key, actual[0]!.native_equal === true);
    }
    // All pre-existing native locks are held before any source/binding access.
    // Absent-target races remain guarded by native uniqueness and whole-xact rollback.
    const rank = (r: PreparedNativeCatalogueImportRow): number => r.entity === "CATEGORY" ? (r.nativeSnapshot.parent_id === null ? 0 : 1) : r.entity === "SIZE_GROUP_MEMBER" ? 3 : 2;
    const ordered = [...sorted].sort((a, b) => rank(a) - rank(b) || `${a.entity}/${a.targetKey}`.localeCompare(`${b.entity}/${b.targetKey}`));
    for (const [key, ref] of refs) if (!byTarget.has(key)) {
      const existing = (await client.query(`/* native-catalogue-import:reference-binding */ SELECT native_snapshot=$4::jsonb AS native_equal
        FROM naijue_erp.import_native_catalogue_binding WHERE batch_id=$1::uuid AND entity_type=$2 AND source_key=$3 FOR SHARE`,
      [chunk.batchId, ref.entity, ref.sourceKey, JSON.stringify(ref.nativeSnapshot)])).rows;
      requireDomain(existing.length === 1 && existing[0]!.native_equal === true, "NATIVE_CATALOGUE_REFERENCE_UNBOUND",
        "Exact immutable same-batch dependency creation binding required; current maintenance cannot rewrite it");
    }
    const newRows: PreparedNativeCatalogueImportRow[] = []; let replayed = 0;
    // Decide solely from exact immutable operation evidence, after stable-key locks.
    // No native or evidence INSERT occurs until every row is classified.
    for (const row of ordered) {
      const s = row.source, evidence = nativeCatalogueSourceEvidence(row), binding = nativeCatalogueBindingEvidence(row);
      const isMember = row.entity === "SIZE_GROUP_MEMBER";
      const targetPredicate = isMember ? "x.member_group_id=$5::uuid AND x.member_size_id=$6::uuid" : `x.${TARGET_COLUMN[row.entity]}=$5::uuid`;
      const previousBindings = (await client.query(`/* native-catalogue-import:binding-replay */ SELECT to_jsonb(x)=$4::jsonb AS binding_equal
        FROM naijue_erp.import_native_catalogue_binding x WHERE x.batch_id=$1::uuid AND ((x.entity_type=$2 AND x.source_key=$3)
          OR x.source_row_id=$${isMember ? 7 : 6}::uuid OR (${targetPredicate})) ORDER BY x.entity_type,x.source_key LIMIT 2 FOR SHARE`,
      [chunk.batchId, row.entity, s.sourceKey, JSON.stringify(binding), ...(isMember ? [row.nativeSnapshot.size_group_id, row.nativeSnapshot.size_id] : [row.nativeSnapshot.id]), s.id])).rows;
      const previousSources = (await client.query(`/* native-catalogue-import:source-replay */ SELECT
        (to_jsonb(s)||jsonb_build_object('row_no',s.row_no::text))=$2::jsonb AS source_equal FROM naijue_erp.import_source_row s
        WHERE s.id=$1::uuid OR (s.batch_id=$3::uuid AND ((s.entity_type=$4 AND s.source_key=$5)
          OR (s.source_file_sha256=$6 AND s.sheet=$7 AND s.row_no=$8::bigint))) ORDER BY s.id LIMIT 2 FOR SHARE`,
      [s.id, JSON.stringify(evidence), chunk.batchId, row.entity, s.sourceKey, s.sourceFileSha256, s.sheet, s.rowNo])).rows;
      const target = targets.get(targetKey(row))!;
      if (previousBindings.length > 0 || previousSources.length > 0) {
        requireDomain(target.exists && previousBindings.length === 1 && previousBindings[0]!.binding_equal === true
          && previousSources.length === 1 && previousSources[0]!.source_equal === true, "NATIVE_CATALOGUE_REPLAY_CONFLICT",
        "Exact immutable original source + typed creation binding must replay with its stable native identity; no orphan/partial repair");
        replayed++; continue;
      }
      requireDomain(!target.exists, "NATIVE_CATALOGUE_UNPROVEN_EXISTING_TARGET", "Existing native identity without the exact operation proof cannot be adopted, even if current fields match");
      newRows.push(row);
    }
    // First creation (unlike operation replay) certifies current dependencies.
    // A maintained dependency needs a separately reviewed current mapping before
    // it can authorize a NEW child/member; old operation proof is not that grant.
    for (const row of newRows) for (const ref of Object.values(row.references)) {
      requireDomain(referenceCurrentMatches.get(`${ref.entity}/${ref.nativeId}`) === true, "NATIVE_CATALOGUE_REFERENCE_STALE",
        "First creation requires the exact locked current dependency snapshot; replay authority cannot authorize a new binding");
    }
    // FK order is topological. All native INSERTs precede every new evidence INSERT.
    for (const row of newRows) {
      const columns = NATIVE_CATALOGUE_COLUMNS[row.entity];
      const result = await client.query(`/* native-catalogue-import:create:${row.entity} */ INSERT INTO naijue_erp.${TABLES[row.entity]} (${columns.join(",")})
        VALUES (${columns.map((c, i) => `$${i + 1}${c === "id" || c.endsWith("_id") ? "::uuid" : ""}`).join(",")}) RETURNING to_jsonb(${TABLES[row.entity]}) AS native_snapshot`, columns.map(c => row.nativeSnapshot[c]));
      requireDomain(result.rowCount === 1, "NATIVE_CATALOGUE_CREATE_FAILED", "Exactly one actual native dictionary row required");
    }
    for (const row of newRows) if (row.entity === "SIZE_GROUP") {
      const members = (await client.query(`/* native-catalogue-import:group-member */ SELECT m.size_id FROM naijue_erp.size_group_member m
        JOIN naijue_erp.size z ON z.id=m.size_id WHERE m.size_group_id=$1::uuid ORDER BY m.size_id LIMIT 1 FOR SHARE OF m,z`, [row.nativeSnapshot.id])).rows;
      requireDomain(members.length === 1, "NATIVE_CATALOGUE_EMPTY_GROUP", "A newly created group needs an actual member in this transaction; operation replay is not current-catalogue reconciliation");
    }
    for (const row of newRows) {
      const s = row.source, evidence = nativeCatalogueSourceEvidence(row), binding = nativeCatalogueBindingEvidence(row);
      const sourceResult = await client.query(`/* native-catalogue-import:source-create */ INSERT INTO naijue_erp.import_source_row
        (id,batch_id,entity_type,source_key,file_ref,sheet,row_no,source_file_sha256,row_sha256,raw_fields,normalized_fields,field_provenance)
        VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7::bigint,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb) RETURNING id`,
      [s.id, chunk.batchId, row.entity, s.sourceKey, s.fileRef, s.sheet, s.rowNo, s.sourceFileSha256, s.rowSha256,
        JSON.stringify(s.rawFields), JSON.stringify(s.normalizedFields), JSON.stringify(evidence.field_provenance)]);
      requireDomain(sourceResult.rowCount === 1, "NATIVE_CATALOGUE_SOURCE_FAILED", "Exactly one immutable source occurrence required");
      const columns = Object.keys(binding);
      const bindingResult = await client.query(`/* native-catalogue-import:binding-create */ INSERT INTO naijue_erp.import_native_catalogue_binding (${columns.join(",")})
        VALUES (${columns.map((c, i) => `$${i + 1}${c.endsWith("_id") ? "::uuid" : c === "native_snapshot" ? "::jsonb" : ""}`).join(",")}) RETURNING source_row_id`,
      columns.map(c => c === "native_snapshot" ? JSON.stringify(binding[c]) : binding[c]));
      requireDomain(bindingResult.rowCount === 1, "NATIVE_CATALOGUE_BINDING_FAILED", "Exactly one typed source/native creation binding required");
    }
    return { inserted: newRows.length, replayed, nativeCurrentMatchesCreation: [...targets.values()].every(t => t.currentMatchesCreation)
      && [...referenceCurrentMatches.values()].every(Boolean) };
  }
}
