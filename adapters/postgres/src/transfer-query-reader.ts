import { normalDocumentListOn, documentProductSummary, normalNullableQuantity, type NativeDocumentListOptions } from "./sales-query-reader.ts";
import { checkedNativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import type { TransferUnifiedListPage, TransferUnifiedSummary } from "../../../packages/application/src/transfer-query-ports.ts";
import type { Pool } from "pg";
import type { TransferLineRow } from "../../../packages/domain/src/documents.ts";
import type { EntityId, EntityKind } from "../../../packages/domain/src/values.ts";
import { businessDate, entityId } from "../../../packages/domain/src/values.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import type { RuntimeTransferHeader } from "../../../packages/application/src/transfer-ports.ts";
import type { TransferCatalogSku, TransferDetail, TransferDetailCatalog, TransferDetailQuery, TransferHistoryPage, TransferHistoryQuery, TransferListPage, TransferListQuery, TransferReadScope, TransferReferenceNames, TransferScopedRead, TransferSummary, TransferWarehousePage, TransferWarehouseQuery, TrustedTransferSnapshotReader } from "../../../packages/application/src/transfer-query-ports.ts";
import { activeTransferRead, checkedTransferReadScope, parseTransferDetailQuery, parseTransferHistoryQuery, parseTransferListQuery, parseTransferWarehouseQuery } from "../../../packages/application/src/transfer-query-validation.ts";
import { booleanValue, integerValue, nullableString, quantityFromSql, stringValue, versionFromSql } from "./codec.ts";

export interface PgTransferQueryResult { readonly rows: Record<string, unknown>[]; readonly rowCount: number | null }
export interface PgTransferQueryClient { query(text: string, values?: unknown[]): Promise<PgTransferQueryResult>; release(error?: Error | boolean): void }
export interface PgTransferQueryPool { connect(): Promise<PgTransferQueryClient> }
type PgPoolCompatibility = Pool extends PgTransferQueryPool ? true : never;
const pgPoolCompatibility: PgPoolCompatibility = true; void pgPoolCompatibility;
/** Technical response bound only. Overflow is rejected, never returned as a truncated document. */
export const TRANSFER_DETAIL_MAX_CURRENT_LINES = 2000;
export const TRANSFER_DETAIL_MAX_CATALOG_SKUS = 20_000;
export const TRANSFER_DETAIL_MAX_SIZE_MEMBERS = 20_000;
const id = <K extends EntityKind>(kind: K, value: unknown): EntityId<K> => entityId(kind, stringValue(value));
const nullableId = <K extends EntityKind>(kind: K, value: unknown): EntityId<K> | null => value === null ? null : id(kind, value);
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  requireDomain(typeof value === "string" && choices.includes(value as T), "INVALID_DATABASE_VALUE", "Unexpected persisted transfer enum"); return value as T;
}
function count(value: unknown): bigint {
  requireDomain(typeof value === "string" && /^(0|[1-9]\d*)$/.test(value), "INVALID_DATABASE_VALUE", "An exact nonnegative SQL count is required"); return BigInt(value);
}
const stamp = (column: string): string => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const SUMMARY_COLUMNS = `h.id, h.number, to_char(h.business_date, 'YYYY-MM-DD') AS business_date,
  h.responsible_staff_id, h.from_warehouse_id, h.to_warehouse_id, h.status, h.version, h.created_by_account_id, ${stamp("h.created_at")} AS created_at, ${stamp("h.updated_at")} AS updated_at`;
const HEADER_COLUMNS = `${SUMMARY_COLUMNS}, h.note, h.created_hall_id, h.created_role,
  h.approved_by_account_id, ${stamp("h.approved_at")} AS approved_at, h.stock_basis`;
const REFERENCES = `fw.name AS from_warehouse_name, tw.name AS to_warehouse_name, fh.name AS from_hall_name, th.name AS to_hall_name,
  responsible.name AS responsible_name, creator.name AS created_by_name, approver.name AS approved_by_name`;
/** Count and page use the SAME native relation joins; a missing reference is not a fabricated display label. */
const RELATIONS = `FROM naijue_erp.transfer_header h
  JOIN naijue_erp.warehouse fw ON fw.id = h.from_warehouse_id JOIN naijue_erp.warehouse tw ON tw.id = h.to_warehouse_id
  JOIN naijue_erp.hall fh ON fh.id = fw.hall_id JOIN naijue_erp.hall th ON th.id = tw.hall_id
  JOIN naijue_erp.user_account ca ON ca.id = h.created_by_account_id JOIN naijue_erp.staff creator ON creator.id = ca.staff_id
  LEFT JOIN naijue_erp.staff responsible ON responsible.id=h.responsible_staff_id
  LEFT JOIN naijue_erp.user_account aa ON aa.id = h.approved_by_account_id LEFT JOIN naijue_erp.staff approver ON approver.id = aa.staff_id`;
function decodeReferences(row: Record<string, unknown>): TransferReferenceNames {
  return { responsibleName: nullableString(row.responsible_name), fromWarehouseName: stringValue(row.from_warehouse_name), toWarehouseName: stringValue(row.to_warehouse_name),
    fromHallName: stringValue(row.from_hall_name), toHallName: stringValue(row.to_hall_name), createdByName: stringValue(row.created_by_name), approvedByName: nullableString(row.approved_by_name) };
}
function decodeSummary(row: Record<string, unknown>, totalQuantity: bigint): TransferSummary {
  return { id: id("transfer", row.id), number: stringValue(row.number), businessDate: businessDate(stringValue(row.business_date)),
    fromWarehouseId: id("warehouse", row.from_warehouse_id), toWarehouseId: id("warehouse", row.to_warehouse_id),
    status: choice(row.status, ["DRAFT", "APPROVED", "VOID"]), version: versionFromSql(row.version),
    responsibleStaffId: nullableId("staff", row.responsible_staff_id), createdByAccountId: id("account", row.created_by_account_id), createdAt: stringValue(row.created_at), updatedAt: stringValue(row.updated_at), totalQuantity, ...decodeReferences(row) };
}
function decodeHeader(row: Record<string, unknown>): RuntimeTransferHeader {
  const fromWarehouseId = id("warehouse", row.from_warehouse_id); const toWarehouseId = id("warehouse", row.to_warehouse_id);
  requireDomain(fromWarehouseId !== toWarehouseId, "INVALID_DATABASE_VALUE", "Persisted transfer warehouses must differ");
  return { id: id("transfer", row.id), number: stringValue(row.number), businessDate: businessDate(stringValue(row.business_date)), fromWarehouseId, toWarehouseId,
    status: choice(row.status, ["DRAFT", "APPROVED", "VOID"]), version: versionFromSql(row.version), note: nullableString(row.note),
    responsibleStaffId: nullableId("staff", row.responsible_staff_id), createdByAccountId: id("account", row.created_by_account_id), createdHallId: nullableId("hall", row.created_hall_id),
    createdRole: choice(row.created_role, ["ADMIN", "WAREHOUSE", "SALESPERSON"]), createdAt: stringValue(row.created_at), updatedAt: stringValue(row.updated_at),
    approvedByAccountId: nullableId("account", row.approved_by_account_id), approvedAt: nullableString(row.approved_at) };
}
function decodeLine(row: Record<string, unknown>): TransferLineRow {
  const quantity = quantityFromSql(row.quantity); const lineNo = integerValue(row.line_no); const isCurrent = booleanValue(row.is_current);
  requireDomain(quantity > 0n && lineNo > 0 && isCurrent, "INVALID_DATABASE_VALUE", "Expected positive current actual transfer line");
  return { id: id("transferLine", row.id), transferId: id("transfer", row.transfer_id), lineNo, skuId: id("sku", row.sku_id), quantity, isCurrent,
    snapshot: { productCode: stringValue(row.product_code_snapshot), productName: stringValue(row.product_name_snapshot), colorName: stringValue(row.color_name_snapshot),
      fitName: stringValue(row.fit_name_snapshot), sizeName: stringValue(row.size_name_snapshot), barcode: nullableString(row.barcode_snapshot) } };
}
/** Only internal static columns enter SQL. All policy/filter/target/pagination values are parameters. */
class Predicate {
  readonly values: unknown[] = []; readonly parts: string[] = [];
  parameter(value: unknown): string { this.values.push(value); return `$${this.values.length}`; }
  constructor(scope: TransferReadScope) {
    if (scope.kind === "all") this.parts.push("TRUE");
    else {
      const columns = { fromHallId: "fw.hall_id", toHallId: "tw.hall_id", fromWarehouseId: "h.from_warehouse_id", toWarehouseId: "h.to_warehouse_id",
        createdByAccountId: "h.created_by_account_id", createdHallId: "h.created_hall_id", createdRole: "h.created_role" } as const;
      this.parts.push(`(${scope.clauses.map(clause => `(${Object.entries(columns).flatMap(([key, column]) => {
        const value = clause[key as keyof typeof columns]; return value === undefined ? [] : [`${column} = ${this.parameter(value)}${key === "createdRole" ? "" : "::uuid"}`];
      }).join(" AND ")})`).join(" OR ")})`);
    }
  }
  filter(query: TransferListQuery): void {
    const f = query.filter;
    for (const [value, expression] of [[f.startDate, "h.business_date >="], [f.endDate, "h.business_date <="]] as const) {
      if (value !== null) this.parts.push(`${expression} ${this.parameter(value)}`);
    }
    for (const [values, column, cast] of [[f.statuses, "h.status", "text"], [f.fromWarehouseIds, "h.from_warehouse_id", "uuid"],
      [f.toWarehouseIds, "h.to_warehouse_id", "uuid"]] as const) {
      if (values.length) this.parts.push(`${column} = ANY(${this.parameter([...values])}::${cast}[])`);
    }
    if (f.number !== null) this.parts.push(`strpos(lower(h.number), lower(${this.parameter(f.number)}::text)) > 0`);
  }
  target(transferId: string): void { this.parts.push(`h.id = ${this.parameter(transferId)}::uuid`); }
  where(): string { return this.parts.join(" AND "); }
  page(page: number, pageSize: number): string { return `LIMIT ${this.parameter(pageSize)} OFFSET ${this.parameter(String((page - 1) * pageSize))}::bigint`; }
}
type ReadQuery = (sql: string, values?: unknown[]) => Promise<PgTransferQueryResult>;
function one(result: PgTransferQueryResult): Record<string, unknown> {
  requireDomain(result.rows.length === 1, "INVALID_DATABASE_VALUE", "Expected exactly one SQL row"); return result.rows[0]!;
}
function decodeCatalogSku(row: Record<string, unknown>): TransferCatalogSku {
  return { skuId: id("sku", row.sku_id), productId: id("product", row.product_id), productCode: stringValue(row.product_code), productName: stringValue(row.product_name),
    colorId: id("color", row.color_id), colorName: stringValue(row.color_name), fitId: id("fit", row.fit_id), fitName: stringValue(row.fit_name),
    sizeId: id("size", row.size_id), sizeGroupId: id("sizeGroup", row.size_group_id) };
}
function consistentIdentity(facts: Map<string, string>, identity: string, values: readonly unknown[]): void {
  const fact = JSON.stringify(values); const previous = facts.get(identity);
  requireDomain(previous === undefined || previous === fact, "INVALID_DATABASE_VALUE", "Inconsistent canonical identity facts");
  facts.set(identity, fact);
}
async function readCatalog(query: ReadQuery, lines: readonly TransferLineRow[]): Promise<TransferDetailCatalog> {
  if (!lines.length) return { skus: [], sizeGroups: [] };
  const actualSkuIds = [...new Set(lines.map(line => line.skuId))];
  const rows = (await query(`SELECT s.id AS sku_id, s.product_id, p.product_code, p.name AS product_name, s.color_id, c.name AS color_name,
    s.fit_id, f.name AS fit_name, s.size_id, p.size_group_id FROM naijue_erp.sku s
    JOIN (SELECT DISTINCT product_id, color_id, fit_id FROM naijue_erp.sku WHERE id = ANY($1::uuid[])) present
      ON present.product_id = s.product_id AND present.color_id = s.color_id AND present.fit_id = s.fit_id
    JOIN naijue_erp.product p ON p.id = s.product_id JOIN naijue_erp.color c ON c.id = s.color_id JOIN naijue_erp.fit f ON f.id = s.fit_id
    ORDER BY s.product_id, s.color_id, s.fit_id, s.size_id, s.id LIMIT $2`, [actualSkuIds, TRANSFER_DETAIL_MAX_CATALOG_SKUS + 1])).rows;
  requireDomain(rows.length <= TRANSFER_DETAIL_MAX_CATALOG_SKUS, "TRANSFER_READ_TOO_LARGE", "Transfer native SKU availability exceeds bounded response limit");
  const skus = rows.map(decodeCatalogSku); const bySku = new Map(skus.map(sku => [sku.skuId, sku]));
  const tuple = (sku: TransferCatalogSku) => JSON.stringify([sku.productId, sku.colorId, sku.fitId]);
  const actualTuples = new Set(actualSkuIds.map(skuId => { const sku = bySku.get(skuId);
    requireDomain(sku !== undefined, "INVALID_DATABASE_VALUE", "Missing current-line native SKU identity"); return tuple(sku); }));
  const coordinates = new Set(skus.map(sku => JSON.stringify([sku.productId, sku.colorId, sku.fitId, sku.sizeId])));
  requireDomain(bySku.size === skus.length && coordinates.size === skus.length && skus.every(sku => actualTuples.has(tuple(sku))),
    "INVALID_DATABASE_VALUE", "Invalid native SKU availability identities");
  const products = new Map<string, string>(); const colors = new Map<string, string>(); const fits = new Map<string, string>();
  for (const sku of skus) {
    consistentIdentity(products, sku.productId, [sku.productCode, sku.productName, sku.sizeGroupId]);
    consistentIdentity(colors, sku.colorId, [sku.colorName]); consistentIdentity(fits, sku.fitId, [sku.fitName]);
  }
  const groupIds = [...new Set(skus.map(sku => sku.sizeGroupId))];
  const members = (await query(`SELECT g.id AS size_group_id, g.code AS group_code, g.name AS group_name, m.size_id,
    z.code AS size_code, z.name AS size_name, m.display_order FROM naijue_erp.size_group g
    JOIN naijue_erp.size_group_member m ON m.size_group_id = g.id JOIN naijue_erp.size z ON z.id = m.size_id
    WHERE g.id = ANY($1::uuid[]) ORDER BY g.id, m.display_order, z.id LIMIT $2`, [groupIds, TRANSFER_DETAIL_MAX_SIZE_MEMBERS + 1])).rows;
  requireDomain(members.length <= TRANSFER_DETAIL_MAX_SIZE_MEMBERS, "TRANSFER_READ_TOO_LARGE", "Transfer full size groups exceed bounded response limit");
  const groups = new Map<EntityId<"sizeGroup">, { sizeGroupId: EntityId<"sizeGroup">; code: string; name: string; members: { sizeId: EntityId<"size">; code: string | null; name: string; displayOrder: number }[] }>();
  const groupSet = new Set(groupIds); const membership = new Set<string>(); const sizes = new Map<string, string>();
  for (const row of members) {
    const sizeGroupId = id("sizeGroup", row.size_group_id); const sizeId = id("size", row.size_id);
    const code = stringValue(row.group_code); const name = stringValue(row.group_name); const key = JSON.stringify([sizeGroupId, sizeId]);
    requireDomain(groupSet.has(sizeGroupId) && !membership.has(key), "INVALID_DATABASE_VALUE", "Invalid native size membership identity");
    let group = groups.get(sizeGroupId); if (!group) { group = { sizeGroupId, code, name, members: [] }; groups.set(sizeGroupId, group); }
    requireDomain(group.code === code && group.name === name, "INVALID_DATABASE_VALUE", "Inconsistent native size group labels");
    const sizeCode = nullableString(row.size_code); const sizeName = stringValue(row.size_name); consistentIdentity(sizes, sizeId, [sizeCode, sizeName]);
    group.members.push({ sizeId, code: sizeCode, name: sizeName, displayOrder: integerValue(row.display_order) }); membership.add(key);
  }
  requireDomain(groups.size === groupIds.length && skus.every(sku => membership.has(JSON.stringify([sku.sizeGroupId, sku.sizeId]))),
    "INVALID_DATABASE_VALUE", "Native SKU size must belong to its complete product size group");
  return { skus, sizeGroups: [...groups.values()] };
}
/** Injected protocol only. Construction does not create a Pool, connect, migrate, or listen.
 * Each invocation uses one acquired client and one read-only REPEATABLE READ snapshot. */
export class PostgresTransferQueryReader implements TrustedTransferSnapshotReader {
  private readonly pool: PgTransferQueryPool;
  private readonly normalLists: NativeDocumentListOptions | undefined;
  constructor(pool: PgTransferQueryPool, normalLists?: NativeDocumentListOptions) {
    if (normalLists !== undefined) {
      const runtime26 = checkedNativeRuntime26Capability(normalLists.runtime26);
      if (normalLists.profile !== "source-confirmed-normal-document-lists-v1" || runtime26 === undefined) throw new TypeError("Explicit original runtime and normal-list historical policy required");
      this.normalLists = { profile: normalLists.profile, runtime26 };
    }
    if (typeof pool?.connect !== "function") throw new TypeError("Transfer query reader requires an explicit PostgreSQL pool"); this.pool = pool;
  }
  private async snapshot<T>(signal: AbortSignal, work: (query: ReadQuery, client: PgTransferQueryClient) => Promise<T>): Promise<T> {
    activeTransferRead(signal);
    const client = await this.pool.connect(); let began = false; let committing = false; let discard: Error | undefined;
    const query: ReadQuery = (sql, values = []) => { activeTransferRead(signal); return client.query(sql, values); };
    try {
      activeTransferRead(signal); await query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); began = true;
      const result = await work(query, client); activeTransferRead(signal); committing = true; await query("COMMIT"); return result;
    } catch (error) {
      if (!began || committing) discard = error instanceof Error ? error : new Error("Transfer snapshot failed");
      if (began) {
        try { await client.query("ROLLBACK"); }
        catch (rollbackError) {
          discard = rollbackError instanceof Error ? rollbackError : new Error("Transfer snapshot rollback failed");
          throw new AggregateError([error, rollbackError], "Transfer read and rollback failed; client discarded");
        }
      }
      throw error;
    } finally { client.release(discard); }
  }
  async readList(read: TransferScopedRead<TransferListQuery>): Promise<TransferListPage | TransferUnifiedListPage> {
    const parameters = parseTransferListQuery(read.parameters); const p = new Predicate(checkedTransferReadScope(read.scope));
    if (this.normalLists !== undefined) return this.snapshot(read.signal, async (_query, client) => {
      const result = await normalDocumentListOn(client, this.normalLists!, "transfers", { ...read, parameters }, { from: RELATIONS.replace(/^FROM /, ""), columns: `${SUMMARY_COLUMNS},${REFERENCES}`, scope: p.where(), values: p.values });
      const items: TransferUnifiedSummary[] = result.rows.map(row => {
        const documentId = id("transfer", row.id), effectiveVersion = versionFromSql(row.version), productSummary = documentProductSummary(row);
        if (row.dataset === "LIVE") { requireDomain(row.batch_id === null, "INVALID_DATABASE_VALUE", "LIVE has no import batch");
          return { ...decodeSummary(row, count(row.quantity)), dataset: "LIVE", batchId: null, documentId, effectiveVersion, productSummary }; }
        requireDomain(row.dataset === "HISTORY" && row.created_by_account_id === null, "INVALID_DATABASE_VALUE", "Historical actor account is not inferred from current staff");
        return { dataset: "HISTORY", batchId: id("operation", row.batch_id), id: documentId, documentId, version: effectiveVersion, effectiveVersion, productSummary,
          number: stringValue(row.number), businessDate: row.business_date === null ? null : businessDate(stringValue(row.business_date)), status: choice(row.status, ["DRAFT", "APPROVED", "VOID"]),
          fromWarehouseId: id("warehouse", row.from_warehouse_id), toWarehouseId: id("warehouse", row.to_warehouse_id), responsibleStaffId: nullableId("staff", row.responsible_staff_id), responsibleName: nullableString(row.responsible_name),
          createdByAccountId: null, createdByName: nullableString(row.created_by_name), approvedByName: nullableString(row.approved_by_name), createdAt: nullableString(row.created_at), updatedAt: nullableString(row.updated_at),
          createdLocalAt: nullableString(row.created_local_at), updatedLocalAt: nullableString(row.updated_local_at), fromWarehouseName: nullableString(row.from_warehouse_name), toWarehouseName: nullableString(row.to_warehouse_name),
          fromHallName: nullableString(row.from_hall_name), toHallName: nullableString(row.to_hall_name), totalQuantity: normalNullableQuantity(row.quantity) };
      });
      return { page: parameters.page, pageSize: parameters.pageSize, exactTotal: result.exactTotal, items, historyCoverage: result.historyCoverage, totals: { totalQuantity: normalNullableQuantity(result.totals.quantity) } };
    });
    p.filter(parameters);
    return this.snapshot(read.signal, async query => {
      const exactTotal = count(one(await query(`SELECT COUNT(*)::text AS exact_total ${RELATIONS} WHERE ${p.where()}`, [...p.values])).exact_total);
      const paging = p.page(parameters.page, parameters.pageSize);
      const rows = (await query(`SELECT ${SUMMARY_COLUMNS}, ${REFERENCES} ${RELATIONS} WHERE ${p.where()}
        ORDER BY h.updated_at DESC, h.number COLLATE "C" ASC, h.id ASC ${paging}`, p.values)).rows;
      requireDomain(rows.length <= parameters.pageSize && BigInt(rows.length) <= exactTotal, "INVALID_DATABASE_VALUE", "Transfer page exceeds exact scope");
      const pageIds = rows.map(row => id("transfer", row.id)); const totals = new Map<EntityId<"transfer">, bigint>();
      requireDomain(new Set(pageIds).size === pageIds.length, "INVALID_DATABASE_VALUE", "Duplicate transfer page identity");
      if (pageIds.length) {
        const aggregates = (await query(`SELECT page.id AS transfer_id, COALESCE(SUM(l.quantity), 0)::text AS total_quantity
          FROM unnest($1::uuid[]) AS page(id) LEFT JOIN naijue_erp.transfer_line l ON l.transfer_id = page.id AND l.is_current
          GROUP BY page.id`, [pageIds])).rows;
        for (const row of aggregates) { const transferId = id("transfer", row.transfer_id);
          requireDomain(pageIds.includes(transferId) && !totals.has(transferId), "INVALID_DATABASE_VALUE", "Unexpected transfer aggregate identity");
          totals.set(transferId, count(row.total_quantity)); }
        requireDomain(totals.size === pageIds.length, "INVALID_DATABASE_VALUE", "Missing transfer page quantity aggregate");
      }
      return { page: parameters.page, pageSize: parameters.pageSize, exactTotal, items: rows.map((row, index) => decodeSummary(row, totals.get(pageIds[index]!)!)) };
    });
  }
  async readWarehouses(read: TransferScopedRead<TransferWarehouseQuery>): Promise<TransferWarehousePage> {
    const parameters = parseTransferWarehouseQuery(read.parameters); const scope = checkedTransferReadScope(read.scope); const p = new Predicate(scope);
    // Broad warehouse-catalog visibility is explicit only for all scope. Restricted scopes use complete authorized document relations.
    const authorized = scope.kind === "all" ? "TRUE" : `EXISTS (SELECT 1 ${RELATIONS} WHERE (${p.where()}) AND (h.from_warehouse_id = w.id OR h.to_warehouse_id = w.id))`;
    const restrictions = [authorized];
    if (parameters.search) { const search = p.parameter(parameters.search); restrictions.push(`(strpos(w.name, ${search}) > 0 OR strpos(wh.name, ${search}) > 0)`); }
    if (parameters.selectedIds.length) restrictions.push(`w.id = ANY(${p.parameter([...parameters.selectedIds])}::uuid[])`);
    const relation = `FROM naijue_erp.warehouse w JOIN naijue_erp.hall wh ON wh.id = w.hall_id WHERE ${restrictions.join(" AND ")}`;
    return this.snapshot(read.signal, async query => {
      const exactTotal = count(one(await query(`SELECT COUNT(*)::text AS exact_total ${relation}`, [...p.values])).exact_total);
      const paging = p.page(parameters.page, parameters.pageSize);
      const rows = (await query(`SELECT w.id, w.name, w.hall_id, wh.name AS hall_name, w.enabled, wh.enabled AS hall_enabled ${relation}
        ORDER BY w.name, w.id ${paging}`, p.values)).rows;
      requireDomain(rows.length <= parameters.pageSize && BigInt(rows.length) <= exactTotal, "INVALID_DATABASE_VALUE", "Warehouse reference page exceeds exact authorized relation");
      const items = rows.map(row => ({ id: id("warehouse", row.id), name: stringValue(row.name), hallId: id("hall", row.hall_id), hallName: stringValue(row.hall_name),
        enabled: booleanValue(row.enabled), hallEnabled: booleanValue(row.hall_enabled) }));
      requireDomain(new Set(items.map(item => item.id)).size === items.length, "INVALID_DATABASE_VALUE", "Duplicate warehouse reference identity");
      return { page: parameters.page, pageSize: parameters.pageSize, exactTotal, items };
    });
  }
  async readHistory(read: TransferScopedRead<TransferHistoryQuery>): Promise<TransferHistoryPage> {
    const parameters = parseTransferHistoryQuery(read.parameters);
    const p = new Predicate(checkedTransferReadScope(read.scope)); p.target(parameters.transferId);
    return this.snapshot(read.signal, async query => {
      const target = await query(`SELECT h.id ${RELATIONS} WHERE ${p.where()}`, [...p.values]);
      requireDomain(target.rows.length > 0, "DOCUMENT_NOT_FOUND", "Transfer document is unavailable");
      requireDomain(id("transfer", one(target).id) === parameters.transferId, "INVALID_DATABASE_VALUE", "Unexpected transfer history target");
      const source = `${RELATIONS} JOIN naijue_erp.audit_change a ON a.object_id = h.id AND a.object_type = 'TRANSFER' WHERE ${p.where()}`;
      const exactTotal = count(one(await query(`SELECT COUNT(*)::text AS exact_total ${source}`, [...p.values])).exact_total);
      const paging = p.page(parameters.page, parameters.pageSize);
      const rows = (await query(`SELECT a.id, a.operation_id, a.actor_account_id, a.action, ${stamp("a.occurred_at")} AS occurred_at,
        a.old_version, a.new_version ${source} ORDER BY a.occurred_at DESC, a.id DESC ${paging}`, p.values)).rows;
      requireDomain(rows.length <= parameters.pageSize && (rows.length === 0
        || BigInt((parameters.page - 1) * parameters.pageSize) + BigInt(rows.length) <= exactTotal),
        "INVALID_DATABASE_VALUE", "Transfer history exceeds exact authorized page");
      const items = rows.map(row => ({ id: id("audit", row.id), operationId: id("operation", row.operation_id),
        actorAccountId: id("account", row.actor_account_id), action: choice(row.action, ["SAVE", "APPROVE", "UNAPPROVE", "VOID"]),
        occurredAt: stringValue(row.occurred_at), oldVersion: row.old_version === null ? null : versionFromSql(row.old_version), newVersion: versionFromSql(row.new_version) }));
      requireDomain(new Set(items.map(item => item.id)).size === items.length, "INVALID_DATABASE_VALUE", "Duplicate transfer audit identity");
      return { ...parameters, exactTotal, items };
    });
  }
  async readDetail(read: TransferScopedRead<TransferDetailQuery>): Promise<TransferDetail> {
    const parameters = parseTransferDetailQuery(read.parameters); const p = new Predicate(checkedTransferReadScope(read.scope)); p.target(parameters.transferId);
    return this.snapshot(read.signal, async query => {
      const result = await query(`SELECT ${HEADER_COLUMNS}, ${REFERENCES} ${RELATIONS} WHERE ${p.where()}`, p.values);
      requireDomain(result.rows.length > 0, "DOCUMENT_NOT_FOUND", "Transfer document is unavailable");
      const row = one(result); const header = decodeHeader(row);
      requireDomain(header.id === parameters.transferId, "INVALID_DATABASE_VALUE", "Unexpected transfer target");
      const rows = (await query(`SELECT id, transfer_id, line_no, sku_id, quantity::text, product_code_snapshot, product_name_snapshot,
        color_name_snapshot, fit_name_snapshot, size_name_snapshot, barcode_snapshot, is_current FROM naijue_erp.transfer_line
        WHERE transfer_id = $1 AND is_current ORDER BY line_no, id LIMIT $2`, [header.id, TRANSFER_DETAIL_MAX_CURRENT_LINES + 1])).rows;
      requireDomain(rows.length <= TRANSFER_DETAIL_MAX_CURRENT_LINES, "TRANSFER_READ_TOO_LARGE", "Transfer detail exceeds bounded response limit");
      const lines = rows.map(decodeLine); const ids = new Set<string>(); const positions = new Set<number>();
      requireDomain(lines.every(line => { const valid = line.transferId === header.id && !ids.has(line.id) && !positions.has(line.lineNo);
        ids.add(line.id); positions.add(line.lineNo); return valid; }), "INVALID_DATABASE_VALUE", "Invalid transfer line ownership or identity");
      const catalog = await readCatalog(query, lines);
      return { document: { header, lines }, stockBasis: choice(row.stock_basis, ["RUNTIME_LEDGER", "CUTOFF_HISTORY"]), references: decodeReferences(row), catalog };
    });
  }
}
