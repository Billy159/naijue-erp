/** SYNTHETIC original UOW/maintained-proof protocol; no database or real readiness. */
import { CATALOGUE_PRICE_KEYS } from "../../packages/application/src/catalogue-price-input.ts";
import { PostgresSalesUnitOfWork } from "../../adapters/postgres/src/sales-unit-of-work.ts";
import type { PgSalesClient } from "../../adapters/postgres/src/sales-unit-of-work.ts";
import type { NativeRuntime26Capability } from "../../packages/application/src/native-import-schema-contract.ts";
import type { SalesDocument } from "../../packages/domain/src/documents.ts";
import { moneyToSql } from "../../adapters/postgres/src/codec.ts";
import type { SalesTransaction } from "../../packages/application/src/ports.ts";
import { sid, ids, syntheticDraft } from "./synthetic-fixtures.ts";
const prices = () => Object.fromEntries(CATALOGUE_PRICE_KEYS.map(key => [key, key === "retail_price" ? "1.25" : null]));
type H06Facts = Record<string, unknown>;
export const h06 = { product: sid("product", 610), sku: sid("sku", 611), code: sid("barcode", 612), category: sid("category", 613), group: sid("sizeGroup", 614), color: sid("color", 615), fit: sid("fit", 616), size: sid("size", 617), scheme: sid("product", 618), operation: sid("operation", 619), batch: sid("product", 620), image: sid("product", 621) };
const h06Root = (v = 1): H06Facts => ({ id: h06.product, product_code: "SYNTHETIC-H06", name: "SYNTHETIC COMPLETE", category_id: h06.category, supplier_id: null, season_id: null,
  size_group_id: h06.group, year: null, system_item_code: null, thickness: null, collar_pants_type: null, default_barcode_scheme_id: h06.scheme,
  enabled: true, version: v, deleted_at: null, ...prices(), season_ids: [] });
const h06Sku = (operation: string | null = h06.operation): H06Facts => ({ id: h06.sku, product_id: h06.product, color_id: h06.color, fit_id: h06.fit, size_id: h06.size, sku_code: "SYNTHETIC-H06-SKU", enabled: true, version: 1, created_operation_id: operation });
const h06Code = (): H06Facts => ({ id: h06.code, barcode: "001-SYNTHETIC-H06", sku_id: h06.sku, barcode_kind: "MAIN", scheme_id: h06.scheme, enabled: true });
function h06Audit(v: number, before: H06Facts | null, after: H06Facts): H06Facts {
  const op = v === 1 ? h06.operation : sid("operation", 700 + v), actor = sid("account", 624);
  return { id: sid("audit", 800 + v), operation_id: op, actor_account_id: actor, object_type: "PRODUCT", object_id: h06.product, action: v === 1 ? "CREATE" : "EDIT", old_version: v === 1 ? null : v - 1, new_version: v,
    before_values: structuredClone(before), after_values: structuredClone(after), occurred_at: "2026-10-22T00:00:00.000Z", receipt_id: op, receipt_actor: actor, target_type: "PRODUCT", target_id: h06.product, receipt_action: v === 1 ? "CREATE" : "EDIT", status: "COMMITTED",
    request_key: "SYNTHETIC-H06-" + v, request_hash: "c".repeat(64), result_data: { operationId: op, kind: "PRODUCT", targetId: h06.product, version: v }, completed_at: "2026-10-22T00:00:00.000000Z", committed_before: true };
}
interface H06Fixture { root: H06Facts; audits: H06Facts[]; sources: H06Facts[]; skus: H06Facts[]; codes: H06Facts[]; images: H06Facts[]; importSkus: H06Facts[]; importCodes: H06Facts[] }
function h06Native(): H06Fixture {
  const sku = h06Sku(), code = h06Code(), root = h06Root();
  return { root, audits: [h06Audit(1, null, { ...root, skus: [sku], barcodes: [code] })], sources: [], skus: [{ facts: sku, native_creation_valid: true, committed_before: true }], codes: [{ facts: code, committed_before: true }], images: [], importSkus: [], importCodes: [] };
}

export const labels = { productCode: "SYNTHETIC-H06", productName: "SYNTHETIC COMPLETE", colorName: "SYNTHETIC COLOR", fitName: "SYNTHETIC FIT", sizeName: "SYNTHETIC SIZE", barcode: "001-SYNTHETIC-H06" };
export function cacheDraft() {
  const d = syntheticDraft();
  return { ...d, lines: d.lines.map(l => ({ ...l, skuId: h06.sku, snapshot: { ...labels } })) };
}
export function salesFactsFixture() {
  const f = h06Native(), calls: string[] = [], writes: { sql: string; values: unknown[] }[] = [], logical = { facts: 0, snapshots: 0 };
  let failTag: string | undefined, pause: { tag: string; wait: Promise<void> } | undefined;
  let allocation = false;
  let historical: SalesDocument | undefined;
  const client: PgSalesClient = { async query(sql, values = []) {
    calls.push(sql);
    if (/^(?:INSERT|UPDATE|DELETE)\b/.test(sql)) writes.push({ sql, values: structuredClone(values) });
    if (pause && sql.includes(pause.tag)) await pause.wait;
    if (failTag && sql.includes(failTag)) { failTag = undefined; throw Error("SYNTHETIC read failed"); }
    let rows: Record<string, unknown>[] = [];
    if (sql.includes("FROM naijue_erp.sales_header") && historical) {
      const h = historical.header;
      rows = [{ id: h.id, number: h.number, business_type: h.businessType, business_date: h.businessDate, hall_id: h.hallId, customer_id: h.customerId, salesperson_id: h.salespersonId, warehouse_id: h.warehouseId,
        responsible_staff_id: h.responsibleStaffId, status: h.status, version: h.version, gross_amount: moneyToSql(h.grossAmount), order_discount: moneyToSql(h.orderDiscount), net_due: moneyToSql(h.netDue), note: h.note,
        created_by_account_id: h.createdByAccountId, created_hall_id: h.createdHallId, created_at: h.createdAt, updated_at: h.updatedAt, approved_by_account_id: h.approvedByAccountId, approved_at: h.approvedAt, stock_basis: "CUTOFF_HISTORY" }];
    } else if (sql.includes("FROM naijue_erp.sales_line") && historical) rows = historical.lines.map(l => ({ id: l.id, sales_id: l.salesId, line_no: l.lineNo, sku_id: l.skuId, quantity: l.quantity.toString(), reference_price: l.referencePrice === null ? null : moneyToSql(l.referencePrice), deal_price: moneyToSql(l.dealPrice), line_amount: moneyToSql(l.lineAmount), allocated_discount: moneyToSql(l.allocatedDiscount), is_gift: l.isGift, pricing_rule: l.pricingRule, discount_tenths: l.discountTenths, zero_confirmed: l.zeroConfirmed, is_current: l.isCurrent,
      product_code_snapshot: l.snapshot.productCode, product_name_snapshot: l.snapshot.productName, color_name_snapshot: l.snapshot.colorName, fit_name_snapshot: l.snapshot.fitName, size_name_snapshot: l.snapshot.sizeName, barcode_snapshot: l.snapshot.barcode }));
    else if (sql.includes("FROM naijue_erp.sales_settlement") && historical) rows = historical.settlements.map(r => ({ id: r.id, sales_id: r.salesId, line_no: r.lineNo, payment_account_id: r.paymentAccountId, payment_method_id_snapshot: r.paymentMethodId, direction: r.direction, amount: moneyToSql(r.amount) }));
    else if (sql.includes("maintained-catalogue26:roots")) rows = [{ ...f.root, committed_before: true }];
    else if (sql.includes("maintained-catalogue26:product-source")) rows = f.sources;
    else if (sql.includes("maintained-catalogue26:chain")) rows = f.audits;
    else if (sql.includes("maintained-catalogue26:import-skus")) rows = f.importSkus;
    else if (sql.includes("maintained-catalogue26:import-barcodes")) rows = f.importCodes;
    else if (sql.includes("maintained-catalogue26:skus")) rows = f.skus;
    else if (sql.includes("maintained-catalogue26:barcodes")) rows = f.codes;
    else if (sql.includes("maintained-catalogue26:images")) rows = f.images;
    else if (sql.includes("maintained-catalogue26:reference:")) rows = (values[0] as string[]).map(id => ({ facts: { id } }));
    else if (sql.includes("maintained-catalogue26:category")) rows = [{ id: h06.category, parent_id: null, deleted_at: null }];
    else if (sql.includes("maintained-catalogue26:membership") || sql.includes("native-sales-facts:membership")) rows = [{ size_group_id: h06.group, size_id: h06.size }];
    else if (sql.includes("sales:current-schema")) rows = [{ current_sales_schema_ready: true }];
    else if (sql.includes("sales-authorization:identity")) rows = [{ account_id: ids.account, staff_id: sid("staff", 16), login_enabled: true, role: "ADMIN", employment_status: "在职", hall_id: ids.hall }];
    else if (sql.includes("sales-authorization:hall") || sql.includes("native-sales-facts:hall")) rows = [{ id: values[0], enabled: true }];
    else if (sql.includes("native-sales-facts:warehouse")) rows = [{ id: values[0], hall_id: ids.hall, enabled: true }];
    else if (sql.includes("native-sales-facts:customer")) rows = [{ id: values[0], enabled: true }];
    else if (sql.includes("native-sales-facts:staff")) rows = [{ id: values[0], employment_status: "在职" }];
    else if (sql.includes("native-sales-facts:schema") || sql.includes("native-transfer-snapshots:schema")) rows = [{ installed: true }];
    else if (sql.includes("native-transfer-snapshots:targets")) rows = (values[0] as string[]).map(id => ({ id, product_code: labels.productCode, product_name: labels.productName, color_name: labels.colorName, fit_name: labels.fitName, size_name: labels.sizeName }));
    else if (sql.includes("native-transfer-snapshots:main")) rows = (values[0] as string[]).map(sku_id => ({ sku_id, barcode: labels.barcode }));
    else if (sql.includes("native-sales-facts:barcodes")) rows = (values[0] as string[]).map(barcode => ({ barcode, sku_id: h06.sku, enabled: true }));
    else if (sql.includes("native-sales-facts:")) {
      const table = /native-sales-facts:([a-z_]+)/.exec(sql)?.[1];
      const tables: Record<string, Record<string, unknown>> = {
        payment_account: { payment_method_id: sid("paymentMethod", 31), enabled: true }, payment_method: { enabled: true },
        sku: h06Sku(), product: f.root, color: { name: labels.colorName, enabled: true }, fit: { name: labels.fitName, enabled: true }, size: { name: labels.sizeName }
      };
      if (!table || !tables[table]) throw Error("Unexpected synthetic fact " + sql);
      rows = (values[0] as string[]).map(id => ({ ...tables[table], id }));
    } else if (sql.includes("document-number:reserve")) { allocation = true; rows = [{ number: "V2-XS-000000000001", actor_account_id: ids.account }]; }
    else if (sql.includes("document-number:existing") || sql.includes("document-number:validate")) rows = allocation ? [{ number: "V2-XS-000000000001", actor_account_id: ids.account }] : [];
    else if (!/^(?:BEGIN|COMMIT|ROLLBACK|SELECT pg_advisory|INSERT INTO naijue_erp\.(?:sales_|audit_change|operation_receipt))/.test(sql)
      && !sql.includes("FROM naijue_erp.sales_header") && !sql.includes("FROM naijue_erp.operation_receipt") && !sql.includes("document-number:lock")) throw Error("Unexpected synthetic SQL " + sql);
    return { rows: structuredClone(rows), rowCount: sql.startsWith("INSERT") ? 1 : rows.length };
  }, release() {} };
  const runtime: NativeRuntime26Capability = { profile: "EXACT26", contract: "NATIVE_RUNTIME26_V1", async assertReady(target, purpose) {
    if (target !== client || purpose !== "INVENTORY_ADMISSION") throw Error("Wrong original runtime target");
  } };
  const original = new PostgresSalesUnitOfWork({ async connect() { return client; } }, {
    catalogueCompleteness: { async assertComplete() { throw Error("Legacy verifier must not replace actual maintained proof"); } }, runtime26: runtime, catalogueReadProof: { profile: "MAINTAINED_CATALOGUE26_V1" }
  });
  const unitOfWork = { transaction<T>(work: (tx: SalesTransaction) => Promise<T>): Promise<T> {
    return original.transaction(tx => work(new Proxy(tx, { get(target, prop) {
      const value = Reflect.get(target, prop);
      if (prop === "getCurrentSalesReferenceFacts") return (...args: Parameters<NonNullable<SalesTransaction["getCurrentSalesReferenceFacts"]>>) => { logical.facts++; return value.apply(target, args); };
      if (prop === "getCurrentSalesSnapshots") return (...args: Parameters<NonNullable<SalesTransaction["getCurrentSalesSnapshots"]>>) => { logical.snapshots++; return value.apply(target, args); };
      return typeof value === "function" ? value.bind(target) : value;
    } })));
  } };
  return { original, unitOfWork, calls, writes, logical, runtime, client, seedHistorical: (document: SalesDocument) => { historical = structuredClone(document); },
    count: (tag: string) => calls.filter(sql => sql.includes(tag)).length,
    fail: (tag: string) => { failTag = tag; }, pause: (tag: string, wait: Promise<void>) => { pause = { tag, wait }; }, unpause: () => { pause = undefined; }
  };
}
