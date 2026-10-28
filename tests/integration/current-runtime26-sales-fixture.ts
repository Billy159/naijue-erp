/** Source-only QA897 fixture adapter. T45 alone prepares/reviews private account
 * packets and invokes this on its approved target. No credential values, Pool
 * construction, DDL, grants, direct business INSERTs or self-issued authority.
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { IMPORT_V2_TABLES } from "../../packages/application/src/import-v2-contract.ts";
import { engineFixtures } from "./native-import-accounting-fixture.ts";
import { syntheticId } from "./fixtures.ts";
import { entityId } from "../../packages/domain/src/values.ts";
import type { EntityKind } from "../../packages/domain/src/values.ts";
import type { JsonObject } from "../../packages/application/src/history-storage-contract.ts";
import type { NativePartyImportInput } from "../../packages/application/src/native-party-import.ts";
import { prepareNativePartyImportChunk } from "../../packages/application/src/native-party-import.ts";
import { NATIVE_CATALOGUE_IMPORT_VERSION_26, prepareNativeCatalogueImportChunk26, validatePreparedNativeCatalogueImportChunk26 } from "../../packages/application/src/native-catalogue-import.ts";
import type { NativeCatalogueImportChunk26, PreparedNativeCatalogueImportChunk26 } from "../../packages/application/src/native-catalogue-import.ts";

import type { NativeRuntime26Issuer } from "../../adapters/postgres/src/native-import-accounting-capability.ts";
import { PostgresCutoffImportStore } from "../../adapters/postgres/src/inventory-cutoff-import-store.ts";
import type { ImportStageBootstrap26, BarcodeSchemeInitialization26 } from "../../adapters/postgres/src/inventory-cutoff-import-store.ts";
import { createCutoffImportService, validateCutoffImportCommand } from "../../packages/application/src/inventory-cutoff-import.ts";
import type { CoreStageCommand, CoreImportCommand, BarcodeSchemeInitializationCommand } from "../../packages/application/src/inventory-cutoff-import.ts";
import { PostgresNativeCatalogueImportStore26 } from "../../adapters/postgres/src/native-catalogue-import.ts";
import { PostgresMaintenanceCommandUnitOfWork } from "../../adapters/postgres/src/maintenance-command-unit-of-work.ts";
import { PostgresStaffMaintenanceUnitOfWork } from "../../adapters/postgres/src/staff-maintenance-store.ts";
import { PostgresPaymentMaintenanceUnitOfWork } from "../../adapters/postgres/src/payment-maintenance-store.ts";
import { PostgresPartyUnitOfWork } from "../../adapters/postgres/src/party-maintenance-store.ts";
import { PostgresProductMaintenanceUnitOfWork } from "../../adapters/postgres/src/product-maintenance-store.ts";
import { createStaffMaintenanceService } from "../../packages/application/src/staff-maintenance-service.ts";
import { createPaymentMaintenanceService } from "../../packages/application/src/payment-maintenance-service.ts";
import { createPartyMaintenanceService } from "../../packages/application/src/party-maintenance-service.ts";
import { createSourcePartyAuthorization } from "../../packages/application/src/party-maintenance-policy.ts";
import { createApprovedPartyCodeAllocator } from "../../packages/application/src/party-numbering.ts";
import { createProductMaintenanceService } from "../../packages/application/src/product-maintenance-service.ts";
import { createSourceConfirmedProductCapacityFactory } from "../../apps/api/src/postgres-read-api.ts";
import { CATALOGUE_PRICE_KEYS, validateCompleteCataloguePrices } from "../../packages/application/src/catalogue-price-input.ts";
import { prepareNativeProductImportChunk } from "../../packages/application/src/native-product-import.ts";
import type { ActorContext } from "../../packages/application/src/ports.ts";
import type { SkuSnapshot } from "../../packages/domain/src/documents.ts";
import type { SalesFactsPgFixture } from "./sales-save-facts-cache.integration.test.ts";


export const CURRENT_SALES_QA_TARGET = "naijue_erp_test_hv2_qa897_20261029_01";
export const CURRENT_SALES_QA_NAMESPACE = "synthetic.qa897.sales.20261029";
export interface CurrentSalesSourcePins {
  readonly baseManifestSha256: string;
  readonly selectionSha256: string;
  readonly approvalSha256: string;
  readonly occurrenceContractSha256: string;
}
export interface CurrentSalesBlueprintOptions {
  readonly database: typeof CURRENT_SALES_QA_TARGET;
  readonly batchId: string;
  readonly now: string;
  /** External real source/review pins; these do not authorize execution alone. */
  readonly pins: CurrentSalesSourcePins;
}
const digest = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const provenance = (raw: JsonObject): JsonObject => ({ schema_version: 1, fields: Object.fromEntries(Object.entries(raw).map(([key, value]) =>
  [key, { origin: "ORIGINAL", raw: value, reason: "Exact literal of new all-synthetic QA897 input; not production/legacy data" }])) });
const label = (kind: string, index: number) => `SYNTHETIC-QA897-${kind}-${String(index + 1).padStart(2, "0")}`;
const native = <K extends EntityKind>(kind: K, offset: number) => syntheticId(kind, 897000 + offset);

/** Finite safe blueprint, NOT a bootstrap source factory or a signed review.
 * Credential/login fields are intentionally absent. Original private factories
 * must produce 49 synthetic captures/45 direct/4 approved plan links, verify the
 * literal source artifacts and independently bind their original options/grants.
 */
export function buildCurrentRuntime26SalesBlueprint(input: CurrentSalesBlueprintOptions) {
  assert.equal(input.database, CURRENT_SALES_QA_TARGET); entityId("operation", input.batchId);
  assert.equal(new Date(input.now).toISOString(), input.now);
  for (const pin of Object.values(input.pins)) assert.match(pin, /^[a-f0-9]{64}$/);
  const accountRows = Array.from({ length: 49 }, (_, i) => {
    // The original factory requires the direct account/employee source identity
    // to be the same value, and plan-linked STAFF also keys by sourceAccountId.
    // These are NEW synthetic source identities, not reused native target IDs.
    const sourceEmployeeKey = native("account", 100 + i), hallIndex = i < 2 ? null : (i - 2) % 22;
    return { sourceAccountId: native("account", 100 + i), nativeAccountId: native("account", 200 + i), nativeStaffId: native("staff", 300 + i),
      staffSourceKey: sourceEmployeeKey, sourceAccountVersion: 1, sourceEmployeeNativeId: i < 45 ? sourceEmployeeKey : null,
      sourceEmployeeCode: i < 45 ? `QA897E${String(i + 1).padStart(3, "0")}` : null,
      sourceRole: i === 0 ? "ADMIN" as const : i === 1 ? "WAREHOUSE" as const : "SALESPERSON" as const,
      sourceHallId: hallIndex === null ? null : label("HALL-SOURCE", hallIndex),
      nativeHallId: hallIndex === null ? null : native("hall", 400 + hallIndex),
      sourceEmploymentStatus: "在职", sourceLoginEnabled: true, sourceEnabled: true,
      ...(i >= 45 ? { approvedCurrentPerson: { currentPersonKey: label("APPROVED-CURRENT-PERSON", i - 45), sourcePlanRow: i - 44 } } : {}) };
  });
  const rawRows: { entity: "HALL" | "WAREHOUSE" | "CUSTOMER" | "STAFF"; raw: JsonObject; snapshot: JsonObject;
    bindings: NativePartyImportInput["bindings"]; mappings: NativePartyImportInput["enumMappings"] }[] = [];
  const add = (entity: typeof rawRows[number]["entity"], cells: JsonObject, snapshot: JsonObject,
    bindings: NativePartyImportInput["bindings"], mappings: NativePartyImportInput["enumMappings"]) => {
    const table = IMPORT_V2_TABLES.find(t => t.entity === entity)!;
    const raw = { ...Object.fromEntries(table.columns.map(c => [c.name, ""])), ...cells };
    rawRows.push({ entity, raw, snapshot, bindings, mappings });
  };
  const enabled = { 状态: { raw: "正常", native: true, evidenceRef: "synthetic:qa897-explicit-enabled" } };
  for (let i = 0; i < 22; i++) {
    const hallId = native("hall", 400 + i), warehouseId = native("warehouse", 500 + i), customerId = native("customer", 600 + i);
    const hallKey = label("HALL-SOURCE", i), warehouseKey = label("WAREHOUSE-SOURCE", i), customerKey = label("CUSTOMER-SOURCE", i);
    add("CUSTOMER", { 来源编号: customerKey, 原编码: `QA897C${String(i + 1).padStart(3, "0")}`, 名称: label("CUSTOMER", i), 状态: "正常" },
      { id: customerId, code: `QA897C${String(i + 1).padStart(3, "0")}`, name: label("CUSTOMER", i), enabled: true, version: 1, created_at: null, updated_at: null }, {}, enabled);
    add("HALL", { 来源编号: hallKey, 厅名称: label("HALL", i), 默认客户来源编号: customerKey, 默认销货仓来源编号: warehouseKey, 状态: "正常" },
      { id: hallId, name: label("HALL", i), default_customer_id: customerId, default_sales_warehouse_id: warehouseId, enabled: true, version: 1 },
      { 默认客户来源编号: { sourceKey: customerKey, nativeId: customerId }, 默认销货仓来源编号: { sourceKey: warehouseKey, nativeId: warehouseId } }, enabled);
    add("WAREHOUSE", { 来源编号: warehouseKey, 仓库名称: label("WAREHOUSE", i), 所属厅来源编号: hallKey, 状态: "正常", 切换范围: "本次完整核准" },
      { id: warehouseId, name: label("WAREHOUSE", i), hall_id: hallId, enabled: true, version: 1, created_operation_id: null },
      { 所属厅来源编号: { sourceKey: hallKey, nativeId: hallId } }, enabled);
  }
  for (const [i, a] of accountRows.entries()) {
    const roleCell = a.sourceRole === "ADMIN" ? "管理员" : a.sourceRole === "WAREHOUSE" ? "仓库" : "营业员";
    add("STAFF", { 来源编号: a.staffSourceKey, 姓名: label("STAFF", i), 角色: roleCell, 所属厅来源编号: a.sourceHallId ?? "", 联系方式: "", 任职状态: "在职" },
      { id: a.nativeStaffId, name: label("STAFF", i), role: a.sourceRole, hall_id: a.nativeHallId, contact: null, employment_status: "在职", version: 1 },
      a.sourceHallId === null ? {} : { 所属厅来源编号: { sourceKey: a.sourceHallId, nativeId: a.nativeHallId! } },
      { 角色: { raw: roleCell, native: a.sourceRole, evidenceRef: "synthetic:qa897-explicit-role" }, 任职状态: { raw: "在职", native: "在职", evidenceRef: "synthetic:qa897-explicit-employment" } });
  }
  const partyArtifacts = ["CUSTOMER", "HALL", "WAREHOUSE", "STAFF"].map(entity => {
    const rows = rawRows.filter(r => r.entity === entity), columns = IMPORT_V2_TABLES.find(t => t.entity === entity)!.columns.map(c => c.name);
    const cell = (value: unknown) => '"' + String(value).replaceAll('"', '""') + '"';
    const utf8 = columns.join(",") + "\n" + rows.map(r => columns.map(key => cell(r.raw[key])).join(",")).join("\n") + "\n";
    return { entity, fileRef: IMPORT_V2_TABLES.find(t => t.entity === entity)!.file, utf8, sha256: digest(utf8), rowIdentityCodec: "SHA256_UTF8_JSON_LITERAL_CELL_MAP" as const };
  });
  const parties: NativePartyImportInput[] = rawRows.map((r, i) => {
    const artifact = partyArtifacts.find(a => a.entity === r.entity)!;
    const ordinal = rawRows.filter(x => x.entity === r.entity).indexOf(r) + 1;
    return { batchId: input.batchId, fixedSourceNamespace: CURRENT_SALES_QA_NAMESPACE, schemaProfile: "EXACT26",
      selection: { entity: r.entity, source: "BASE_V2", path: IMPORT_V2_TABLES.find(t => t.entity === r.entity)!.file,
        baseManifestSha256: input.pins.baseManifestSha256, selectionSha256: input.pins.selectionSha256, approvalSha256: input.pins.approvalSha256, csvSha256: artifact.sha256 },
      source: { id: native("product", 1000 + i), batchId: input.batchId, entityType: r.entity, sourceKey: r.raw["来源编号"] as string,
        fileRef: artifact.fileRef, sheet: r.entity, rowNo: String(ordinal + 1), sourceFileSha256: artifact.sha256, rowSha256: digest(JSON.stringify(r.raw)),
        rawFields: r.raw, normalizedFields: r.raw, fieldProvenance: provenance(r.raw) }, nativeSnapshot: r.snapshot, bindings: r.bindings, enumMappings: r.mappings,
      ...(r.entity === "WAREHOUSE" ? { warehouseRecord: { id: native("product", 1200 + i), reviewedAt: input.now, decisionReason: "Exact synthetic warehouse membership, no stock assertion" } } : {}) };
  });
  // Validate bounded dependency groups through the ORIGINAL pure contract. Account
  // bootstrap proof is added only by the original reviewed private factory later.
  for (const group of [parties.filter(r => r.source.entityType === "CUSTOMER"), parties.filter(r => ["HALL", "WAREHOUSE"].includes(r.source.entityType)), parties.filter(r => r.source.entityType === "STAFF")]) prepareNativePartyImportChunk(group);
  const partySourceCandidates = parties.map(original => {
    const row = structuredClone(original); delete row.schemaProfile;
    if (row.source.entityType === "WAREHOUSE") delete row.nativeSnapshot.created_operation_id;
    prepareNativePartyImportChunk([row]); return row;
  });
  const template = structuredClone(engineFixtures().catalogue);
  const size = template.rows.find(r => r.source.entityType === "SIZE")!, member = template.rows.find(r => r.source.entityType === "SIZE_GROUP_MEMBER")!;
  const secondSizeId = native("size", 1300), secondSizeKey = "QA897-SIZE-L";
  const secondSize = { ...structuredClone(size), nativeId: secondSizeId, source: { ...structuredClone(size.source), sourceKey: secondSizeKey,
    rawFields: { sourceId: secondSizeKey, code: "QA897L", name: "SYNTHETIC QA897 L" }, normalizedFields: { sourceId: secondSizeKey, code: "QA897L", name: "SYNTHETIC QA897 L" } } };
  const secondMemberKey = "QA897-MEMBER-L", secondMember = { ...structuredClone(member), references: { ...member.references,
    size_id: { entity: "SIZE" as const, sourceKey: secondSizeKey, nativeId: secondSizeId, nativeSnapshot: { id: secondSizeId, code: "QA897L", name: "SYNTHETIC QA897 L" } } },
    source: { ...structuredClone(member.source), sourceKey: secondMemberKey, rawFields: { sourceId: secondMemberKey, display_order: "1" }, normalizedFields: { sourceId: secondMemberKey, display_order: "1" } } };
  const seasonKey = "QA897-SEASON", seasonId = native("season", 1301);
  const season = { source: { ...structuredClone(size.source), entityType: "SEASON", sourceKey: seasonKey,
    rawFields: { sourceId: seasonKey, code: "QA897", name: "SYNTHETIC QA897 SEASON", display_order: "0" }, normalizedFields: { sourceId: seasonKey, code: "QA897", name: "SYNTHETIC QA897 SEASON", display_order: "0" } },
    sourceKeyField: "sourceId", nativeId: seasonId, decisions: { code: { kind: "SOURCE_FIELD" as const, field: "code" }, name: { kind: "SOURCE_FIELD" as const, field: "name" }, display_order: { kind: "SOURCE_FIELD" as const, field: "display_order" } }, references: {} };
  const dictionaryRows = [...template.rows, secondSize, secondMember, season];
  const dictionaryUtf8 = dictionaryRows.map(r => JSON.stringify(r.source.rawFields)).join("\n") + "\n", dictionarySha = digest(dictionaryUtf8);
  const catalogue: NativeCatalogueImportChunk26 = { batchId: input.batchId, fixedSourceNamespace: CURRENT_SALES_QA_NAMESPACE,
    schemaProfile: "EXACT26", validatorVersion: NATIVE_CATALOGUE_IMPORT_VERSION_26,
    selection: { ...template.selection, ...input.pins }, rows: dictionaryRows.map((row, i) => ({ ...row,
      source: { ...row.source, id: native("product", 1400 + i), batchId: input.batchId, fileRef: "synthetic:qa897/catalogue.ndjson", sheet: row.source.entityType, rowNo: String(i + 1),
        sourceFileSha256: dictionarySha, rowSha256: digest(JSON.stringify(row.source.rawFields)), fieldProvenance: provenance(row.source.rawFields) } })) };
  // Safe mapping INPUT for the original factory, not a technical review or a
  // prepared authorization. T45 supplies actual absolute paths and outside pins.
  const catalogueMappingCandidate = { version: "NATIVE_CATALOGUE_OCCURRENCE_CANDIDATE_V1", batchId: input.batchId,
    fixedSourceNamespace: CURRENT_SALES_QA_NAMESPACE, selectionSha256: input.pins.selectionSha256,
    baseManifestSha256: input.pins.baseManifestSha256, groups: [catalogue.rows.map(row => ({
      entity: row.source.entityType, sourceKey: row.source.sourceKey, nativeId: row.nativeId,
      values: Object.fromEntries(Object.entries(row.decisions).map(([field, decision]) => {
        assert.equal(decision.kind, "SOURCE_FIELD", "This finite synthetic mapping preserves explicit literal cells");
        return [field, row.source.rawFields[(decision as { field: string }).field]];
      })), references: structuredClone(row.references), originalEvidence: { syntheticOnly: true, target: CURRENT_SALES_QA_TARGET,
        fileRef: row.source.fileRef, rowNo: row.source.rowNo, sourceFileSha256: row.source.sourceFileSha256, rawFields: row.source.rawFields }
    }))] };
  const preparedCatalogue = prepareNativeCatalogueImportChunk26(catalogue);
  const find = (entity: string) => preparedCatalogue.rows.find(r => r.entity === entity)!.nativeSnapshot;
  return { version: "SYNTHETIC_QA897_CURRENT_SALES_BLUEPRINT_V1" as const, database: input.database, batchId: input.batchId, now: input.now, pins: structuredClone(input.pins),
    namespace: CURRENT_SALES_QA_NAMESPACE, accountIdentities: accountRows, parties, partySourceCandidates, partyArtifacts,
    catalogue, catalogueMappingCandidate, catalogueArtifact: { fileRef: "synthetic:qa897/catalogue.ndjson", utf8: dictionaryUtf8, sha256: dictionarySha },
    counts: { HALL: 22, WAREHOUSE: 22, STAFF: 49, CUSTOMER: 22, SUPPLIER: 0, accounts: 49, directLinks: 45, planLinks: 4 },
    refs: { importer: accountRows[0]!, businessActor: accountRows[1]!, salesperson: accountRows[2]!, hallId: native("hall", 400), warehouseId: native("warehouse", 500), customerId: native("customer", 600),
      category: find("CATEGORY"), color: find("COLOR"), fit: find("FIT"), size: find("SIZE"), sizeGroup: find("SIZE_GROUP"), secondSizeId, seasonId },
    privateHostPrerequisites: ["49 synthetic private captures, 45 direct +4 reviewed current-person links; no real credentials",
      "Original party-source26 component review, account identity review, CORE digest/execution review and source grant for this exact target",
      "Original scheme initialization command/provider and exact current A01/P02 maintained host; no old schema11/B07 packet"] };
}
export type CurrentSalesBlueprint = ReturnType<typeof buildCurrentRuntime26SalesBlueprint>;

interface OriginalBootstrap26 {
  readonly command: CoreStageCommand;
  readonly bootstrap26: ImportStageBootstrap26;
  authorizeStageSourceActor(actor: string, command: CoreStageCommand): Promise<void>;
  now(): string;
  close(): Promise<void>;
}
export interface CurrentReviewedCatalogueSource {
  verify(): Promise<void>;
  chunks(): AsyncIterable<PreparedNativeCatalogueImportChunk26>;
  authorize(chunk: PreparedNativeCatalogueImportChunk26): Promise<void>;
}
/** Capture exact original-factory chunks before any database initialization.
 * Compare intended native values/coverage, while leaving source IDs, physical
 * mapping paths, row numbers, raw/provenance and fingerprints factory-owned. */
export async function collectCurrentReviewedCatalogue(blueprint: CurrentSalesBlueprint, source: CurrentReviewedCatalogueSource) {
  assert.ok(source && typeof source.verify === "function" && typeof source.chunks === "function" && typeof source.authorize === "function",
    "Original reviewed catalogue factory/chunks/authorize required");
  const expected = prepareNativeCatalogueImportChunk26(blueprint.catalogue), key = (entity: string, sourceKey: string) => JSON.stringify([entity, sourceKey]);
  const wanted = new Map(expected.rows.map(row => [key(row.entity, row.source.sourceKey), row.nativeSnapshot]));
  const seen = new Set<string>(), chunks: PreparedNativeCatalogueImportChunk26[] = [];
  await source.verify();
  for await (const chunk of source.chunks()) {
    validatePreparedNativeCatalogueImportChunk26(chunk);
    assert.equal(chunk.batchId, blueprint.batchId); assert.equal(chunk.fixedSourceNamespace, blueprint.namespace);
    assert.equal(chunk.selection.selectionSha256, blueprint.pins.selectionSha256);
    for (const row of chunk.rows) {
      const identity = key(row.entity, row.source.sourceKey);
      assert.ok(wanted.has(identity) && !seen.has(identity), "Exact reviewed QA897 catalogue coverage required");
      assert.deepEqual(row.nativeSnapshot, wanted.get(identity), "Original factory native values must match the explicit synthetic blueprint");
      seen.add(identity);
    }
    await source.authorize(chunk); chunks.push(chunk);
  }
  assert.equal(seen.size, wanted.size, "Original factory must cover all intended dictionary members");
  await source.verify(); return chunks;
}

export interface CurrentSalesFixtureHost {
  readonly issuer: NativeRuntime26Issuer;
  readonly expectedDatabaseOid: string;
  readonly blueprint: CurrentSalesBlueprint;
  /** Original factory options contain private FILE REFERENCES/partySource methods.
   * This adapter does not parse/read/return login names or credential values. */
  readonly bootstrapOptions: Readonly<Record<string, unknown>>;
  readonly coreAuthorization: { assertAllowed(actor: string, command: CoreImportCommand): Promise<void> };
  /** Actual original openReviewedCatalogueSource26 result. The factory owns
   * source-row IDs/fileRefs/raw/provenance/fingerprints; never rebuild its DTO. */
  readonly catalogueSource: CurrentReviewedCatalogueSource;
  readonly schemes: { readonly command: BarcodeSchemeInitializationCommand; readonly source: BarcodeSchemeInitialization26; readonly defaultSchemeId: string };
}

/** Called once by T45 after the original private packet factories/review are ready.
 * This adapter does not create those capabilities, sign grants, widen old helpers,
 * publish fake source batches or recover/retry an uncertain command. Its output
 * deliberately excludes private bootstrap reports and normal-login material.
 */
export async function prepareCurrentRuntime26SalesFixture(host: CurrentSalesFixtureHost) {
  assert.ok(host?.issuer?.runtime26 && host.issuer.pool && host.blueprint && host.bootstrapOptions && host.coreAuthorization && host.catalogueSource && host.schemes,
    "Current issuer, full synthetic blueprint and original independently reviewed source factories/grants required");
  const b = structuredClone(host.blueprint), { pool, runtime26 } = host.issuer;
  assert.equal(b.database, CURRENT_SALES_QA_TARGET); assert.match(host.expectedDatabaseOid, /^[1-9]\d*$/);
  const binding = host.bootstrapOptions.binding as { target: { database: string }; batchId: string; actorAccountId: string; fixedSourceNamespace: string; selectionSha256: string; phase: string };
  assert.equal(binding?.target?.database, CURRENT_SALES_QA_TARGET); assert.equal(binding.batchId, b.batchId);
  assert.equal(binding.actorAccountId, b.refs.importer.nativeAccountId); assert.equal(binding.fixedSourceNamespace, CURRENT_SALES_QA_NAMESPACE);
  assert.equal(binding.selectionSha256, b.pins.selectionSha256); assert.equal(binding.phase, "CORE_INITIALIZATION_26_V1");
  const reviewedCatalogue = await collectCurrentReviewedCatalogue(b, host.catalogueSource);
  assert.equal(b.parties.length, 115); assert.equal(b.accountIdentities.length, 49);
  assert.equal(b.accountIdentities.filter(a => a.sourceEmployeeNativeId !== null).length, 45);
  assert.equal(b.accountIdentities.filter(a => a.sourceEmployeeNativeId === null).length, 4);
  assert.equal(b.refs.importer.nativeHallId, null); assert.equal(b.refs.importer.sourceRole, "ADMIN");
  const read = async (sql: string, values: unknown[] = []) => {
    const client = await pool.connect();
    try { await runtime26.assertReady(client, "INVENTORY_ADMISSION"); return (await client.query(sql, values)).rows; }
    finally { client.release(); }
  };
  const target = await read("SELECT current_database() AS db,(SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()) AS oid");
  assert.equal(target.length, 1); assert.equal(target[0]!.db, CURRENT_SALES_QA_TARGET); assert.equal(target[0]!.oid, host.expectedDatabaseOid);
  // The ORIGINAL bootstrap rechecks all empty-domain/source/target/49+115
  // invariants on its own original callback client before committing CORE.
  const module = await import(new URL("../../scripts/import-v3/native-bootstrap.mjs", import.meta.url).href) as {
    openNativeImportBootstrap26(options: Readonly<Record<string, unknown>>): Promise<OriginalBootstrap26>;
  };
  const bootstrap = await module.openNativeImportBootstrap26(host.bootstrapOptions);
  try {
    const newId = <K extends EntityKind>(kind: K) => entityId(kind, randomUUID());
    let coreResult: Awaited<ReturnType<ReturnType<typeof createCutoffImportService>["execute"]>>;
      const command = bootstrap.command; validateCutoffImportCommand(command);
      assert.equal(command.action, "IMPORT_CORE_STAGE"); assert.equal(command.batchId, b.batchId); assert.equal(bootstrap.now(), b.now);
      const expectedMembers = b.parties.map(r => ({ sourceRowId: r.source.id, entity: r.source.entityType, sourceKey: r.source.sourceKey, nativeId: r.nativeSnapshot.id })).sort((x, y) => x.sourceRowId.localeCompare(y.sourceRowId));
      assert.deepEqual(command.coreInitialization.coreSourceMembers.parties, expectedMembers);
      const core = createCutoffImportService({ now: bootstrap.now.bind(bootstrap),
        store: new PostgresCutoffImportStore(pool, { runtime26, coreAuthorization: host.coreAuthorization,
          stageBootstrap26: { stageNewBatch26: bootstrap.bootstrap26.stageNewBatch26.bind(bootstrap.bootstrap26) } }),
        authorization: { async assertAllowed(actor, input) {
          assert.equal(input.action, "IMPORT_CORE_STAGE"); await bootstrap.authorizeStageSourceActor(actor, input as CoreStageCommand);
          await host.coreAuthorization.assertAllowed(actor, input as CoreStageCommand);
        } } });
      coreResult = await core.execute(command); assert.equal(coreResult.status, "STAGED");
    const actualCoreCounts: Record<string, string> = {};
    for (const [table, expected] of [["hall", 22], ["warehouse", 22], ["staff", 49], ["customer", 22], ["user_account", 49]] as const) {
      const rows = await read(`SELECT count(*)::text AS n FROM naijue_erp.${table}`); assert.equal(rows[0]!.n, String(expected)); actualCoreCounts[table] = rows[0]!.n as string;
    }
    // No fake/current proof built from counts: the following original stores still
    // independently check all supplied authorities and actual locked references.
    const schemeCommand = host.schemes.command; validateCutoffImportCommand(schemeCommand);
    assert.equal(schemeCommand.batchId, b.batchId); assert.equal(schemeCommand.actorAccountId, b.refs.importer.nativeAccountId);
    assert.equal(schemeCommand.schemeInitialization.target.database, CURRENT_SALES_QA_TARGET);
    assert.ok(schemeCommand.schemeInitialization.schemes.some(s => s.native.id === host.schemes.defaultSchemeId));
    await createCutoffImportService({ now: () => b.now,
      store: new PostgresCutoffImportStore(pool, { runtime26, barcodeSchemeInitialization26: host.schemes.source }),
      authorization: { async assertAllowed(actor, command) { assert.deepEqual(command, schemeCommand); await host.schemes.source.assertAllowed(actor, command as BarcodeSchemeInitializationCommand); } }
    }).execute(schemeCommand);
    for (const chunk of reviewedCatalogue) {
      // Original DTO and source authorizer stay paired through the actual stage.
      await host.catalogueSource.authorize(chunk);
      await new PostgresNativeCatalogueImportStore26(pool, runtime26).stage(chunk);
    }
    await host.catalogueSource.verify();
    const importer: ActorContext = { accountId: entityId("account", b.refs.importer.nativeAccountId), hallId: null };
    const driver = new PostgresMaintenanceCommandUnitOfWork(pool);
    const staff = createStaffMaintenanceService({ unitOfWork: new PostgresStaffMaintenanceUnitOfWork(driver), credentials: null, now: () => b.now, newId });
    const actorRows = await read(`SELECT s.id,s.name,s.role,s.hall_id,s.contact,s.employment_status,s.version,a.id AS account_id,a.login_enabled,a.auth_version
      FROM naijue_erp.staff s JOIN naijue_erp.user_account a ON a.staff_id=s.id WHERE s.id=$1::uuid AND a.id=$2::uuid`, [b.refs.businessActor.nativeStaffId, b.refs.businessActor.nativeAccountId]);
    assert.equal(actorRows.length, 1); const beforeActor = actorRows[0]!;
    assert.equal(beforeActor.role, "WAREHOUSE"); assert.equal(beforeActor.hall_id, null); assert.equal(beforeActor.employment_status, "在职"); assert.equal(beforeActor.login_enabled, true);
    await staff.execute(importer, { action: "EDIT", requestKey: "QA897-RUNTIME-ACTOR-HALL", id: beforeActor.id, expectedVersion: beforeActor.version,
      values: { name: beforeActor.name, role: "WAREHOUSE", hallId: b.refs.hallId, contact: beforeActor.contact }, account: null });
    const payments = createPaymentMaintenanceService({ unitOfWork: new PostgresPaymentMaintenanceUnitOfWork(driver), now: () => b.now, newId });
    const method = await payments.execute(importer, "PAYMENT_METHOD", { action: "CREATE", requestKey: "QA897-PAYMENT-METHOD", values: { name: "SYNTHETIC QA897 METHOD", enabled: true } });
    const payment = await payments.execute(importer, "PAYMENT_ACCOUNT", { action: "CREATE", requestKey: "QA897-PAYMENT-ACCOUNT",
      values: { name: "SYNTHETIC QA897 ACCOUNT", enabled: true, paymentMethodId: method.targetId, hallIds: [b.refs.hallId] } });
    const suppliers = createPartyMaintenanceService({ unitOfWork: new PostgresPartyUnitOfWork(pool, host.issuer.historicalCustomerExclusion),
      authorization: createSourcePartyAuthorization(), codes: createApprovedPartyCodeAllocator(), now: () => b.now, newId });
    const supplier = await suppliers.execute({ actor: { ...importer, role: "ADMIN" }, kind: "SUPPLIER", action: "CREATE", requestKey: "QA897-PRODUCT-SUPPLIER", name: "SYNTHETIC QA897 SUPPLIER" });
    const sourceProduct = prepareNativeProductImportChunk(engineFixtures().product).nativeProducts[0]!;
    const prices = validateCompleteCataloguePrices(Object.fromEntries(CATALOGUE_PRICE_KEYS.map(k => [k, sourceProduct[k]])));
    assert.ok(prices.retail_price !== null && /^\d+\.\d\d$/.test(prices.retail_price));
    const products = createProductMaintenanceService({ unitOfWork: new PostgresProductMaintenanceUnitOfWork(driver, { deletionGuard: null,
      seasonCapability: host.issuer.productSeasonArray, capacity: createSourceConfirmedProductCapacityFactory(pool, runtime26) }), now: () => b.now, newId });
    const created = await products.executeV2(importer, { action: "CREATE", requestKey: "QA897-BASE-PRODUCT",
      values: { productCode: "SYNTHETIC-QA897-PRODUCT", name: "SYNTHETIC QA897 PRODUCT", categoryId: b.refs.category.id, supplierId: supplier.partyId,
        seasonIds: [b.refs.seasonId], sizeGroupId: b.refs.sizeGroup.id, year: 2026, systemItemCode: "QA897", thickness: null, collarPantsType: null,
        defaultBarcodeSchemeId: host.schemes.defaultSchemeId, enabled: true, prices },
      skus: [{ id: null, expectedVersion: null, skuCode: "SYNTHETIC-QA897-BASE-SKU", colorId: b.refs.color.id, fitId: b.refs.fit.id, sizeId: b.refs.size.id, enabled: true }], barcodes: [] });
    const refs = await read(`SELECT s.id AS sku_id,p.id AS product_id,p.version,p.retail_price::text,p.product_code,p.name AS product_name,
      c.name AS color_name,f.name AS fit_name,z.name AS size_name FROM naijue_erp.product p JOIN naijue_erp.sku s ON s.product_id=p.id
      JOIN naijue_erp.color c ON c.id=s.color_id JOIN naijue_erp.fit f ON f.id=s.fit_id JOIN naijue_erp.size z ON z.id=s.size_id
      JOIN naijue_erp.size_group_member m ON m.size_id=z.id AND m.size_group_id=p.size_group_id
      WHERE p.id=$1::uuid AND s.color_id=$2::uuid AND s.fit_id=$3::uuid AND s.size_id=$4::uuid`, [created.targetId, b.refs.color.id, b.refs.fit.id, b.refs.size.id]);
    assert.equal(refs.length, 1); const current = refs[0]!;
    const main = await read("SELECT barcode FROM naijue_erp.sku_barcode WHERE sku_id=$1::uuid AND enabled AND barcode_kind='MAIN'", [current.sku_id]);
    assert.equal(main.length, 0, "Manual QA897 system code must not fabricate MAIN; actual database proves absence");
    const member = await read(`SELECT z.name FROM naijue_erp.size z JOIN naijue_erp.size_group_member m ON m.size_id=z.id
      JOIN naijue_erp.product p ON p.size_group_id=m.size_group_id WHERE p.id=$1::uuid AND z.id=$2::uuid`, [created.targetId, b.refs.secondSizeId]);
    assert.equal(member.length, 1);
    const missing = await read("SELECT id FROM naijue_erp.sku WHERE product_id=$1::uuid AND color_id=$2::uuid AND fit_id=$3::uuid AND size_id=$4::uuid", [created.targetId, b.refs.color.id, b.refs.fit.id, b.refs.secondSizeId]);
    assert.equal(missing.length, 0, "Second real member must remain a missing tuple, not an alias size/SKU");
    const actualActor = (await read(`SELECT a.id,a.staff_id,a.auth_version,a.login_enabled,s.role,s.hall_id,s.employment_status
      FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id WHERE a.id=$1::uuid`, [b.refs.businessActor.nativeAccountId]))[0]!;
    assert.equal(actualActor.login_enabled, true); assert.equal(actualActor.hall_id, b.refs.hallId); assert.equal(actualActor.role, "WAREHOUSE");
    assert.equal(actualActor.employment_status, "在职"); assert.equal(actualActor.auth_version, (beforeActor.auth_version as number) + 1);
    const salesperson = await read("SELECT id,hall_id,employment_status FROM naijue_erp.staff WHERE id=$1::uuid", [b.refs.salesperson.nativeStaffId]);
    assert.equal(salesperson.length, 1); assert.equal(salesperson[0]!.employment_status, "在职"); assert.equal(salesperson[0]!.hall_id, b.refs.hallId);
    const snapshot: SkuSnapshot = { productCode: current.product_code as string, productName: current.product_name as string,
      colorName: current.color_name as string, fitName: current.fit_name as string, sizeName: current.size_name as string, barcode: null };
    const deal = current.retail_price as string; assert.equal(deal, prices.retail_price);
    const referenceMinor = BigInt(deal.replace(".", "")).toString();
    const fixture: SalesFactsPgFixture = { syntheticOnly: true, database: CURRENT_SALES_QA_TARGET, now: b.now,
      actor: { accountId: entityId("account", actualActor.id as string), hallId: entityId("hall", b.refs.hallId) },
      baseProductId: created.targetId, expectedSnapshot: snapshot, expectedReferencePriceMinor: referenceMinor,
      baseProposal: { salesId: null, businessType: "SALE", businessDate: b.now.slice(0, 10), note: "SYNTHETIC QA897 P01",
        hallId: b.refs.hallId, warehouseId: b.refs.warehouseId, customerId: b.refs.customerId, salespersonId: b.refs.salesperson.nativeStaffId, orderDiscount: "0.00",
        lines: [{ skuId: current.sku_id as string, existingLineId: null, quantity: "1", dealPrice: deal, pricingRule: "UNIT_PRICE", discountTenths: null, isGift: false, zeroConfirmed: false }],
        settlements: [{ existingSettlementId: null, paymentAccountId: payment.targetId, paymentMethodId: method.targetId, direction: "RECEIVE", amount: deal }] },
      // The original document-append function creates no barcode; this is an
      // expectation checked by the actual subsequent MAIN loader, not a new fact.
      append: { spec: { productId: created.targetId, colorId: b.refs.color.id as string, fitId: b.refs.fit.id as string, sizeId: b.refs.secondSizeId },
        dealPrice: deal, expectedReferencePriceMinor: referenceMinor, expectedSnapshot: { ...snapshot, sizeName: member[0]!.name as string, barcode: null } } };
    return { fixture, coreResult, actualCoreCounts,
      p02: { accountId: actualActor.id, staffId: actualActor.staff_id, hallId: actualActor.hall_id, authVersion: actualActor.auth_version,
        normalLoginMaterial: "T45_PRIVATE_ORIGINAL_SYNTHETIC_FACTORY_ONLY" as const },
      a01: { productId: created.targetId, version: current.version, existingSkuId: current.sku_id, lawfulMissingTuple: fixture.append.spec },
      scope: "Actual source/stores and readback only when invoked by T45; no password/credential exported, no production acceptance" };
  } finally { await bootstrap.close(); }
}
