/** Synthetic integration expected facts only. No SQL, file reader, source grant or publication capability.
 * Call only AFTER the independent sealed reader authorizes each complete prepared chunk.
 * Neither SQL readback nor a store RETURNING row is an accepted input to this fixture collector.
 */
import { encodeHistoryClosureValue, historyClosureProjectionRow, historyClosureRowHash } from "../../packages/application/src/history-typed-closure.ts";
import type { HistoryClosureRow } from "../../packages/application/src/history-typed-closure.ts";
import type { ImportSourceEvidence } from "../../packages/application/src/history-storage-contract.ts";
import { NATIVE_PARTY_IMPORT_VERSION, nativePartyStandaloneImportSource } from "../../packages/application/src/native-party-import.ts";
import type { PreparedNativePartyImportChunk } from "../../packages/application/src/native-party-import.ts";
import { nativeCatalogueSourceEvidence } from "../../packages/application/src/native-catalogue-import.ts";
import type { PreparedNativeCatalogueImportChunk } from "../../packages/application/src/native-catalogue-import.ts";
import { nativeProductImportEvidence } from "../../packages/application/src/native-product-import.ts";
import type { PreparedNativeProductImportChunk } from "../../packages/application/src/native-product-import.ts";
import { nativeSkuAliasEvidence } from "../../packages/application/src/native-sku-import.ts";
import type { PreparedNativeSkuImport } from "../../packages/application/src/native-sku-import.ts";
import { nativeStockSourceEvidence } from "../../packages/application/src/native-stock-contributor-import.ts";
import type { PreparedNativeStockGroup } from "../../packages/application/src/native-stock-contributor-import.ts";
import type { PreparedNativePaymentImportChunk } from "../../packages/application/src/native-payment-import.ts";
import type { PreparedHistoryHeaderChunk } from "../../packages/application/src/import-v3-history-header-staging.ts";
import { HISTORY_SALES_DETAIL_VERSION } from "../../packages/application/src/import-v3-history-sales-detail.ts";
import type { PreparedHistorySalesDetailChunk } from "../../packages/application/src/import-v3-history-sales-detail.ts";
import { HISTORY_SETTLEMENT_VERSION } from "../../packages/application/src/import-v3-history-settlement.ts";
import type { PreparedHistorySettlementChunk } from "../../packages/application/src/import-v3-history-settlement.ts";
import type { PreparedHistoryChunk } from "../../packages/application/src/import-v3-history-staging.ts";
import { historyHeaderNativeReferenceEvidence } from "../../adapters/postgres/src/import-v3-history-header-native-reference-store.ts";
import { nativeCatalogueBindingEvidence } from "../../adapters/postgres/src/native-catalogue-import.ts";
import { nativePaymentBindingEvidence, nativePaymentSourceEvidence } from "../../adapters/postgres/src/native-payment-import.ts";

const must = (value: unknown): void => { if (!value) throw Error("SYNTHETIC_PREPARED_CLOSURE_FACT_CONFLICT"); };
const order = (a: HistoryClosureRow, b: HistoryClosureRow) => Buffer.compare(Buffer.from(a.relation + "\0" + a.key), Buffer.from(b.relation + "\0" + b.key));
/** PostgreSQL projection has six microsecond digits. Convert explicit original offsets
 * at whole-second precision; never round the separately retained original microseconds. */
export function syntheticClosureTimestamp(value: string | null, instant: boolean): string | null {
 if (value === null) return null;
 const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
 must(match && (instant ? match[4] !== undefined : match[4] === undefined));
 const fraction = (match![3] ?? "").padEnd(6, "0");
 if (!instant) return `${match![1]}T${match![2]}.${fraction}`;
 const utc = new Date(`${match![1]}T${match![2]}${match![4]}`).toISOString();
 must(/^\d{4}-\d{2}-\d{2}T/.test(utc)); return utc.slice(0, 19) + "." + fraction + "Z";
}
const evidence = (s: ImportSourceEvidence, provenance: unknown) => ({ id: s.id, batch_id: s.batchId, entity_type: s.entityType, source_key: s.sourceKey, file_ref: s.fileRef, sheet: s.sheet, row_no: s.rowNo, source_file_sha256: s.sourceFileSha256, row_sha256: s.rowSha256, raw_fields: s.rawFields, normalized_fields: s.normalizedFields, field_provenance: provenance });

/** Bounded small synthetic fixture, not the streaming production authorizer. */
export class SyntheticPreparedClosureFacts {
 private readonly rows = new Map<string, HistoryClosureRow>();
 private readonly batchId: string;
 private bytes = 0;
 constructor(batchId: string) { this.batchId = batchId; }
 private add(relation: string, value: unknown): void {
  const row = historyClosureProjectionRow(relation, value), p = row.projection as Record<string, unknown>;
  must(!Object.hasOwn(p, "batch_id") || p.batch_id === this.batchId);
  const key = relation + "\0" + row.key, old = this.rows.get(key);
  if (old) { must(historyClosureRowHash(old) === historyClosureRowHash(row)); return; }
  const bytes = encodeHistoryClosureValue(row).byteLength;
  must(this.rows.size < 10000 && this.bytes + bytes <= 64 * 1024 * 1024);
  // Projection validation/encoding has inspected all descriptors before this clone.
  this.rows.set(key, structuredClone(row)); this.bytes += bytes;
 }
 snapshot(): { sourceRows: HistoryClosureRow[]; typedRows: HistoryClosureRow[] } {
  const rows = structuredClone([...this.rows.values()]).sort(order);
  return { sourceRows: rows.filter(r => r.relation === "import_source_row"), typedRows: rows.filter(r => r.relation !== "import_source_row") };
 }
 parties(chunk: PreparedNativePartyImportChunk): void {
  for (const row of chunk.rows) {
   const reference = row.headerReference ? historyHeaderNativeReferenceEvidence(row.headerReference, 0) : null;
   const source = reference ? reference.source : nativePartyStandaloneImportSource(row);
   this.add("import_source_row", source); this.add(row.entity.toLowerCase(), row.nativeSnapshot);
   if (reference) this.add("import_header_native_reference", reference.reference);
   this.add("native_party_import_evidence", { batch_id: chunk.batchId, source_row_id: row.input.source.id, entity_type: row.entity, source_key: row.input.source.sourceKey,
    native_id: row.nativeId, native_snapshot: row.nativeSnapshot, source_snapshot: source, selection: { ...row.input.selection },
    warehouse_record: row.input.warehouseRecord ? { id: row.input.warehouseRecord.id, reviewedAt: row.input.warehouseRecord.reviewedAt, decisionReason: row.input.warehouseRecord.decisionReason } : null,
    authorization: row.authorization, row_fingerprint: row.fingerprint, validator_version: NATIVE_PARTY_IMPORT_VERSION,
    // Only creation_xid/imported_at are excluded by the reviewed V2 semantic matrix.
    native_hall_id: row.entity === "HALL" ? row.nativeId : null, native_customer_id: row.entity === "CUSTOMER" ? row.nativeId : null,
    native_supplier_id: row.entity === "SUPPLIER" ? row.nativeId : null, native_staff_id: row.entity === "STAFF" ? row.nativeId : null, native_warehouse_id: row.entity === "WAREHOUSE" ? row.nativeId : null });
  }
 }
 catalogue(chunk: PreparedNativeCatalogueImportChunk): void {
  const tables = { CATEGORY: "product_category", COLOR: "color", FIT: "fit", SIZE: "size", SIZE_GROUP: "size_group", SEASON: "season", SIZE_GROUP_MEMBER: "size_group_member" };
  for (const row of chunk.rows) { this.add("import_source_row", nativeCatalogueSourceEvidence(row)); this.add("import_native_catalogue_binding", nativeCatalogueBindingEvidence(row)); this.add(tables[row.entity], row.nativeSnapshot); }
 }
 products(chunk: PreparedNativeProductImportChunk): void {
  chunk.rows.forEach((_row, i) => { this.add("import_source_row", nativeProductImportEvidence(chunk, i).source); this.add("product", chunk.nativeProducts[i]); });
 }
 sku(row: PreparedNativeSkuImport): void {
  this.add("sku", row.nativeSku);
  for (const alias of row.aliases) { this.add("import_source_row", nativeSkuAliasEvidence(row, alias)); this.add("import_sku_alias", { batch_id: row.batchId, old_source_sku_id: alias.source.sourceKey, canonical_sku_id: row.nativeSku.id, source_row_id: alias.source.id, canonical_source_key: row.canonicalSource.sourceKey, mapping_basis: alias.mapping.mappingBasis }); }
 }
 stock(group: PreparedNativeStockGroup): void {
  for (const c of group.contributors) { this.add("import_source_row", nativeStockSourceEvidence(group, c)); this.add("import_stock_contributor", { batch_id: group.batchId, source_row_id: c.source.id, warehouse_id: group.warehouse.nativeId, canonical_sku_id: group.sku.nativeId, old_source_sku_id: c.lineage.oldSkuSourceId, canonical_stock_source_key: c.lineage.canonicalStockRowSourceId, source_unit: c.lineage.sourceUnit, signed_quantity: c.lineage.signedQuantity, baseline_ledger_id: null }); }
 }
 payments(chunk: PreparedNativePaymentImportChunk): void {
  for (const row of chunk.rows) { this.add("import_source_row", nativePaymentSourceEvidence(row)); this.add("import_native_payment_binding", nativePaymentBindingEvidence(row));
   if (row.entity === "PAYMENT_ACCOUNT_HALL") this.add("payment_account_hall", row.nativeSnapshot);
   else this.add(row.entity === "PAYMENT_METHOD" ? "payment_method_identity" : "payment_account_identity", { id: row.nativeSnapshot.id });
  }
 }
 headers(chunk: PreparedHistoryHeaderChunk): void {
  for (const row of chunk.rows) {
   const p = row.prepared, h = p.header;
   this.add("import_source_row", evidence(p.source, { ...p.fieldProvenance, history_header_staging: { validator_version: "V3_HISTORY_HEADER_STAGE_1", fingerprint: p.fingerprint, selection: p.selection } }));
   const common = { id: h.id, source_row_id: h.sourceRowId, batch_id: h.batchId, version: h.version, number: h.number, business_date: h.businessDate, source_status: h.sourceStatus, note: h.note,
    created_by_source_key: h.createdBySourceKey, approved_by_source_key: h.approvedBySourceKey, created_hall_id: h.createdHallId, created_hall_provenance: h.createdHallProvenance, created_hall_reason: h.createdHallReason,
    created_local_at: syntheticClosureTimestamp(h.createdLocalAt, false), updated_local_at: syntheticClosureTimestamp(h.updatedLocalAt, false), approved_local_at: syntheticClosureTimestamp(h.approvedLocalAt, false),
    created_instant: syntheticClosureTimestamp(h.createdInstant, true), updated_instant: syntheticClosureTimestamp(h.updatedInstant, true), approved_instant: syntheticClosureTimestamp(h.approvedInstant, true) };
   if ("fromWarehouseId" in h) this.add("history_transfer_header", { ...common, from_warehouse_id: h.fromWarehouseId, to_warehouse_id: h.toWarehouseId, created_role_source: h.createdRoleSource });
   else this.add("history_sales_header", { ...common, business_type: h.businessType, hall_id: h.hallId, customer_id: h.customerId, warehouse_id: h.warehouseId, salesperson_id: h.salespersonId, gross_amount: h.grossAmount, order_discount: h.orderDiscount, net_due: h.netDue });
  }
 }
 sales(chunk: PreparedHistorySalesDetailChunk): void {
  for (const row of chunk.rows) { this.add("import_source_row", evidence(row.source, { ...row.fieldProvenance, history_sales_detail_staging: { validator_version: HISTORY_SALES_DETAIL_VERSION, fingerprint: row.fingerprint, selection: { ...chunk.input.selection }, header: { ...row.header }, sku: { ...row.sku } } })); this.add("history_sales_line", row.line); }
 }
 settlements(chunk: PreparedHistorySettlementChunk): void {
  for (const row of chunk.rows) { this.add("import_source_row", evidence(row.source, { ...row.fieldProvenance, history_settlement_staging: { validator_version: HISTORY_SETTLEMENT_VERSION, fingerprint: row.fingerprint, selection: { ...chunk.input.selection }, header: { ...row.header }, account: { ...row.account }, method: row.method ? { ...row.method } : null } })); this.add("history_sales_settlement", row.settlement); }
 }
 transfers(chunk: PreparedHistoryChunk): void {
  for (const row of chunk.rows) { const s = row.source; this.add("import_source_row", evidence(s, { ...s.fieldProvenance, history_staging: { validator_version: "V3_TRANSFER_LINE_STAGE_1", fingerprint: row.fingerprint, selection: chunk.selection } })); this.add("history_transfer_line", row.line); }
 }
}
