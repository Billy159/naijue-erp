import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { prepareNativeCatalogueImportChunk, stageNativeCatalogueImportChunk, nativeCatalogueSourceEvidence } from "../packages/application/src/native-catalogue-import.ts";
import type { NativeCatalogueEntity, NativeCatalogueImportChunk, NativeCatalogueImportRow, NativeCatalogueReference, PreparedNativeCatalogueImportRow } from "../packages/application/src/native-catalogue-import.ts";
import { PostgresNativeCatalogueImportStore, nativeCatalogueBindingEvidence } from "../adapters/postgres/src/native-catalogue-import.ts";
import type { JsonObject } from "../packages/application/src/history-storage-contract.ts";
import { requestHash } from "../packages/application/src/request-hash.ts";
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const H = "a".repeat(64), A = "b".repeat(64);
function input(): NativeCatalogueImportChunk {
  const rows: NativeCatalogueImportRow[] = [];
  const add = (entity: NativeCatalogueEntity, n: number, values: JsonObject, references: Record<string, NativeCatalogueReference> = {}) => {
    const raw = { sourceId: `SYNTHETIC ${entity} ${n}`, ...values };
    const source = { id: id(100 + n), batchId: id(1), entityType: entity, sourceKey: raw.sourceId, fileRef: "SYNTHETIC-original-dictionary.json", sheet: `SYNTHETIC /${entity}`,
      rowNo: String(n), sourceFileSha256: H, rowSha256: String(n % 10).repeat(64), rawFields: raw, normalizedFields: structuredClone(raw),
      fieldProvenance: { schema_version: 1, fields: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, { origin: "ORIGINAL", reason: "SYNTHETIC ORIGINAL OCCURRENCE", raw: v }])) } };
    const decisions = Object.fromEntries(Object.keys(values).map(k => [k, { kind: "SOURCE_FIELD" as const, field: k }]));
    const row: NativeCatalogueImportRow = { source, sourceKeyField: "sourceId", nativeId: entity === "SIZE_GROUP_MEMBER" ? null : id(n), decisions, references };
    rows.push(row); return row;
  };
  const root = add("CATEGORY", 10, { name: "SYNTHETIC ROOT", display_order: "0" });
  add("CATEGORY", 11, { name: "SYNTHETIC LEAF", display_order: "1" }, { parent_id: { entity: "CATEGORY", sourceKey: root.source.sourceKey, nativeId: id(10),
    nativeSnapshot: { id: id(10), parent_id: null, name: "SYNTHETIC ROOT", display_order: 0, version: 1 } } });
  add("COLOR", 12, { code: "SYNTHETIC-001", name: "SYNTHETIC COLOR", enabled: false });
  add("FIT", 13, { code: "A", name: "SYNTHETIC FIT", enabled: true });
  const size = add("SIZE", 14, { code: null, name: "SYNTHETIC SIZE" });
  const group = add("SIZE_GROUP", 15, { code: "SYNTHETIC-GROUP", name: "SYNTHETIC GROUP" });
  add("SEASON", 16, { code: "SYNTHETIC-SEASON", name: "SYNTHETIC SEASON", display_order: "3" });
  add("SIZE_GROUP_MEMBER", 17, { display_order: "0" }, {
    size_group_id: { entity: "SIZE_GROUP", sourceKey: group.source.sourceKey, nativeId: id(15), nativeSnapshot: { id: id(15), code: "SYNTHETIC-GROUP", name: "SYNTHETIC GROUP" } },
    size_id: { entity: "SIZE", sourceKey: size.source.sourceKey, nativeId: id(14), nativeSnapshot: { id: id(14), code: null, name: "SYNTHETIC SIZE" } }
  });
  return { batchId: id(1), fixedSourceNamespace: "SYNTHETIC NAMESPACE", selection: { source: "REVIEWED_DICTIONARY_OCCURRENCES_V1", baseManifestSha256: H, selectionSha256: H, approvalSha256: A, occurrenceContractSha256: H }, rows };
}
const key = (entity: string, n: JsonObject) => `${entity}/${entity === "SIZE_GROUP_MEMBER" ? `${n.size_group_id}/${n.size_id}` : n.id}`;
test("catalogue shares exact finite schema14–17 contracts and refuses missing, duplicate or future19 schemas before targets", async () => {
  const prefix = Array.from({ length: 14 }, (_, i) => i + 1), prepared = prepareNativeCatalogueImportChunk(input());
  for (const schemaVersions of [prefix, [...prefix, 15], [...prefix, 15, 16], [...prefix,15,16,17]]) {
    const p = protocol({ schemaVersions });
    assert.equal((await p.store.stage(prepared)).inserted, 8);
  }
  for (const schemaVersions of [[], prefix.slice(0, -1), [...prefix, 14], [...prefix, 15, 16, 17,18,19], [...prefix.slice(0, 10), ...prefix.slice(11)]]) {
    const p = protocol({ schemaVersions });
    await assert.rejects(p.store.stage(prepared), { code: "NATIVE_CATALOGUE_SCHEMA_NOT_READY" });
    assert.ok(!p.calls.some(c => /:target:|INSERT INTO/.test(c.sql)));
  }
});
type State = { native: Map<string, JsonObject>; sources: Map<string, JsonObject>; bindings: Map<string, JsonObject> };
/** Transactional SQL protocol fake. NOT evidence for actual PostgreSQL triggers/locks/isolation. */
function protocol(options: { failBindingAt?: number; commitUnknown?: boolean; wrongBatch?: boolean; missingSchema?: boolean; schemaVersions?: readonly number[]; emptyGroup?: boolean; rollbackFails?: boolean; commitUncommitted?: boolean } = {}) {
  let state: State = { native: new Map(), sources: new Map(), bindings: new Map() }, draft = structuredClone(state);
  let connects = 0, nativeWrites = 0, sourceWrites = 0, bindingWrites = 0, discarded: Error | boolean | undefined, unknown = options.commitUnknown;
  const calls: { sql: string; values: unknown[] }[] = [];
  const result = (rows: Record<string, unknown>[]) => ({ rows, rowCount: rows.length });
  const client = { async query(sql: string, values: unknown[] = []) {
    calls.push({ sql, values });
    const parameters = [...sql.matchAll(/\$(\d+)/g)].map(m => Number(m[1]));
    if (parameters.length) { assert.equal(Math.max(...parameters), values.length, "SQL bind count must match exactly");
      assert.equal(new Set(parameters).size, values.length, "SQL bind parameters cannot have untyped holes"); }
    if (sql.startsWith("BEGIN")) { draft = structuredClone(state); return result([]); }
    if (sql === "ROLLBACK") { if (options.rollbackFails) throw Error("SYNTHETIC rollback failure"); draft = structuredClone(state); return result([]); }
    if (sql === "COMMIT") { if (unknown) { unknown = false; if (!options.commitUncommitted) state = structuredClone(draft); throw Error("SYNTHETIC commit ack lost"); } state = structuredClone(draft); return result([]); }
    if (sql.includes("native-catalogue-import:schema")) return result([{ installed_versions: options.missingSchema ? [] : options.schemaVersions ?? Array.from({ length: 14 }, (_, i) => i + 1) }]);
    if (sql.includes("native-catalogue-import:batch")) return result([{ id: id(1), mapping_version: "V2_HISTORY_NULLABLE_1", status: "STAGED", source_hash: options.wrongBatch ? "0".repeat(64) : H, source_name: "SYNTHETIC NAMESPACE", already_published: false }]);
    if (sql.includes("native-catalogue-import:target:")) {
      const entity = sql.match(/target:([A-Z_]+)/)![1]!, n = JSON.parse(values[1] as string);
      const targets = [...draft.native].filter(([k, actual]) => k.startsWith(`${entity}/`) && (key(entity, actual) === key(entity, n)
        || (["COLOR", "FIT", "SIZE_GROUP", "SEASON"].includes(entity) && actual.code === values[2])));
      return result(targets.map(([, actual]) => ({ ...(entity === "SIZE_GROUP_MEMBER" ? { size_group_id: actual.size_group_id, size_id: actual.size_id } : { id: actual.id }), native_equal: requestHash(actual) === requestHash(n) })));
    }
    if (sql.includes("native-catalogue-import:reference-target")) {
      const n = JSON.parse(values[1] as string), actual = [...draft.native.values()].find(n => n.id === values[0]);
      return result(actual ? [{ native_equal: requestHash(actual) === requestHash(n) }] : []);
    }
    if (sql.includes("native-catalogue-import:create:")) {
      const entity = sql.match(/create:([A-Z_]+)/)![1]!, columns = sql.match(/\(([^)]+)\)\s*VALUES/)![1]!.split(",");
      const n = Object.fromEntries(columns.map((c, i) => [c, values[i]])) as JsonObject;
      assert.equal(draft.native.has(key(entity, n)), false); draft.native.set(key(entity, n), n); nativeWrites++; return result([{ native_snapshot: n }]);
    }
    if (sql.includes("native-catalogue-import:group-member")) return result(options.emptyGroup ? [] : [...draft.native].filter(([k, n]) => k.startsWith("SIZE_GROUP_MEMBER/") && n.size_group_id === values[0]).slice(0, 1).map(([, n]) => ({ size_id: n.size_id })));
    if (sql.includes("native-catalogue-import:reference-binding")) return result([...draft.bindings.values()].filter(x => x.batch_id === values[0] && x.entity_type === values[1] && x.source_key === values[2]).map(x => ({ native_equal: requestHash(x.native_snapshot) === requestHash(JSON.parse(values[3] as string)) })));
    if (sql.includes("native-catalogue-import:binding-replay")) {
      const wanted = JSON.parse(values[3] as string);
      return result([...draft.bindings.values()].filter(x => x.batch_id === values[0] && ((x.entity_type === values[1] && x.source_key === values[2]) || x.source_row_id === values[values[1] === "SIZE_GROUP_MEMBER" ? 6 : 5]
        || (values[1] === "SIZE_GROUP_MEMBER" ? x.member_group_id === values[4] && x.member_size_id === values[5] : x.native_snapshot && (x.native_snapshot as JsonObject).id === values[4])))
        .map(x => ({ binding_equal: requestHash(x) === requestHash(wanted) })));
    }
    if (sql.includes("native-catalogue-import:source-replay")) return result([...draft.sources.values()].filter(x => x.id === values[0] || (x.batch_id === values[2] && ((x.entity_type === values[3] && x.source_key === values[4])
      || (x.source_file_sha256 === values[5] && x.sheet === values[6] && x.row_no === values[7])))).map(x => ({ source_equal: requestHash(x) === requestHash(JSON.parse(values[1] as string)) })));
    if (sql.includes("native-catalogue-import:source-create")) {
      const columns = ["id", "batch_id", "entity_type", "source_key", "file_ref", "sheet", "row_no", "source_file_sha256", "row_sha256", "raw_fields", "normalized_fields", "field_provenance"];
      const s = Object.fromEntries(columns.map((c, i) => [c, i >= 9 ? JSON.parse(values[i] as string) : values[i]])) as JsonObject;
      assert.equal(draft.sources.has(s.id as string), false); draft.sources.set(s.id as string, s); sourceWrites++; return result([{ id: s.id }]);
    }
    if (sql.includes("native-catalogue-import:binding-create")) {
      bindingWrites++; if (bindingWrites === options.failBindingAt) throw Error("SYNTHETIC binding failure");
      const columns = sql.match(/\(([^)]+)\)\s*VALUES/)![1]!.split(",");
      const b = Object.fromEntries(columns.map((c, i) => [c, c === "native_snapshot" ? JSON.parse(values[i] as string) : values[i]])) as JsonObject;
      assert.ok(draft.sources.has(b.source_row_id as string)); assert.ok(draft.native.has(key(b.entity_type as string, b.native_snapshot as JsonObject)));
      draft.bindings.set(`${b.entity_type}/${b.source_key}`, b); return result([{ source_row_id: b.source_row_id }]);
    }
    if (sql.includes("cutoff_import_lock")) return result([]);
    throw Error(`Unexpected synthetic SQL: ${sql}`);
  }, release(error?: Error | boolean) { discarded = error; } };
  const store = new PostgresNativeCatalogueImportStore({ async connect() { connects++; return client; } });
  return { store, calls, state: () => state, connects: () => connects, writes: () => [nativeWrites, sourceWrites, bindingWrites], discarded: () => discarded,
    seedNative(row: PreparedNativeCatalogueImportRow, snapshot = row.nativeSnapshot) { state.native.set(key(row.entity, snapshot), structuredClone(snapshot)); },
    seedSource(row: PreparedNativeCatalogueImportRow) { state.sources.set(row.source.id, nativeCatalogueSourceEvidence(row)); },
    seedBinding(row: PreparedNativeCatalogueImportRow) { state.bindings.set(`${row.entity}/${row.source.sourceKey}`, nativeCatalogueBindingEvidence(row)); } };
}
test("catalogue default dry-run is connection-free, stage requires independent exact source/decision authority", async () => {
  const h = protocol(); assert.deepEqual(await stageNativeCatalogueImportChunk(input(), { store: h.store }), { mode: "DRY_RUN", rows: 8, inserted: 0, replayed: 0, published: false, importReady: false });
  await assert.rejects(stageNativeCatalogueImportChunk(input(), { mode: "STAGE", store: h.store }), { code: "NATIVE_CATALOGUE_AUTHORIZATION_REQUIRED" });
  await assert.rejects(stageNativeCatalogueImportChunk(input(), { mode: "STAGE", store: h.store, async authorize() { throw Error("SYNTHETIC DENIAL"); } }), /DENIAL/); assert.equal(h.connects(), 0);
});
test("catalogue classifies exact evidence only after all stable native locks, then creates native rows before new source/binding writes", async () => {
  const h = protocol(), c = input();
  const result = await stageNativeCatalogueImportChunk(c, { mode: "STAGE", store: h.store, async authorize(copy) { (copy.rows[0]!.nativeSnapshot as JsonObject).name = "CALLBACK MUTATION CANNOT REWRITE STORAGE"; } });
  assert.equal(result.inserted, 8); assert.equal(h.state().native.size, 8); assert.equal(h.state().sources.size, 8); assert.equal(h.state().bindings.size, 8);
  const sql = h.calls.map(c => c.sql), firstNative = sql.findIndex(s => s.includes("target:")), batch = sql.findIndex(s => s.includes(":batch"));
  const lastNativeLock = sql.findLastIndex(s => s.includes(":target:") || s.includes(":reference-target"));
  const firstSource = sql.findIndex(s => s.includes("binding-replay") || s.includes("source-replay"));
  const lastClassification = sql.findLastIndex(s => s.includes("source-replay")), firstCreate = sql.findIndex(s => s.includes(":create:"));
  const lastCreate = sql.findLastIndex(s => s.includes(":create:")), firstEvidenceInsert = sql.findIndex(s => s.includes(":source-create"));
  assert.ok(batch < firstNative && lastNativeLock < firstSource && lastClassification < firstCreate && lastCreate < firstEvidenceInsert); assert.equal(sql.at(-1), "COMMIT"); assert.match(sql[1]!, /cutoff_import_lock/);
  assert.ok(!sql.some(s => /INSERT INTO naijue_erp\.(product|sku|inventory_ledger|sku_barcode)\b|UPDATE |DELETE /.test(s)));
  assert.equal(h.state().native.get(`SIZE/${id(14)}`)!.code, null); assert.equal(h.state().native.get(`COLOR/${id(12)}`)!.enabled, false);
  assert.equal(h.state().native.get(`CATEGORY/${id(10)}`)!.name, "SYNTHETIC ROOT");
});
test("catalogue exact immutable three-way replay tolerates current maintenance, while partial/orphan evidence cannot authorize adoption", async () => {
  const c = input(), p = prepareNativeCatalogueImportChunk(c), h = protocol(); await h.store.stage(p);
  assert.deepEqual(await h.store.stage(p), { inserted: 0, replayed: 8, nativeCurrentMatchesCreation: true }); assert.deepEqual(h.writes(), [8, 8, 8]);
  const one = { ...c, rows: c.rows.filter(r => r.source.entityType === "SIZE") }, r = prepareNativeCatalogueImportChunk(one).rows[0]!;
  for (const seed of ["native", "source", "binding", "source+binding"] as const) {
    const f = protocol(); if (seed === "native") f.seedNative(r); if (seed.includes("source")) f.seedSource(r); if (seed.includes("binding")) f.seedBinding(r);
    await assert.rejects(f.store.stage(prepareNativeCatalogueImportChunk(one))); assert.equal(f.state().native.size, seed === "native" ? 1 : 0);
  }
  const drift = protocol(); drift.seedNative(r, { ...r.nativeSnapshot, name: "SYNTHETIC DRIFT" }); drift.seedSource(r); drift.seedBinding(r);
  const before = structuredClone(drift.state());
  assert.deepEqual(await drift.store.stage(prepareNativeCatalogueImportChunk(one)), { inserted: 0, replayed: 1, nativeCurrentMatchesCreation: false });
  assert.deepEqual(drift.state(), before); assert.deepEqual(drift.writes(), [0, 0, 0]);
  for (const incomplete of ["none", "source", "binding"] as const) {
    const f = protocol(); f.seedNative(r, { ...r.nativeSnapshot, name: "SYNTHETIC MAINTAINED" });
    if (incomplete === "source") f.seedSource(r); if (incomplete === "binding") f.seedBinding(r);
    await assert.rejects(f.store.stage(prepareNativeCatalogueImportChunk(one)), { code: incomplete === "none" ? "NATIVE_CATALOGUE_UNPROVEN_EXISTING_TARGET" : "NATIVE_CATALOGUE_REPLAY_CONFLICT" });
    assert.deepEqual(f.writes(), [0, 0, 0]);
  }
  const changed = structuredClone(c); (changed.rows[0]!.source.rawFields as JsonObject).extra = "UNAPPROVED";
  await assert.rejects(stageNativeCatalogueImportChunk(changed, { mode: "STAGE", store: h.store, async authorize() {} }));
});
test("every maintained current field may differ on exact operation replay; immutable creation-decision drift still fails", async () => {
  const p = prepareNativeCatalogueImportChunk(input());
  for (const row of p.rows) for (const column of Object.keys(row.nativeSnapshot)) {
    if (column === "id" || column === "size_group_id" || column === "size_id" || (column === "parent_id" && row.nativeSnapshot.parent_id === null)) continue;
    const h = protocol(), changed = structuredClone(row.nativeSnapshot), original = changed[column];
    changed[column] = column === "parent_id" ? id(999) : row.entity === "FIT" && column === "code" ? "B"
      : typeof original === "boolean" ? !original : typeof original === "number" ? original + 1 : "SYNTHETIC FIELD DRIFT";
    for (const originalRow of p.rows) { h.seedNative(originalRow); h.seedSource(originalRow); h.seedBinding(originalRow); }
    if (column === "parent_id") h.seedNative(p.rows[0]!, { id: id(999), parent_id: null, name: "SYNTHETIC OTHER ROOT", display_order: 99, version: 1 });
    h.seedNative(row, changed); const before = structuredClone(h.state());
    assert.deepEqual(await h.store.stage(p), { inserted: 0, replayed: 8, nativeCurrentMatchesCreation: false });
    assert.deepEqual(h.state(), before); assert.deepEqual(h.writes(), [0, 0, 0]);
  }
  const c = input(), single = { ...c, rows: [c.rows[4]!] }, h = protocol(); await h.store.stage(prepareNativeCatalogueImportChunk(single));
  (single.rows[0]!.decisions as Record<string, unknown>).name = { kind: "REVIEWED_VALUE", value: "SYNTHETIC SIZE", ruleId: "SYNTHETIC CHANGED DECISION",
    evidenceRef: "SYNTHETIC NEW AUTHORITY", approvalSha256: A, reason: "SYNTHETIC changed creation decision even with same native value", sourceFields: ["name"] };
  await assert.rejects(h.store.stage(prepareNativeCatalogueImportChunk(single)), { code: "NATIVE_CATALOGUE_REPLAY_CONFLICT" });
  assert.deepEqual(h.writes(), [1, 1, 1]);
});
test("external dependencies require both exact locked native snapshots and same-batch source bindings", async () => {
  const c = input(), all = prepareNativeCatalogueImportChunk(c), root = all.rows[0]!, child = { ...c, rows: [c.rows[1]!] };
  const missing = protocol(); await assert.rejects(missing.store.stage(prepareNativeCatalogueImportChunk(child)), { code: "NATIVE_CATALOGUE_REFERENCE_STALE" });
  const unbound = protocol(); unbound.seedNative(root); await assert.rejects(unbound.store.stage(prepareNativeCatalogueImportChunk(child)), { code: "NATIVE_CATALOGUE_REFERENCE_UNBOUND" });
  assert.equal(unbound.state().native.size, 1); assert.equal(unbound.state().sources.size, 0);
  const valid = protocol(); valid.seedNative(root); valid.seedSource(root); valid.seedBinding(root);
  assert.deepEqual(await valid.store.stage(prepareNativeCatalogueImportChunk(child)), { inserted: 1, replayed: 0, nativeCurrentMatchesCreation: true });
  const positions = valid.calls.map(c => c.sql), native = positions.findLastIndex(s => s.includes(":target:") || s.includes(":reference-target")), proof = positions.findIndex(s => s.includes(":reference-binding"));
  assert.ok(native < proof);
  valid.seedNative(root, { ...root.nativeSnapshot, name: "SYNTHETIC MAINTAINED PARENT", version: 2 });
  const childRow = prepareNativeCatalogueImportChunk(child).rows[0]!;
  valid.seedNative(childRow, { ...childRow.nativeSnapshot, name: "SYNTHETIC MAINTAINED CHILD", version: 2 });
  const before = structuredClone(valid.state()), writes = valid.writes();
  assert.deepEqual(await valid.store.stage(prepareNativeCatalogueImportChunk(child)), { inserted: 0, replayed: 1, nativeCurrentMatchesCreation: false });
  assert.deepEqual(valid.state(), before); assert.deepEqual(valid.writes(), writes);
  // The very same old dependency snapshot must NOT authorize a new child/binding.
  const staleFirst = protocol(); staleFirst.seedNative(root, { ...root.nativeSnapshot, name: "SYNTHETIC MAINTAINED PARENT", version: 2 });
  staleFirst.seedSource(root); staleFirst.seedBinding(root);
  await assert.rejects(staleFirst.store.stage(prepareNativeCatalogueImportChunk(child)), { code: "NATIVE_CATALOGUE_REFERENCE_STALE" });
  assert.deepEqual(staleFirst.writes(), [0, 0, 0]);
  const mixed = { ...c, rows: [c.rows[0]!, c.rows[1]!] };
  await assert.rejects(staleFirst.store.stage(prepareNativeCatalogueImportChunk(mixed)), { code: "NATIVE_CATALOGUE_REFERENCE_STALE" });
  assert.deepEqual(staleFirst.writes(), [0, 0, 0]);
});
test("stable native ID wins on replay after its original unique code was legitimately reused; first creation cannot steal that code", async () => {
  const c = input(), one = { ...c, rows: [c.rows[2]!] }, r = prepareNativeCatalogueImportChunk(one).rows[0]!, h = protocol();
  await h.store.stage(prepareNativeCatalogueImportChunk(one));
  h.seedNative(r, { ...r.nativeSnapshot, code: "SYNTHETIC MAINTAINED CODE", name: "SYNTHETIC MAINTAINED", version: 2 });
  h.seedNative(r, { ...r.nativeSnapshot, id: id(90), name: "SYNTHETIC OTHER NEW COLOR" });
  const before = structuredClone(h.state()), writes = h.writes();
  assert.deepEqual(await h.store.stage(prepareNativeCatalogueImportChunk(one)), { inserted: 0, replayed: 1, nativeCurrentMatchesCreation: false });
  assert.deepEqual(h.state(), before); assert.deepEqual(h.writes(), writes);
  const first = protocol(); first.seedNative(r, { ...r.nativeSnapshot, id: id(90) });
  await assert.rejects(first.store.stage(prepareNativeCatalogueImportChunk(one)), { code: "NATIVE_CATALOGUE_TARGET_CONFLICT" });
  assert.deepEqual(first.writes(), [0, 0, 0]);
});
test("catalogue rejects invented enablement/order/code, unknown provenance, unsupported source entities, identities and category reclassification", () => {
  const mutations: ((c: NativeCatalogueImportChunk) => void)[] = [
    c => { delete (c.rows[2]!.decisions as Record<string, unknown>).enabled; },
    c => { (c.rows[2]!.decisions as Record<string, unknown>).enabled = { kind: "SOURCE_FIELD", field: "missing-original-active" }; },
    c => { (c.rows[0]!.decisions as Record<string, unknown>).display_order = { kind: "SOURCE_FIELD", field: "missing-original-order" }; },
    c => { (c.rows[3]!.source as { entityType: string }).entityType = "SKU"; },
    c => { (c.rows[0]!.source.fieldProvenance.fields as JsonObject).name = { origin: "UNKNOWN", raw: "SYNTHETIC ROOT", reason: "UNKNOWN" }; },
    c => { (c.rows[0]!.source.rawFields as JsonObject).sourceId = "WRONG ORIGINAL ID"; },
    c => { (c.rows[3]!.source.rawFields as JsonObject).code = "AA"; (c.rows[3]!.source.normalizedFields as JsonObject).code = "AA"; (c.rows[3]!.source.fieldProvenance.fields as JsonObject).code = { origin: "ORIGINAL", reason: "SYNTHETIC", raw: "AA" }; },
    c => { (c.rows[1]!.references.parent_id!.nativeSnapshot as JsonObject).parent_id = id(99); },
    c => { (c.rows[7] as { references: Record<string, NativeCatalogueReference> }).references = {}; },
    c => { (c.rows[7]!.references.size_id!.nativeSnapshot as JsonObject).name = "UNAPPROVED RECLASSIFICATION"; }
  ];
  for (const mutate of mutations) { const c = input(); mutate(c); assert.throws(() => prepareNativeCatalogueImportChunk(c)); }
});
test("new native property decisions remain explicit reviewed derivation with original inputs; authority approval digest must match", async () => {
  const c = input(), row = c.rows[5]!;
  (row.decisions as Record<string, unknown>).code = { kind: "REVIEWED_VALUE", value: "SYNTHETIC-NEW-CODE", ruleId: "SYNTHETIC_NEW_DICTIONARY_CODE_V1",
    evidenceRef: "SYNTHETIC approved-new-dictionary.json", approvalSha256: A, reason: "SYNTHETIC explicitly approved native code, not original code", sourceFields: ["sourceId"] };
  (c.rows[7]!.references.size_group_id!.nativeSnapshot as JsonObject).code = "SYNTHETIC-NEW-CODE";
  const p = prepareNativeCatalogueImportChunk(c), d = (p.rows[5]!.evidence.decisions as JsonObject).code as JsonObject;
  assert.equal(d.kind, "REVIEWED_VALUE"); assert.equal(d.origin, "MIGRATION_DERIVED"); assert.equal((d.inputs as JsonObject).sourceId, row.source.sourceKey); assert.equal(p.rows[5]!.source.rawFields.code, "SYNTHETIC-GROUP");
  // Reference must change as well; otherwise the explicit dependency mapping is stale.
  (c.rows[7]!.references.size_group_id!.nativeSnapshot as JsonObject).code = "SYNTHETIC-GROUP";
  assert.throws(() => prepareNativeCatalogueImportChunk(c), { code: "NATIVE_CATALOGUE_REFERENCE_CONFLICT" });
  (c.rows[7]!.references.size_group_id!.nativeSnapshot as JsonObject).code = "SYNTHETIC-NEW-CODE";
  (row.decisions.code as unknown as { approvalSha256: string }).approvalSha256 = H;
  assert.throws(() => prepareNativeCatalogueImportChunk(c), { code: "NATIVE_CATALOGUE_REVIEWED_VALUE" });
});
test("whole chunk rolls back on last binding failure or empty group; no automatic retry after lost commit acknowledgement", async () => {
  for (const options of [{ failBindingAt: 8 }, { emptyGroup: true }, { wrongBatch: true }, { missingSchema: true }]) {
    const h = protocol(options); await assert.rejects(h.store.stage(prepareNativeCatalogueImportChunk(input())));
    assert.equal(h.state().native.size, 0); assert.equal(h.state().sources.size, 0); assert.equal(h.state().bindings.size, 0); assert.equal(h.calls.at(-1)!.sql, "ROLLBACK");
  }
  const uncertain = protocol({ commitUnknown: true }), p = prepareNativeCatalogueImportChunk(input());
  await assert.rejects(uncertain.store.stage(p), /ack lost/); assert.ok(uncertain.discarded() instanceof Error); assert.equal(uncertain.connects(), 1);
  assert.equal(uncertain.calls.at(-1)!.sql, "COMMIT"); assert.ok(!uncertain.calls.some(c => c.sql === "ROLLBACK"));
  assert.equal(uncertain.state().native.size, 8); assert.deepEqual(await uncertain.store.stage(p), { inserted: 0, replayed: 8, nativeCurrentMatchesCreation: true }); assert.deepEqual(uncertain.writes(), [8, 8, 8]);
  const uncommitted = protocol({ commitUnknown: true, commitUncommitted: true });
  await assert.rejects(uncommitted.store.stage(p), /ack lost/); assert.equal(uncommitted.state().native.size, 0); assert.ok(uncommitted.discarded() instanceof Error);
  assert.equal(uncommitted.calls.at(-1)!.sql, "COMMIT"); assert.ok(!uncommitted.calls.some(c => c.sql === "ROLLBACK"));
  assert.deepEqual(await uncommitted.store.stage(p), { inserted: 8, replayed: 0, nativeCurrentMatchesCreation: true }); assert.equal(uncommitted.state().native.size, 8);
  const unknownWithBrokenRollback = protocol({ commitUnknown: true, rollbackFails: true });
  await assert.rejects(unknownWithBrokenRollback.store.stage(p), /ack lost/); assert.equal(unknownWithBrokenRollback.calls.at(-1)!.sql, "COMMIT");
  assert.ok(!unknownWithBrokenRollback.calls.some(c => c.sql === "ROLLBACK"));
  const rollback = protocol({ failBindingAt: 1, rollbackFails: true }); await assert.rejects(rollback.store.stage(p), AggregateError); assert.ok(rollback.discarded() instanceof Error);
});
test("prepared projection alteration is rejected before connecting; SIZE code is nullable and intentionally nonunique", async () => {
  const c = input(), p = prepareNativeCatalogueImportChunk(c), h = protocol(); p.rows[0]!.nativeSnapshot.name = "ALTERED";
  await assert.rejects(h.store.stage(p), { code: "NATIVE_CATALOGUE_PREPARED_CHANGED" }); assert.equal(h.connects(), 0);
  const second = structuredClone(c.rows[4]!); (second as { nativeId: string }).nativeId = id(80); second.source.id = id(180); second.source.sourceKey = "SYNTHETIC SECOND SIZE";
  second.source.rawFields.sourceId = second.source.sourceKey; second.source.normalizedFields.sourceId = second.source.sourceKey;
  (second.source.fieldProvenance.fields as JsonObject).sourceId = { origin: "ORIGINAL", reason: "SYNTHETIC ORIGINAL", raw: second.source.sourceKey }; second.source.rowNo = "80";
  const sizes = { ...c, rows: [c.rows[4]!, second] }; assert.equal(prepareNativeCatalogueImportChunk(sizes).rows.length, 2);
});
test("0014 source has typed FK/uniqueness/closed-batch/immutable guards and additive publication coverage, without changing live constraints", async () => {
  const sql = await readFile(new URL("../adapters/postgres/migrations/0014_native_catalogue_import.sql", import.meta.url), "utf8");
  for (const table of ["product_category", "color", "fit", "size", "size_group", "season", "size_group_member", "import_source_row"]) assert.match(sql, new RegExp(`REFERENCES naijue_erp\\.${table}\\(`));
  assert.match(sql, /PRIMARY KEY \(batch_id,entity_type,source_key\)/); assert.match(sql, /UNIQUE \(batch_id,member_group_id,member_size_id\)/);
  assert.match(sql, /status NOT IN \('STAGED','VALIDATING'\)/); assert.match(sql, /BEFORE UPDATE OR DELETE/); assert.match(sql, /BEFORE TRUNCATE/);
  assert.match(sql, /cutoff_import_lock/); assert.match(sql, /FOR UPDATE/); assert.match(sql, /FOR SHARE/); assert.match(sql, /native dictionary occurrence lacks typed creation binding/);
  assert.doesNotMatch(sql, /ALTER TABLE|INSERT INTO naijue_erp\.(product|sku|inventory_ledger)\b|DROP CONSTRAINT/);
  assert.match(sql, /IS DISTINCT FROM ARRAY\['size_group_id','size_id'\]/);
  assert.doesNotMatch(sql, /jsonb_object_length/); // PostgreSQL has jsonb_object_keys, not jsonb_object_length.
});
