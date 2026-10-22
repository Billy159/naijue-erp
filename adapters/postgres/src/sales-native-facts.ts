import { historicalCustomerExclusionEnabled } from "./party-read-reader.ts";
import type { HistoricalCustomerExclusionCapability } from "./party-read-reader.ts";
import type { SalesDocument, SalesDraft, SalesLineRow } from "../../../packages/domain/src/documents.ts";
import type { EntityId, EntityKind } from "../../../packages/domain/src/values.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { SALES_NATIVE_FACT_MAX_LINES, SALES_NATIVE_FACT_QUERY_BATCH_SIZE } from "../../../packages/application/src/sales-native-facts.ts";
import type { NativeSalesReferenceFacts } from "../../../packages/application/src/sales-native-facts.ts";
import type { PgSalesResult } from "./sales-unit-of-work.ts";
import { booleanValue, moneyFromSql, stringValue } from "./codec.ts";

export type NativeSalesFactQuery = (sql: string, values?: unknown[]) => Promise<PgSalesResult>;
/** Real trusted product creation/import publication proof, not a boolean toggle.
 * The implementation must use this original transaction query for persistent
 * completeness evidence. No default verifier is provided or installed. */
export interface NativeCatalogueCompletenessVerifier {
  assertComplete(context: { readonly productIds: readonly EntityId<"product">[]; readonly query: NativeSalesFactQuery }): Promise<void>;
}
const id = <K extends EntityKind>(kind: K, value: unknown): EntityId<K> => entityId(kind, stringValue(value));
const unique = <T extends string>(values: readonly T[]): T[] => [...new Set(values)].sort();
const label = (value: unknown): string => { const result = stringValue(value); requireDomain(result.trim().length > 0, "INVALID_DATABASE_VALUE", "Native snapshot label is missing"); return result; };
function amount(value: unknown) {
  if (value === null) return null; const result = moneyFromSql(value);
  requireDomain(result >= 0n, "INVALID_DATABASE_VALUE", "Native product price is negative"); return result;
}
const PRICE_FIELDS = ["purchase_price", "retail_price", "wholesale5_price", "wholesale6_price", "wholesale7_price", "wholesale8_price", "wholesale9_price", "wholesale10_price", "minimum_price"] as const;
const PRICE_COLUMNS = PRICE_FIELDS.map(field => `${field}::text`).join(", ");
function one(rows: readonly Record<string, unknown>[]): Record<string, unknown> {
  requireDomain(rows.length === 1, "SALES_REFERENCE_UNAVAILABLE", "Native sales reference is missing or ambiguous"); return rows[0]!;
}
function exactMap<K extends EntityKind>(kind: K, rows: readonly Record<string, unknown>[], wanted: readonly EntityId<K>[]): Map<EntityId<K>, Record<string, unknown>> {
  const result = new Map(rows.map(row => [id(kind, row.id), row]));
  requireDomain(rows.length === wanted.length && result.size === wanted.length && wanted.every(value => result.has(value)),
    "SALES_REFERENCE_UNAVAILABLE", "Native target fact set is incomplete or inconsistent"); return result;
}

/** Owned by one bound sales transaction. No pool, BEGIN/COMMIT, independent cache,
 * identity grant or document mutation. Every query is through its original client. */
export interface NativeSalesHistoricalCustomers { readonly target: object; readonly capability: HistoricalCustomerExclusionCapability }
export class PostgresNativeSalesFacts {
  private readonly query: NativeSalesFactQuery;
  private readonly excludeHistoricalCustomers: boolean;
  private readonly checkScope: (salesId: EntityId<"sales">) => void;
  private readonly retained: () => readonly Pick<SalesLineRow, "id" | "skuId" | "snapshot">[];
  private readonly verifier: NativeCatalogueCompletenessVerifier["assertComplete"] | undefined;
  constructor(query: NativeSalesFactQuery, checkScope: (salesId: EntityId<"sales">) => void,
    retained: () => readonly Pick<SalesLineRow, "id" | "skuId" | "snapshot">[], verifier?: NativeCatalogueCompletenessVerifier, historicalCustomers?: NativeSalesHistoricalCustomers) {
    this.excludeHistoricalCustomers = historicalCustomers === undefined ? false : historicalCustomerExclusionEnabled(historicalCustomers.target, historicalCustomers.capability);
    this.query = query; this.checkScope = checkScope; this.retained = retained;
    this.verifier = verifier?.assertComplete.bind(verifier);
  }
  private async targets<K extends EntityKind>(kind: K, wanted: readonly EntityId<K>[], columns: string, table: string): Promise<Map<EntityId<K>, Record<string, unknown>>> {
    const rows: Record<string, unknown>[] = [];
    for (let start = 0; start < wanted.length; start += SALES_NATIVE_FACT_QUERY_BATCH_SIZE) {
      const batch = wanted.slice(start, start + SALES_NATIVE_FACT_QUERY_BATCH_SIZE);
      const result = await this.query(`/* native-sales-facts:${table} */ SELECT ${columns} FROM naijue_erp.${table}
        WHERE id = ANY($1::uuid[]) ORDER BY id FOR SHARE`, [[...batch]]);
      requireDomain(result.rows.length <= batch.length, "INVALID_DATABASE_VALUE", "Native fact query exceeded its target batch"); rows.push(...result.rows);
    }
    return exactMap(kind, rows, wanted);
  }
  async load(input: SalesDraft | SalesDocument): Promise<NativeSalesReferenceFacts> {
    const document = structuredClone(input); const h = document.header; this.checkScope(h.id);
    requireDomain(this.verifier, "NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "A real validated product-input completeness verifier is required");
    const current = document.lines.filter(line => line.isCurrent);
    requireDomain(current.length > 0 && current.length <= SALES_NATIVE_FACT_MAX_LINES && document.settlements.length <= 3,
      "NATIVE_SALES_FACTS_TOO_LARGE", "Native fact request exceeds the technical current-document bound");
    for (const line of current) { id("salesLine", line.id); id("sku", line.skuId); requireDomain(line.salesId === h.id, "TRANSACTION_SCOPE", "Native facts require owned actual sales lines"); }
    id("sales", h.id); id("hall", h.hallId); id("warehouse", h.warehouseId); id("customer", h.customerId);
    if (h.salespersonId !== null) id("staff", h.salespersonId);
    const schema = one((await this.query("/* native-sales-facts:schema */ SELECT EXISTS (SELECT 1 FROM naijue_erp.schema_migration WHERE version = 10) AS installed")).rows);
    requireDomain(schema.installed === true, "NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "Current native sales schema including the original-method snapshot has not been installed");
    const hall = one((await this.query("/* native-sales-facts:hall */ SELECT id, enabled FROM naijue_erp.hall WHERE id = $1::uuid FOR SHARE", [h.hallId])).rows);
    const warehouse = one((await this.query("/* native-sales-facts:warehouse */ SELECT id, hall_id, enabled FROM naijue_erp.warehouse WHERE id = $1::uuid FOR SHARE", [h.warehouseId])).rows);
    const customer = one((await this.query(`/* native-sales-facts:customer */ SELECT id, enabled FROM naijue_erp.customer WHERE id = $1::uuid${this.excludeHistoricalCustomers ? " AND NOT naijue_erp.is_exact_historical_customer_only(customer.id)" : ""} FOR SHARE`, [h.customerId])).rows);
    let salesperson: NativeSalesReferenceFacts["salesperson"] = null;
    if (h.salespersonId !== null) {
      const row = one((await this.query("/* native-sales-facts:staff */ SELECT id, employment_status FROM naijue_erp.staff WHERE id = $1::uuid FOR SHARE", [h.salespersonId])).rows);
      requireDomain(row.id === h.salespersonId, "INVALID_DATABASE_VALUE", "Mismatched native staff target");
      salesperson = Object.freeze({ id: id("staff", row.id), employmentStatus: stringValue(row.employment_status) });
    }
    const accountIds = unique(document.settlements.map(row => id("paymentAccount", row.paymentAccountId)));
    const accountRows = await this.targets("paymentAccount", accountIds, "id, payment_method_id, enabled", "payment_account");
    const methodIds = unique([...accountRows.values()].map(row => id("paymentMethod", row.payment_method_id)));
    const methods = await this.targets("paymentMethod", methodIds, "id, enabled", "payment_method");
    const skuIds = unique(current.map(row => row.skuId));
    const skuRows = await this.targets("sku", skuIds, "id, product_id, color_id, fit_id, size_id, enabled", "sku");
    const productIds = unique([...skuRows.values()].map(row => id("product", row.product_id)));
    const products = await this.targets("product", productIds, `id, product_code, name, size_group_id, enabled, ${PRICE_COLUMNS}`, "product");
    const colorIds = unique([...skuRows.values()].map(row => id("color", row.color_id)));
    const fitIds = unique([...skuRows.values()].map(row => id("fit", row.fit_id)));
    const sizeIds = unique([...skuRows.values()].map(row => id("size", row.size_id)));
    const colors = await this.targets("color", colorIds, "id, name, enabled", "color");
    const fits = await this.targets("fit", fitIds, "id, name, enabled", "fit");
    const sizes = await this.targets("size", sizeIds, "id, name", "size");
    const coordinates = unique([...skuRows.values()].map(row => JSON.stringify([id("sizeGroup", products.get(id("product", row.product_id))!.size_group_id), id("size", row.size_id)])));
    const membership = new Set<string>();
    for (let start = 0; start < coordinates.length; start += SALES_NATIVE_FACT_QUERY_BATCH_SIZE) {
      const batch = coordinates.slice(start, start + SALES_NATIVE_FACT_QUERY_BATCH_SIZE).map(value => JSON.parse(value) as [string, string]);
      const rows = (await this.query(`/* native-sales-facts:membership */ SELECT size_group_id, size_id FROM naijue_erp.size_group_member
        WHERE (size_group_id, size_id) IN (SELECT * FROM unnest($1::uuid[], $2::uuid[])) ORDER BY size_group_id, size_id FOR SHARE`,
        [batch.map(row => row[0]), batch.map(row => row[1])])).rows;
      requireDomain(rows.length <= batch.length, "INVALID_DATABASE_VALUE", "Membership facts exceeded bounded coordinate targets");
      for (const row of rows) {
        const key = JSON.stringify([id("sizeGroup", row.size_group_id), id("size", row.size_id)]);
        requireDomain(!membership.has(key) && coordinates.includes(key), "INVALID_DATABASE_VALUE", "Unexpected or repeated native membership target"); membership.add(key);
      }
    }
    requireDomain(membership.size === coordinates.length, "SKU_UNAVAILABLE", "Native SKU size is outside its product group");
    // Real verifier must query persisted creation/import evidence here, on this
    // original transaction. Schema version or nullable values alone are not proof.
    await this.verifier(Object.freeze({ productIds: Object.freeze([...productIds]), query: this.query })); this.checkScope(h.id);
    const productFacts = [...products].map(([productId, row]) => {
      for (const field of PRICE_FIELDS) amount(row[field]);
      return Object.freeze({ id: productId, enabled: booleanValue(row.enabled), referencePrice: amount(row.retail_price), minimumPrice: amount(row.minimum_price) });
    });
    const rawCodes = unique(current.flatMap(line => line.snapshot.barcode === null ? [] : [stringValue(line.snapshot.barcode)]));
    const barcodes: NativeSalesReferenceFacts["barcodes"][number][] = [];
    for (let start = 0; start < rawCodes.length; start += SALES_NATIVE_FACT_QUERY_BATCH_SIZE) {
      const batch = rawCodes.slice(start, start + SALES_NATIVE_FACT_QUERY_BATCH_SIZE);
      const rows = (await this.query(`/* native-sales-facts:barcodes */ SELECT barcode, sku_id, enabled FROM naijue_erp.sku_barcode
        WHERE barcode = ANY($1::text[]) ORDER BY barcode COLLATE "C", id FOR SHARE`, [[...batch]])).rows;
      requireDomain(rows.length <= batch.length, "INVALID_DATABASE_VALUE", "Raw barcode query exceeded its exact targets");
      const seen = new Set<string>();
      for (const row of rows) { const raw = stringValue(row.barcode); requireDomain(batch.includes(raw) && !seen.has(raw), "INVALID_DATABASE_VALUE", "Unexpected or repeated raw barcode fact"); seen.add(raw);
        barcodes.push(Object.freeze({ raw, skuId: id("sku", row.sku_id), enabled: booleanValue(row.enabled) })); }
    }
    this.checkScope(h.id);
    requireDomain(hall.id === h.hallId && warehouse.id === h.warehouseId && customer.id === h.customerId,
      "INVALID_DATABASE_VALUE", "Mismatched native header reference targets");
    return Object.freeze({ salesId: h.id,
      hall: Object.freeze({ id: id("hall", hall.id), enabled: booleanValue(hall.enabled) }),
      warehouse: Object.freeze({ id: id("warehouse", warehouse.id), hallId: id("hall", warehouse.hall_id), enabled: booleanValue(warehouse.enabled) }),
      customer: Object.freeze({ id: id("customer", customer.id), enabled: booleanValue(customer.enabled) }), salesperson,
      paymentAccounts: Object.freeze([...accountRows].map(([accountId, row]) => { const methodId = id("paymentMethod", row.payment_method_id); return Object.freeze({ id: accountId,
        enabled: booleanValue(row.enabled), methodId, methodEnabled: booleanValue(methods.get(methodId)!.enabled) }); })),
      skus: Object.freeze([...skuRows].map(([skuId, row]) => { const productId = id("product", row.product_id), product = products.get(productId)!;
        const color = colors.get(id("color", row.color_id))!, fit = fits.get(id("fit", row.fit_id))!, size = sizes.get(id("size", row.size_id))!;
        return Object.freeze({ id: skuId, productId, enabled: booleanValue(row.enabled) && booleanValue(product.enabled) && booleanValue(color.enabled) && booleanValue(fit.enabled),
          snapshot: Object.freeze({ productCode: label(product.product_code), productName: label(product.name), colorName: label(color.name), fitName: label(fit.name), sizeName: label(size.name) }) }); })),
      products: Object.freeze(productFacts), barcodes: Object.freeze(barcodes),
      retainedLines: Object.freeze(this.retained().map(row => Object.freeze({ id: row.id, skuId: row.skuId, snapshot: Object.freeze({ ...row.snapshot }) })))
    });
  }
}
