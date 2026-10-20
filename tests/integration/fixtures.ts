/** Synthetic-only facts. Not a production seed, catalogue, administrator, login credential or real stock baseline. */
import assert from "node:assert/strict";
import type { Pool } from "pg";
import type { EntityId, EntityKind } from "../../packages/domain/src/values.ts";
import { businessDate, entityId, minorAmount, multiplyMoney, negateQuantity, quantity } from "../../packages/domain/src/values.ts";
import type { SalesDocument, SalesDraft } from "../../packages/domain/src/documents.ts";
import type { ActorContext, SalesAuthorization, SalesBusinessRules } from "../../packages/application/src/ports.ts";
import type { TransferActor, TransferDraft } from "../../packages/application/src/transfer-ports.ts";

export const SYNTHETIC_TIME = "2026-10-20T12:00:00.000Z";
export const SYNTHETIC_DATE = businessDate("2026-10-20");
export const syntheticId = <K extends EntityKind>(kind: K, value: number): EntityId<K> =>
  entityId(kind, `7e570000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`);
export const ids = {
  customer: syntheticId("customer", 1), supplier: syntheticId("supplier", 2), hall: syntheticId("hall", 3), otherHall: syntheticId("hall", 4),
  warehouse: syntheticId("warehouse", 5), toWarehouse: syntheticId("warehouse", 6), staff: syntheticId("staff", 7), account: syntheticId("account", 8),
  category: syntheticId("category", 9), color: syntheticId("color", 10), fit: syntheticId("fit", 11), size: syntheticId("size", 12),
  otherSize: syntheticId("size", 13), group: syntheticId("sizeGroup", 14), product: syntheticId("product", 15),
  sku: syntheticId("sku", 16), uncoveredSku: syntheticId("sku", 17), method: syntheticId("paymentMethod", 18),
  payment: syntheticId("paymentAccount", 19), image: "7e570000-0000-4000-8000-000000000014"
};
export const actor: ActorContext = { accountId: ids.account, hallId: ids.hall };
export const transferActor: TransferActor = { ...actor, role: "SALESPERSON" };
export const SYNTHETIC_PASSWORD_SENTINEL = "SYNTHETIC_DISABLED_NONLOGIN_NOT_A_PASSWORD_HASH";
export const SYNTHETIC_REPLACED_SENTINEL = "SYNTHETIC_REPLACED_STILL_NOT_A_PASSWORD_HASH";
const snapshot = { productCode: "SYNTHETIC_ONLY_PRODUCT", productName: "SYNTHETIC ONLY PRODUCT", colorName: "SYNTHETIC ONLY COLOR",
  fitName: "SYNTHETIC ONLY FIT", sizeName: "SYNTHETIC ONLY SIZE A", barcode: null };

/** One atomic fixture insert after all five migrations. No existing objects/rows are updated or removed. */
export async function seedSyntheticReferences(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO naijue_erp.customer(id,code,name,enabled,version) VALUES($1,'SYNTHETIC_ONLY_CUSTOMER','SYNTHETIC ONLY CUSTOMER',true,1)", [ids.customer]);
    await client.query("INSERT INTO naijue_erp.supplier(id,code,name,enabled,version) VALUES($1,'SYNTHETIC_ONLY_SUPPLIER','SYNTHETIC ONLY SUPPLIER',true,1)", [ids.supplier]);
    await client.query("INSERT INTO naijue_erp.hall(id,name,enabled,version) VALUES($1,'SYNTHETIC ONLY HALL A',true,1),($2,'SYNTHETIC ONLY HALL B',true,1)", [ids.hall, ids.otherHall]);
    await client.query("INSERT INTO naijue_erp.warehouse(id,hall_id,name,enabled,version) VALUES($1,$2,'SYNTHETIC ONLY FROM',true,1),($3,$4,'SYNTHETIC ONLY TO',true,1)", [ids.warehouse, ids.hall, ids.toWarehouse, ids.otherHall]);
    await client.query("INSERT INTO naijue_erp.staff(id,name,hall_id,role,employment_status,version) VALUES($1,'SYNTHETIC DISABLED NONLOGIN STAFF',$2,'SALESPERSON','SYNTHETIC_INACTIVE',1)", [ids.staff, ids.hall]);
    await client.query(`INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at)
      VALUES($1,$2,'SYNTHETIC_DISABLED_NONLOGIN_ACCOUNT',$3,false,1,1,$4,$4)`, [ids.account, ids.staff, SYNTHETIC_PASSWORD_SENTINEL, SYNTHETIC_TIME]);
    await client.query("INSERT INTO naijue_erp.product_category(id,name,display_order,version) VALUES($1,'SYNTHETIC ONLY CATEGORY',1,1)", [ids.category]);
    await client.query("INSERT INTO naijue_erp.color(id,code,name,enabled,version) VALUES($1,'SYNTHETIC_ONLY_COLOR','SYNTHETIC ONLY COLOR',true,1)", [ids.color]);
    await client.query("INSERT INTO naijue_erp.fit(id,code,name,enabled,version) VALUES($1,'Z','SYNTHETIC ONLY FIT',true,1)", [ids.fit]);
    // Intentional repeated size code checks the absence of an invented global code uniqueness rule.
    await client.query("INSERT INTO naijue_erp.size(id,code,name) VALUES($1,'SYNTHETIC_REPEAT','SYNTHETIC ONLY SIZE A'),($2,'SYNTHETIC_REPEAT','SYNTHETIC ONLY SIZE B')", [ids.size, ids.otherSize]);
    await client.query("INSERT INTO naijue_erp.size_group(id,code,name) VALUES($1,'SYNTHETIC_ONLY_GROUP','SYNTHETIC ONLY GROUP')", [ids.group]);
    await client.query("INSERT INTO naijue_erp.size_group_member(size_group_id,size_id,display_order) VALUES($1,$2,1),($1,$3,2)", [ids.group, ids.size, ids.otherSize]);
    await client.query(`INSERT INTO naijue_erp.product(id,product_code,name,category_id,supplier_id,size_group_id,retail_price,enabled,version,year,system_item_code)
      VALUES($1,'SYNTHETIC_ONLY_PRODUCT','SYNTHETIC ONLY PRODUCT',$2,$3,$4,1.25,true,1,2026,'SYNTHETIC_ONLY_SYSTEM_CODE')`, [ids.product, ids.category, ids.supplier, ids.group]);
    await client.query(`INSERT INTO naijue_erp.sku(id,product_id,color_id,fit_id,size_id,sku_code,enabled,version)
      VALUES($1,$2,$3,$4,$5,'SYNTHETIC_ONLY_SKU_A',true,1),($6,$2,$3,$4,$7,'SYNTHETIC_ONLY_SKU_B_UNCOVERED',true,1)`,
    [ids.sku, ids.product, ids.color, ids.fit, ids.size, ids.uncoveredSku, ids.otherSize]);
    await client.query("INSERT INTO naijue_erp.payment_method(id,name,enabled,version) VALUES($1,'SYNTHETIC ONLY METHOD',true,1)", [ids.method]);
    await client.query("INSERT INTO naijue_erp.payment_account(id,name,payment_method_id,enabled,version) VALUES($1,'SYNTHETIC ONLY PAYMENT REFERENCE',$2,true,1)", [ids.payment, ids.method]);
    await client.query("INSERT INTO naijue_erp.payment_account_hall(payment_account_id,hall_id) VALUES($1,$2)", [ids.payment, ids.hall]);
    await client.query(`INSERT INTO naijue_erp.inventory_balance(warehouse_id,sku_id,quantity,version,updated_at)
      VALUES($1,$2,0,1,$3),($4,$2,0,1,$3)`, [ids.warehouse, ids.sku, SYNTHETIC_TIME, ids.toWarehouse]);
    // Metadata-only reference, no actual file, image bytes or storage/network operation.
    await client.query(`INSERT INTO naijue_erp.product_image(id,product_id,file_ref,mime,byte_size,display_order,created_at,version)
      VALUES($1,$2,'synthetic:not-a-real-file','image/png',1,1,$3,1)`, [ids.image, ids.product, SYNTHETIC_TIME]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

let idSequence = 10000;
export const newSyntheticId = <K extends EntityKind>(kind: K): EntityId<K> => syntheticId(kind, idSequence++);
export function salesDraft(number: number, options: { readonly quantities?: readonly string[]; readonly uncovered?: boolean; readonly businessType?: "SALE" | "RETURN" | "EXCHANGE" } = {}): SalesDraft {
  const salesId = syntheticId("sales", number);
  const lines = (options.quantities ?? ["2"]).map((count, index) => ({ id: syntheticId("salesLine", number * 10 + index), salesId,
    lineNo: index + 1, skuId: options.uncovered ? ids.uncoveredSku : ids.sku, quantity: quantity(count), referencePrice: minorAmount("125"),
    dealPrice: minorAmount("125"), pricingRule: "UNIT_PRICE" as const, discountTenths: null, zeroConfirmed: false,
    lineAmount: multiplyMoney(minorAmount("125"), quantity(count)), allocatedDiscount: minorAmount("0"), isGift: false, snapshot, isCurrent: true }));
  const due = minorAmount(lines.reduce((sum, line) => sum + line.lineAmount, 0n).toString());
  return { header: { id: salesId, number: `SYNTHETIC_PG_SALES_${number}`, businessType: options.businessType ?? "SALE", businessDate: SYNTHETIC_DATE,
    hallId: ids.hall, salespersonId: null, customerId: ids.customer, warehouseId: ids.warehouse, grossAmount: due, orderDiscount: minorAmount("0"), netDue: due, note: "SYNTHETIC ONLY" }, lines,
  settlements: due === 0n ? [] : [{ id: syntheticId("settlement", number * 10 + 9), salesId, lineNo: 1, paymentAccountId: ids.payment,
    direction: due < 0n ? "REFUND" : "RECEIVE", amount: minorAmount((due < 0n ? -due : due).toString()) }] };
}
export function transferDraft(number: number, quantities: readonly string[] = ["2", "3"], uncovered = false): TransferDraft {
  const transferId = syntheticId("transfer", number);
  return { header: { id: transferId, number: `SYNTHETIC_PG_TRANSFER_${number}`, businessDate: SYNTHETIC_DATE, fromWarehouseId: ids.warehouse,
    toWarehouseId: ids.toWarehouse, note: "SYNTHETIC ONLY" }, lines: quantities.map((count, index) => ({ id: syntheticId("transferLine", number * 10 + index),
    transferId, lineNo: index + 1, skuId: uncovered ? ids.uncoveredSku : ids.sku, quantity: quantity(count), snapshot, isCurrent: true })) };
}

/** Explicitly synthetic economics, not the production rule provider or an approved retail decision. */
export const SYNTHETIC_SALES_RULES: SalesBusinessRules = {
  assertDraftChange() {},
  assertReferencesAndEconomics(document: SalesDocument) {
    const lines = document.lines.filter(line => line.isCurrent);
    assert.equal(document.header.orderDiscount, 0n);
    for (const line of lines) {
      assert.ok([ids.sku, ids.uncoveredSku].includes(line.skuId)); assert.notEqual(line.quantity, 0n);
      assert.equal(line.lineAmount, multiplyMoney(line.dealPrice, line.quantity)); assert.equal(line.allocatedDiscount, 0n);
    }
    assert.equal(document.header.netDue, lines.reduce((sum, line) => sum + line.lineAmount, 0n));
  },
  inventoryDelta(_document, line) { return negateQuantity(line.quantity); }
};
/** No production authorization bypass is exported: this policy exists only for these exact synthetic facts. */
export const SYNTHETIC_SALES_AUTHORIZATION: SalesAuthorization = {
  async assertAllowed(context, _action, document) {
    assert.equal(context.accountId, ids.account); assert.equal(context.hallId, ids.hall);
    assert.equal(document.header.hallId, ids.hall); assert.equal(document.header.warehouseId, ids.warehouse); assert.equal(document.header.customerId, ids.customer);
    assert.ok(document.settlements.every(row => row.paymentAccountId === ids.payment));
  }
};
