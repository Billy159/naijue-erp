import type { ActorContext } from "./ports.ts";
import { CATALOGUE_PRICE_KEYS } from "./catalogue-price-input.ts";
export const SETTINGS_AUDIT_MODULES = ["PRODUCT", "CATEGORY", "COLOR", "FIT", "HALL", "WAREHOUSE", "STAFF", "ACCOUNT", "PAYMENT_METHOD", "PAYMENT_ACCOUNT", "CUSTOMER", "SUPPLIER"] as const;
export type SettingsAuditModule = typeof SETTINGS_AUDIT_MODULES[number];
export const SETTINGS_AUDIT_ACTIONS = ["CREATE", "EDIT", "DISABLE", "RESTORE", "DELETE", "LEAVE", "REINSTATE", "RESET_PASSWORD"] as const;
export type SettingsAuditAction = typeof SETTINGS_AUDIT_ACTIONS[number];
export interface SettingsAuditQuery {
  readonly module: SettingsAuditModule | "ALL"; readonly objectId: string | null;
  readonly objectSearch: string; readonly actorSearch: string; readonly action: SettingsAuditAction | "ALL";
  readonly dateFrom: string | null; readonly dateTo: string | null; readonly page: number; readonly pageSize: 20 | 50 | 100;
}
export type SettingsAuditValue = { readonly state: "ABSENT" | "NULL" }
  | { readonly state: "VALUE"; readonly value: string | boolean | number }
  | { readonly state: "IDS"; readonly value: readonly string[] }
  | { readonly state: "ROW_COUNT"; readonly value: number };
export interface SettingsAuditItem {
  readonly id: string; readonly operationId: string; readonly occurredAt: string | null; readonly module: SettingsAuditModule;
  readonly object: { readonly id: string; readonly name: string | null; readonly code: string | null };
  readonly actor: { readonly accountId: string | null; readonly staffId: string | null; readonly name: string | null; readonly loginName: string | null };
  readonly action: SettingsAuditAction | null; readonly oldVersion: number | null; readonly newVersion: number | null;
  readonly changes: readonly { readonly field: string; readonly label: string; readonly before: SettingsAuditValue; readonly after: SettingsAuditValue }[];
  readonly credentialActions: readonly ("CREATE" | "RESET_PASSWORD")[];
}
export interface SettingsAuditPage { readonly items: readonly SettingsAuditItem[]; readonly total: number; readonly page: number; readonly pageSize: 20 | 50 | 100 }
/** The reader authenticates current database role; ActorContext carries no role assertion. */
export interface SettingsAuditRawPage { readonly role: "ADMIN" | "WAREHOUSE"; readonly total: unknown; readonly items: readonly unknown[] }
export interface SettingsAuditReader { read(actor: ActorContext, query: SettingsAuditQuery, signal: AbortSignal): Promise<SettingsAuditRawPage> }
export interface SettingsAuditField { readonly key: string; readonly label: string; readonly format: "value" | "ids" | "rows"; readonly valueType: "text" | "boolean" | "integer" | "uuid" | "money" | "timestamp" | "uuid[]" | "row-count" }
const fields = (...entries: readonly (readonly [string, string, ("value" | "ids" | "rows")?])[]): readonly SettingsAuditField[] => Object.freeze(entries.map(([key, label, format]) => Object.freeze({ key, label, format: format ?? "value", valueType: format === "rows" ? "row-count" : format === "ids" ? "uuid[]" : ["enabled", "login_enabled"].includes(key) ? "boolean" : ["year", "display_order", "auth_version"].includes(key) ? "integer" : key.endsWith("_id") ? "uuid" : key.endsWith("_price") ? "money" : key.endsWith("_at") ? "timestamp" : "text" })));
const ordinary = fields(["code", "编号"], ["name", "名称"], ["enabled", "启用状态"]);
/** Closed projection shared by SQL and output validation. No raw nested audit data is returned. */
export const SETTINGS_AUDIT_FIELDS: Readonly<Record<SettingsAuditModule, readonly SettingsAuditField[]>> = Object.freeze({
  CUSTOMER: ordinary, SUPPLIER: ordinary, PAYMENT_METHOD: fields(["name", "名称"], ["enabled", "启用状态"]),
  COLOR: fields(["code", "编号"], ["name", "名称"], ["enabled", "启用状态"], ["deleted_at", "删除时间"]),
  FIT: fields(["code", "编号"], ["name", "名称"], ["enabled", "启用状态"], ["deleted_at", "删除时间"]),
  CATEGORY: fields(["name", "名称"], ["parent_id", "上级分类ID"], ["display_order", "排序"], ["deleted_at", "删除时间"]),
  HALL: fields(["name", "名称"], ["enabled", "启用状态"], ["default_customer_id", "默认客户ID"], ["default_sales_warehouse_id", "默认销售仓ID"]),
  WAREHOUSE: fields(["name", "名称"], ["enabled", "启用状态"], ["hall_id", "所属营业厅ID"], ["created_operation_id", "创建操作ID"]),
  STAFF: fields(["name", "姓名"], ["role", "业务角色"], ["hall_id", "所属营业厅ID"], ["contact", "联系方式"], ["employment_status", "任职状态"], ["accounts", "关联账号变更行数", "rows"]),
  ACCOUNT: fields(["staff_id", "员工ID"], ["login_name", "登录名"], ["login_enabled", "登录启用"], ["auth_version", "会话授权版本"], ["created_at", "创建时间"], ["updated_at", "更新时间"]),
  PAYMENT_ACCOUNT: fields(["name", "名称"], ["enabled", "启用状态"], ["payment_method_id", "收款方式ID"], ["payment_halls", "营业厅关联变更行数", "rows"]),
  PRODUCT: fields(["product_code", "商品编号"], ["name", "名称"], ["category_id", "分类ID"], ["supplier_id", "供货商ID"], ["season_id", "原季节ID"], ["season_ids", "季节ID集合", "ids"], ["size_group_id", "尺码组ID"], ["year", "年份"], ["system_item_code", "系统款号"], ["thickness", "厚薄"], ["collar_pants_type", "领型／裤型"], ["default_barcode_scheme_id", "默认条码方案ID"], ["enabled", "启用状态"], ["deleted_at", "删除时间"],
    ...CATALOGUE_PRICE_KEYS.map(key => [key, ({ purchase_price: "进价", retail_price: "零售价", minimum_price: "最低价" } as Readonly<Record<string, string>>)[key] ?? `批发价${key.match(/\d+/)?.[0]}`] as const),
    ["skus", "规格变更行数", "rows"], ["barcodes", "条码变更行数", "rows"], ["images", "图片变更行数", "rows"])
});
