import { historicalCustomerExclusionEnabled } from "./party-read-reader.ts";
import type { HistoricalCustomerExclusionCapability } from "./party-read-reader.ts";
import { readCurrentRecentAccount } from "./current-account-recommendations.ts";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { CurrentFormBarcodeQuery, CurrentFormBarcodeResult, CurrentFormAuthorization, CurrentFormContext, CurrentFormIdentity, CurrentFormIntent, CurrentFormPage,
  CurrentFormProduct, CurrentFormProductQuery, CurrentFormProductSkuQuery, CurrentFormReader, CurrentFormReadGrant,
  CurrentFormSku, CurrentFormSkuBatchQuery, CurrentSalesReferenceItem, CurrentSalesReferenceQuery,
  CurrentTransferWarehouse, CurrentTransferWarehouseQuery } from "../../../packages/application/src/current-form-ports.ts";
import { activeCurrentFormRead, checkedCurrentFormActor, checkedCurrentFormGrant, parseCurrentFormProductQuery,
  parseCurrentFormProductSkuQuery, parseCurrentFormSkuBatchQuery, parseCurrentSalesReferenceQuery,
  parseCurrentTransferWarehouseQuery, parseCurrentFormBarcodeQuery } from "../../../packages/application/src/current-form-validation.ts";
import { DomainError, requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import type { EntityId, EntityKind } from "../../../packages/domain/src/values.ts";
import type { PgSalesPool, PgSalesResult } from "./sales-unit-of-work.ts";
import { booleanValue } from "./codec.ts";
import { assertHistoryPublicationSchema19 } from "../../../packages/application/src/history-typed-publication.ts";

type Query = (sql: string, values?: unknown[]) => Promise<PgSalesResult>;
function denied(): never { throw new DomainError("FORBIDDEN", "Current form is not available to this account"); }
function id<K extends EntityKind>(kind: K, value: unknown): EntityId<K> {
  requireDomain(typeof value === "string", "INVALID_DATABASE_VALUE", "Expected native reference identity");
  return entityId(kind, value);
}
function text(value: unknown): string {
  requireDomain(typeof value === "string" && value.trim().length > 0 && !/[\x00-\x1f\x7f]/.test(value), "INVALID_DATABASE_VALUE", "Expected full native reference text");
  return value;
}
function nullableText(value: unknown): string | null { return value === null ? null : text(value); }
function price(value: unknown): string | null {
  requireDomain(value === null || (typeof value === "string" && /^(?:0|[1-9]\d{0,15})\.\d{2}$/.test(value)),
    "INVALID_DATABASE_VALUE", "Expected nullable exact nonnegative decimal(18,2) product price");
  return value;
}
function count(rows: readonly Record<string, unknown>[]): bigint {
  requireDomain(rows.length === 1 && typeof rows[0]!.total === "string" && /^(?:0|[1-9]\d*)$/.test(rows[0]!.total),
    "INVALID_DATABASE_VALUE", "Expected one exact native count");
  return BigInt(rows[0]!.total);
}
function hallPredicate(column: string, grant: CurrentFormReadGrant, values: unknown[]): string {
  if (grant.kind === "all") return "TRUE";
  values.push([...grant.hallIds]); return `${column} = ANY($${values.length}::uuid[])`;
}
const SKU_JOINS = `FROM naijue_erp.sku s JOIN naijue_erp.product p ON p.id = s.product_id
  JOIN naijue_erp.color c ON c.id = s.color_id JOIN naijue_erp.fit f ON f.id = s.fit_id
  JOIN naijue_erp.size sz ON sz.id = s.size_id
  JOIN naijue_erp.size_group_member m ON m.size_group_id = p.size_group_id AND m.size_id = s.size_id`;
const SKU_ENABLED = "s.enabled AND p.enabled AND c.enabled AND f.enabled";
const SKU_COLUMNS = `s.id, s.sku_code, s.product_id, p.product_code, p.name AS product_name,
  s.color_id, c.name AS color_name, s.fit_id, f.name AS fit_name, s.size_id, sz.name AS size_name,
  p.size_group_id, m.size_id AS member_size_id, s.enabled AS sku_enabled, p.enabled AS product_enabled,
  c.enabled AS color_enabled, f.enabled AS fit_enabled`;
const SKU_ORDER = `p.product_code COLLATE "C", p.id, c.code COLLATE "C", c.id, f.code COLLATE "C", f.id, m.display_order, s.size_id, s.id`;
function sku(row: Record<string, unknown>): CurrentFormSku {
  const sizeId = id("size", row.size_id);
  requireDomain(row.sku_enabled === true && row.product_enabled === true && row.color_enabled === true && row.fit_enabled === true
    && row.member_size_id === sizeId, "INVALID_DATABASE_VALUE", "Native SKU is not an eligible current four-dimensional fact");
  return Object.freeze({ id: id("sku", row.id), skuCode: text(row.sku_code), productId: id("product", row.product_id),
    productCode: text(row.product_code), productName: text(row.product_name), colorId: id("color", row.color_id), colorName: text(row.color_name),
    fitId: id("fit", row.fit_id), fitName: text(row.fit_name), sizeId, sizeName: text(row.size_name), sizeGroupId: id("sizeGroup", row.size_group_id),
    barcodeAvailability: "UNAVAILABLE" });
}

/** Schema-neutral, explicit-host CURRENT proposal reader. Each call rechecks the
 * native account/staff/hall and explicit host grant in ONE RR READ ONLY snapshot.
 * No connection on construction, HTTP wiring, policy default, history-derived
 * catalogue, barcode/minimum fabrication, write authority or cross-request cache.
 * Signals bound callback work; host-provided pool timeouts bound in-flight pg work. */
export class PostgresCurrentFormReader implements CurrentFormReader {
  private readonly pool: PgSalesPool;
  private readonly authorize: CurrentFormAuthorization["authorize"];
  private readonly recommendationTimeoutMillis: number;
  private readonly excludeHistoricalCustomers: boolean;
  constructor(pool: PgSalesPool, authorization: CurrentFormAuthorization, options?: { readonly recommendationTimeoutMillis?: number; readonly historicalCustomerExclusion?: HistoricalCustomerExclusionCapability }) {
    if (typeof pool?.connect !== "function" || typeof authorization?.authorize !== "function")
      throw new TypeError("Current forms require an explicit PostgreSQL pool and trusted form authorization provider");
    const timeout = options?.recommendationTimeoutMillis ?? 250;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 1000) throw new TypeError("Optional account recommendation timeout must be an integer from 1 through 1000 milliseconds");
    this.excludeHistoricalCustomers = historicalCustomerExclusionEnabled(pool, options?.historicalCustomerExclusion ?? null);
    this.pool = pool; this.authorize = authorization.authorize.bind(authorization); this.recommendationTimeoutMillis = timeout;
  }
  private async identity(query: Query, actor: ActorContext): Promise<CurrentFormIdentity> {
    const rows = (await query(`/* current-form:identity */ SELECT a.id AS account_id, a.staff_id, a.login_enabled,
      s.role, s.employment_status, s.hall_id, h.id AS native_hall_id, h.enabled AS hall_enabled
      FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id = a.staff_id
      LEFT JOIN naijue_erp.hall h ON h.id = s.hall_id WHERE a.id = $1::uuid LIMIT 2`, [actor.accountId])).rows;
    if (rows.length !== 1) denied(); const row = rows[0]!;
    if (row.account_id !== actor.accountId || row.login_enabled !== true || row.employment_status !== "在职"
      || (row.role !== "ADMIN" && row.role !== "WAREHOUSE" && row.role !== "SALESPERSON")) denied();
    const hallId = row.hall_id === null ? null : id("hall", row.hall_id);
    if (hallId !== actor.hallId || (row.role === "SALESPERSON" && hallId === null)
      || (hallId === null && (row.native_hall_id !== null || row.hall_enabled !== null))
      || (hallId !== null && (row.native_hall_id !== hallId || row.hall_enabled !== true))) denied();
    return Object.freeze({ accountId: id("account", row.account_id), staffId: id("staff", row.staff_id), role: row.role, hallId });
  }
  private async snapshot<T>(actor: ActorContext, intent: CurrentFormIntent, signal: AbortSignal,
    work: (query: Query, identity: CurrentFormIdentity, grant: CurrentFormReadGrant) => Promise<T>): Promise<T> {
    const trusted = checkedCurrentFormActor(actor); activeCurrentFormRead(signal);
    const client = await this.pool.connect(); let began = false; let committing = false; let committed = false; let discard: Error | undefined;
    const query: Query = async (sql, values = []) => { activeCurrentFormRead(signal); const result = await client.query(sql, values); activeCurrentFormRead(signal); return result; };
    try {
      // Mark acknowledged transaction state before checking a cancellation after BEGIN.
      activeCurrentFormRead(signal); await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); began = true; activeCurrentFormRead(signal);
      const identity = await this.identity(query, trusted);
      const grant = checkedCurrentFormGrant(await this.authorize(Object.freeze({ actor: trusted, identity }), Object.freeze(intent), signal));
      activeCurrentFormRead(signal); const result = await work(query, identity, grant); activeCurrentFormRead(signal); committing = true;
      await client.query("COMMIT"); committed = true; activeCurrentFormRead(signal); return result;
    } catch (error) {
      if (!began || (committing && !committed)) discard = error instanceof Error ? error : new Error("Current form snapshot failed");
      if (began && !committed) try { await client.query("ROLLBACK"); } catch (rollbackError) {
        discard = rollbackError instanceof Error ? rollbackError : new Error("Current form rollback failed");
        throw new AggregateError([error, rollbackError], "Current form read and rollback failed; connection discarded");
      }
      throw error;
    } finally { client.release(discard); }
  }
  private async salesHall(query: Query, identity: CurrentFormIdentity, grant: CurrentFormReadGrant, hallId: EntityId<"hall">): Promise<void> {
    if ((identity.role === "SALESPERSON" && identity.hallId !== hallId) || (grant.kind === "halls" && !grant.hallIds.includes(hallId))) denied();
    const rows = (await query("/* current-form:sales-hall */ SELECT id, enabled FROM naijue_erp.hall WHERE id = $1::uuid LIMIT 2", [hallId])).rows;
    if (rows.length !== 1 || rows[0]!.id !== hallId || rows[0]!.enabled !== true) denied();
  }
  private async formContext(query: Query, identity: CurrentFormIdentity, grant: CurrentFormReadGrant, context: CurrentFormContext): Promise<void> {
    if (context.kind === "SALES") await this.salesHall(query, identity, grant, context.hallId);
    // Shared product/SKU identities have no product-hall ownership. A restricted
    // grant authorizes use in its halls, never a fictitious product-hall relation.
  }
  private async page<T extends { readonly id: string }>(query: Query, parameters: { readonly page: number; readonly pageSize: 20 },
    from: string, where: string, columns: string, order: string, values: unknown[], decode: (row: Record<string, unknown>) => T, orderValues: unknown[] = []): Promise<CurrentFormPage<T>> {
    const total = count((await query(`/* current-form:count */ SELECT count(*)::text AS total ${from} WHERE ${where}`, values)).rows);
    const offset = (parameters.page - 1) * 20; const pageValues = [...values, ...orderValues, 20, offset];
    const rows = (await query(`/* current-form:page */ SELECT ${columns} ${from} WHERE ${where}
      ORDER BY ${order} LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`, pageValues)).rows;
    return this.decodedPage(parameters, total, rows, decode);
  }
  private decodedPage<T extends { readonly id: string }>(parameters: { readonly page: number; readonly pageSize: 20 }, total: bigint,
    rows: readonly Record<string, unknown>[], decode: (row: Record<string, unknown>) => T): CurrentFormPage<T> {
    const offset = (parameters.page - 1) * 20; const remaining = total > BigInt(offset) ? total - BigInt(offset) : 0n;
    requireDomain(rows.length === Number(remaining > 20n ? 20n : remaining), "INVALID_DATABASE_VALUE", "Current form page/count mismatch or overflow");
    const items = rows.map(decode); requireDomain(new Set(items.map(row => row.id)).size === items.length, "INVALID_DATABASE_VALUE", "Repeated native candidate identity");
    return Object.freeze({ page: parameters.page, pageSize: 20, exactTotal: total, items: Object.freeze(items) });
  }
  private async paymentAccounts(query: Query, parameters: Extract<CurrentSalesReferenceQuery, { kind: "paymentAccount" }>, signal: AbortSignal,
    from: string, where: string, columns: string, values: unknown[], decode: (row: Record<string, unknown>) => CurrentSalesReferenceItem): Promise<CurrentFormPage<CurrentSalesReferenceItem>> {
    // Eligibility/count is authoritative and independent of every optional hint.
    const total = count((await query(`/* current-form:count */ SELECT count(*)::text AS total ${from} WHERE ${where}`, values)).rows);
    const offset = (parameters.page - 1) * 20; let rows: Record<string, unknown>[]; let recommendationAvailability: "AVAILABLE" | "UNAVAILABLE";
    await query("SAVEPOINT current_account_recommendation");
    try {
      const settings = (await query("/* current-form:recommendation-timeout */ SELECT current_setting('statement_timeout') AS statement_timeout")).rows;
      requireDomain(settings.length === 1 && typeof settings[0]!.statement_timeout === "string", "CURRENT_ACCOUNT_RECOMMENDATION_UNAVAILABLE", "Original timeout is unavailable");
      const original = settings[0]!.statement_timeout;
      const match = /^(0|[1-9]\d*)(us|ms|s|min|h|d)?$/.exec(original);
      requireDomain(match, "CURRENT_ACCOUNT_RECOMMENDATION_UNAVAILABLE", "Original timeout is not a recognized PostgreSQL value");
      const units: Record<string, bigint> = { us: 1n, ms: 1000n, s: 1000000n, min: 60000000n, h: 3600000000n, d: 86400000000n };
      const originalMicros = BigInt(match[1]!) * units[match[2] ?? "ms"]!;
      const budget = originalMicros > 0n && originalMicros < BigInt(this.recommendationTimeoutMillis) * 1000n ? original : `${this.recommendationTimeoutMillis}ms`;
      await query("SELECT set_config('statement_timeout', $1::text, true)", [budget]);
      const recent = await readCurrentRecentAccount(query, parameters.hallId, parameters.paymentMethodId);
      const pageValues = [...values, parameters.hallId, recent, 20, offset];
      rows = (await query(`/* current-form:page */ SELECT ${columns},
        (EXISTS (SELECT 1 FROM naijue_erp.payment_account_hall ph WHERE ph.payment_account_id = r.id AND ph.hall_id = $3::uuid)
          OR r.id = $4::uuid) IS TRUE AS is_recommended ${from} WHERE ${where}
        ORDER BY is_recommended DESC, r.id LIMIT $5 OFFSET $6`, pageValues)).rows;
      for (const row of rows) booleanValue(row.is_recommended);
      await query("SELECT set_config('statement_timeout', $1::text, true)", [original]);
      await query("RELEASE SAVEPOINT current_account_recommendation"); recommendationAvailability = "AVAILABLE";
    } catch (error) {
      if (signal.aborted) throw error;
      // PostgreSQL ROLLBACK TO also restores the original SET LOCAL timeout. If
      // recovery fails the whole snapshot fails, rather than faking a usable client.
      await query("ROLLBACK TO SAVEPOINT current_account_recommendation");
      await query("RELEASE SAVEPOINT current_account_recommendation");
      rows = (await query(`/* current-form:eligible-account-fallback */ SELECT ${columns} ${from} WHERE ${where}
        ORDER BY r.id LIMIT $3 OFFSET $4`, [...values, 20, offset])).rows;
      recommendationAvailability = "UNAVAILABLE";
    }
    return Object.freeze({ ...this.decodedPage(parameters, total, rows, decode), recommendationAvailability });
  }
  readSalesReferences(actor: ActorContext, input: CurrentSalesReferenceQuery, signal: AbortSignal): Promise<CurrentFormPage<CurrentSalesReferenceItem>> {
    const parameters = parseCurrentSalesReferenceQuery(input);
    return this.snapshot(actor, { kind: "sales-references", parameters }, signal, async (query, identity, grant) => {
      if (parameters.hallId !== null) await this.salesHall(query, identity, grant, parameters.hallId);
      const values: unknown[] = [parameters.search]; const match = (column: string) => `strpos(lower(${column}), lower($1::text)) > 0`;
      let from: string; let where: string; let columns: string; let order = `r.name COLLATE "C", r.id`;
      const orderValues: unknown[] = [];
      switch (parameters.kind) {
        case "hall": {
          from = "FROM naijue_erp.hall r";
          const scope = hallPredicate("r.id", grant, values);
          let native = "TRUE"; if (identity.role === "SALESPERSON") { values.push(identity.hallId); native = `r.id = $${values.length}::uuid`; }
          where = `r.enabled AND ${scope} AND ${native} AND ${match("r.name")}`;
          columns = `r.id, r.name, NULL::text AS code, r.id AS hall_id, r.name AS hall_name, NULL::uuid AS payment_method_id, NULL::text AS payment_method_name`; break;
        }
        case "customer":
          from = "FROM naijue_erp.customer r"; where = `r.enabled AND (${match("r.name")} OR ${match("r.code")})`
            + (this.excludeHistoricalCustomers ? " AND NOT naijue_erp.is_exact_historical_customer_only(r.id)" : "");
          columns = `r.id, r.name, r.code, NULL::uuid AS hall_id, NULL::text AS hall_name, NULL::uuid AS payment_method_id, NULL::text AS payment_method_name`; break;
        case "salesperson":
          from = "FROM naijue_erp.staff r LEFT JOIN naijue_erp.hall h ON h.id = r.hall_id";
          // Native staff has no enabled column: exact current employment status is
          // all that can be established. No role, staff-hall or login-account filter.
          where = `r.employment_status = '在职' AND ${match("r.name")}`; orderValues.push(identity.staffId);
          order = `(r.id = $${values.length + 1}::uuid) DESC, ${order}`;
          columns = `r.id, r.name, NULL::text AS code, r.hall_id, h.name AS hall_name, NULL::uuid AS payment_method_id, NULL::text AS payment_method_name`; break;
        case "warehouse":
          from = "FROM naijue_erp.warehouse r JOIN naijue_erp.hall h ON h.id = r.hall_id"; values.push(parameters.hallId);
          where = `r.enabled AND h.enabled AND r.hall_id = $${values.length}::uuid AND ${match("r.name")}`;
          columns = `r.id, r.name, NULL::text AS code, r.hall_id, h.name AS hall_name, NULL::uuid AS payment_method_id, NULL::text AS payment_method_name`; break;
        case "paymentMethod":
          from = "FROM naijue_erp.payment_method r";
          // Online methodOptions shows enabled native methods with at least one
          // eligible account. EXISTS avoids duplicate methods/count fanout; neither
          // the method nor its accounts acquire hall ownership from the form scope.
          where = `r.enabled AND EXISTS (SELECT 1 FROM naijue_erp.payment_account a WHERE a.payment_method_id = r.id AND a.enabled) AND ${match("r.name")}`;
          order = "r.id";
          columns = `r.id, r.name, r.enabled AS method_enabled, NULL::text AS code, NULL::uuid AS hall_id, NULL::text AS hall_name, NULL::uuid AS payment_method_id, NULL::text AS payment_method_name`; break;
        case "paymentAccount":
          from = "FROM naijue_erp.payment_account r JOIN naijue_erp.payment_method pm ON pm.id = r.payment_method_id";
          values.push(parameters.paymentMethodId);
          where = `r.enabled AND pm.enabled AND r.payment_method_id = $${values.length}::uuid AND (${match("r.name")} OR ${match("pm.name")})`;
          order = "r.id";
          columns = `r.id, r.name, NULL::text AS code, NULL::uuid AS hall_id, NULL::text AS hall_name, pm.id AS payment_method_id, pm.name AS payment_method_name`; break;
        default: throw new TypeError("Unsupported current reference kind");
      }
      const decode = (row: Record<string, unknown>): CurrentSalesReferenceItem => {
        const kind = ({ hall: "hall", customer: "customer", salesperson: "staff", warehouse: "warehouse", paymentMethod: "paymentMethod", paymentAccount: "paymentAccount" } as const)[parameters.kind];
        const hallId = row.hall_id === null ? null : id("hall", row.hall_id); const hallName = nullableText(row.hall_name);
        requireDomain((hallId === null) === (hallName === null), "INVALID_DATABASE_VALUE", "Native hall identity/label mismatch");
        const nativeId = id(kind, row.id);
        if (parameters.kind === "hall") requireDomain(nativeId === hallId && (identity.role !== "SALESPERSON" || hallId === identity.hallId)
          && (grant.kind === "all" || (hallId !== null && grant.hallIds.includes(hallId))), "INVALID_DATABASE_VALUE", "Native hall candidate exceeds the authorized scope");
        if (parameters.kind === "warehouse") requireDomain(hallId === parameters.hallId, "INVALID_DATABASE_VALUE", "Native warehouse exceeds the proposed sales hall");
        if (parameters.kind === "paymentMethod") requireDomain(hallId === null && row.method_enabled === true,
          "INVALID_DATABASE_VALUE", "Native payment method is not an enabled shared candidate");
        const paymentMethodId = row.payment_method_id === null ? null : id("paymentMethod", row.payment_method_id);
        const paymentMethodName = nullableText(row.payment_method_name);
        requireDomain((paymentMethodId === null) === (paymentMethodName === null)
          && (parameters.kind === "paymentAccount" ? paymentMethodId === parameters.paymentMethodId : paymentMethodId === null), "INVALID_DATABASE_VALUE", "Native payment method identity/label mismatch");
        requireDomain(parameters.kind === "customer" ? row.code !== null : row.code === null, "INVALID_DATABASE_VALUE", "Unexpected native reference code shape");
        return Object.freeze({ id: nativeId, name: text(row.name), code: nullableText(row.code), hallId, hallName, paymentMethodId, paymentMethodName });
      };
      if (parameters.kind === "paymentAccount") return this.paymentAccounts(query, parameters, signal, from, where, columns, values, decode);
      return this.page(query, parameters, from, where, columns, order, values, decode, orderValues);
    });
  }
  readTransferWarehouses(actor: ActorContext, input: CurrentTransferWarehouseQuery, signal: AbortSignal): Promise<CurrentFormPage<CurrentTransferWarehouse>> {
    const parameters = parseCurrentTransferWarehouseQuery(input);
    return this.snapshot(actor, { kind: "transfer-warehouses", parameters }, signal, async (query, _identity, grant) => {
      const values: unknown[] = [parameters.search]; const scope = hallPredicate("w.hall_id", grant, values);
      const nonzero = "EXISTS (SELECT 1 FROM naijue_erp.inventory_balance b WHERE b.warehouse_id = w.id AND b.quantity <> 0)";
      const eligible = parameters.direction === "FROM" ? `(w.enabled OR ${nonzero})` : "w.enabled";
      return this.page(query, parameters, "FROM naijue_erp.warehouse w JOIN naijue_erp.hall h ON h.id = w.hall_id",
        `${scope} AND ${eligible} AND (strpos(lower(w.name), lower($1::text)) > 0 OR strpos(lower(h.name), lower($1::text)) > 0)`,
        `w.id, w.name, w.hall_id, h.name AS hall_name, w.enabled, h.enabled AS hall_enabled, ${nonzero} AS has_nonzero_inventory`,
        `w.name COLLATE "C", w.id`, values, row => {
          const enabled = booleanValue(row.enabled), hasNonzeroInventory = booleanValue(row.has_nonzero_inventory);
          requireDomain(enabled || (parameters.direction === "FROM" && hasNonzeroInventory), "INVALID_DATABASE_VALUE", "Ineligible native transfer warehouse");
          const hallId = id("hall", row.hall_id);
          requireDomain(grant.kind === "all" || grant.hallIds.includes(hallId), "INVALID_DATABASE_VALUE", "Native transfer warehouse exceeds explicit form grant");
          return Object.freeze({ id: id("warehouse", row.id), name: text(row.name), hallId, hallName: text(row.hall_name),
            enabled, hallEnabled: booleanValue(row.hall_enabled), hasNonzeroInventory });
        });
    });
  }
  readProducts(actor: ActorContext, input: CurrentFormProductQuery, signal: AbortSignal): Promise<CurrentFormPage<CurrentFormProduct>> {
    const parameters = parseCurrentFormProductQuery(input);
    return this.snapshot(actor, { kind: "products", parameters }, signal, async (query, identity, grant) => {
      await this.formContext(query, identity, grant, parameters.context);
      return this.page(query, parameters, "FROM naijue_erp.product p LEFT JOIN naijue_erp.product_category pc ON pc.id=p.category_id", `p.enabled AND
        (strpos(lower(p.product_code), lower($1::text)) > 0 OR strpos(lower(p.name), lower($1::text)) > 0)`,
        "p.id, p.product_code, p.name, p.retail_price::text, p.enabled, p.category_id, pc.name AS category_name", `p.product_code COLLATE "C", p.id`, [parameters.search], row => {
          requireDomain(row.enabled === true, "INVALID_DATABASE_VALUE", "Ineligible current product");
          return Object.freeze({ id: id("product", row.id), code: text(row.product_code), name: text(row.name), retailPrice: price(row.retail_price), minimumPriceAvailability: "UNAVAILABLE",
            category: Object.freeze({ id: id("category", row.category_id), label: nullableText(row.category_name) }) });
        });
    });
  }
  readProductSkus(actor: ActorContext, input: CurrentFormProductSkuQuery, signal: AbortSignal): Promise<CurrentFormPage<CurrentFormSku>> {
    const parameters = parseCurrentFormProductSkuQuery(input);
    return this.snapshot(actor, { kind: "product-skus", parameters }, signal, async (query, identity, grant) => {
      await this.formContext(query, identity, grant, parameters.context);
      return this.page(query, parameters, SKU_JOINS, `${SKU_ENABLED} AND s.product_id = $1::uuid`, SKU_COLUMNS, SKU_ORDER, [parameters.productId], row => {
        const result = sku(row); requireDomain(result.productId === parameters.productId, "INVALID_DATABASE_VALUE", "SKU does not match target product"); return result;
      });
    });
  }
  readSkuBatch(actor: ActorContext, input: CurrentFormSkuBatchQuery, signal: AbortSignal): Promise<readonly CurrentFormSku[]> {
    const parameters = parseCurrentFormSkuBatchQuery(input);
    return this.snapshot(actor, { kind: "sku-batch", parameters }, signal, async (query, identity, grant) => {
      await this.formContext(query, identity, grant, parameters.context);
      const rows = (await query(`/* current-form:sku-batch */ SELECT ${SKU_COLUMNS} ${SKU_JOINS}
        WHERE ${SKU_ENABLED} AND s.id = ANY($1::uuid[]) ORDER BY s.id LIMIT $2`, [[...parameters.skuIds].sort(), parameters.skuIds.length + 1])).rows;
      // Deliberately do not disclose which requested SKU was disabled/missing.
      requireDomain(rows.length === parameters.skuIds.length, "SKU_UNAVAILABLE", "Requested current SKU facts are unavailable");
      const items = rows.map(sku); const byId = new Map(items.map(row => [row.id, row]));
      requireDomain(byId.size === items.length && items.every(row => parameters.skuIds.includes(row.id)), "INVALID_DATABASE_VALUE", "Unexpected native SKU batch identity");
      return Object.freeze(parameters.skuIds.map(id => byId.get(id)!));
    });
  }
  readBarcode(actor: ActorContext, input: CurrentFormBarcodeQuery, signal: AbortSignal): Promise<CurrentFormBarcodeResult> {
    const parameters = parseCurrentFormBarcodeQuery(input);
    return this.snapshot(actor, { kind: "barcode", parameters }, signal, async (query, identity, grant) => {
      const schema = (await query("/* current-form:barcode-schema */ SELECT array_agg(version ORDER BY version) versions FROM naijue_erp.schema_migration")).rows;
      requireDomain(schema.length === 1, "CURRENT_FORM_READ_UNAVAILABLE", "Reviewed exact barcode source schema required");
      // R1 is exact19. Future prefixes need their own reviewed capability; a new
      // version number alone must never enable staged/new-creation read paths.
      assertHistoryPublicationSchema19(schema[0]!.versions);
      const context = parameters.context;
      if (context.kind === "SALES") await this.salesHall(query, identity, grant, context.hallId);
      const warehouseIds = context.kind === "SALES" ? [context.warehouseId] : [context.fromWarehouseId, context.toWarehouseId];
      const warehouses = (await query(`/* current-form:barcode-warehouses */ SELECT w.id,w.hall_id,w.enabled,h.id native_hall_id,
        EXISTS(SELECT 1 FROM naijue_erp.inventory_balance b WHERE b.warehouse_id=w.id AND b.quantity<>0) has_nonzero_inventory
        FROM naijue_erp.warehouse w JOIN naijue_erp.hall h ON h.id=w.hall_id
        WHERE w.id=ANY($1::uuid[]) ORDER BY w.id LIMIT 3`, [warehouseIds])).rows;
      if (warehouses.length !== warehouseIds.length) denied();
      const seen = new Set<string>();
      for (const w of warehouses) {
        const warehouseId = id("warehouse", w.id), hallId = id("hall", w.hall_id);
        if (!warehouseIds.includes(warehouseId) || seen.has(warehouseId) || w.native_hall_id !== hallId
          || grant.kind === "halls" && !grant.hallIds.includes(hallId)) denied(); seen.add(warehouseId);
        const enabled = booleanValue(w.enabled), nonzero = booleanValue(w.has_nonzero_inventory);
        if (context.kind === "SALES" ? hallId !== context.hallId || !enabled
          : warehouseId === context.fromWarehouseId ? !enabled && !nonzero : !enabled) denied();
      }
      const rows = (await query(`/* current-form:barcode */ SELECT b.id binding_id,b.barcode,b.barcode_kind,b.enabled binding_enabled,
        ${SKU_COLUMNS}, (to_jsonb(p)->>'deleted_at' IS NULL AND to_jsonb(c)->>'deleted_at' IS NULL AND to_jsonb(f)->>'deleted_at' IS NULL
          AND NOT EXISTS(SELECT 1 FROM naijue_erp.product_category pc WHERE pc.id=p.category_id AND to_jsonb(pc)->>'deleted_at' IS NOT NULL)) references_retained,
        NOT EXISTS(SELECT 1 FROM naijue_erp.import_source_row src JOIN naijue_erp.import_batch ib ON ib.id=src.batch_id
          WHERE ib.status<>'IMPORTED' AND ((src.entity_type='SKU' AND src.field_provenance->'native_sku_import'->>'native_sku_id'=s.id::text)
            OR (src.entity_type='BARCODE' AND src.field_provenance->>'native_sku_id'=s.id::text AND src.field_provenance->>'native_barcode'=b.barcode))) source_published
        ${SKU_JOINS.replace("JOIN naijue_erp.size_group_member", "LEFT JOIN naijue_erp.size_group_member")}
        JOIN naijue_erp.sku_barcode b ON b.sku_id=s.id
        WHERE b.barcode COLLATE "C"=$1::text COLLATE "C" LIMIT 2`, [parameters.barcode])).rows;
      requireDomain(rows.length <= 1, "INVALID_DATABASE_VALUE", "Exact native barcode resolves multiple identities");
      const empty = (state: "NOT_FOUND" | "UNAVAILABLE"): CurrentFormBarcodeResult => Object.freeze({ state, barcode: parameters.barcode, binding: null, sku: null });
      if (rows.length === 0) return empty("NOT_FOUND"); const row = rows[0]!;
      const bindingId = id("barcode", row.binding_id);
      requireDomain(row.barcode === parameters.barcode && (row.barcode_kind === "MAIN" || row.barcode_kind === "CONFIRMED_OLD"),
        "INVALID_DATABASE_VALUE", "Exact retained barcode identity changed");
      if (!booleanValue(row.binding_enabled) || !booleanValue(row.sku_enabled) || !booleanValue(row.product_enabled)
        || !booleanValue(row.color_enabled) || !booleanValue(row.fit_enabled) || !booleanValue(row.references_retained) || !booleanValue(row.source_published)
        || row.member_size_id !== row.size_id) return empty("UNAVAILABLE");
      return Object.freeze({ state: "FOUND", barcode: parameters.barcode, binding: Object.freeze({ id: bindingId, kind: row.barcode_kind }), sku: sku(row) });
    });
  }
}
