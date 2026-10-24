import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import type { CatalogueMaintenanceKind, CatalogueMaintenanceTransaction, CatalogueMaintenanceUnitOfWork, CatalogueWriteRecord, CategoryOrderTransaction, CategoryOrderOriginal, CategoryWriteRecord } from "../../../packages/application/src/catalogue-maintenance-ports.ts";
import { checkedCategoryOrderEvidence, checkedCategoryOrderResult } from "../../../packages/application/src/catalogue-maintenance-validation.ts";
import { CATALOGUE_SETTINGS_MAX_CATEGORIES } from "../../../packages/application/src/catalogue-settings-read-ports.ts";
import { requestHash } from "../../../packages/application/src/request-hash.ts";
import type { MaintenancePgContext, MaintenancePgUnitOfWork } from "./maintenance-command-unit-of-work.ts";
import { booleanValue, integerValue, jsonObject, nullableString, stringValue, versionFromSql } from "./codec.ts";
const table = (kind: CatalogueMaintenanceKind): "product_category" | "color" | "fit" => kind === "CATEGORY" ? "product_category" : kind === "COLOR" ? "color" : "fit";
const uuid = (v: unknown): string => entityId("category", stringValue(v));
/** D1 issues this only for the original live maintenance context and exact v15
 * database guard/catalog. It must verify the original managed client, not its facade. */
export interface CategoryOrderWriteCapability {
  readonly profile: "CATEGORY_ORDER_UNDO_V15";
  readonly assertReady: (context: MaintenancePgContext) => Promise<void>;
}
export class PostgresCatalogueMaintenanceUnitOfWork implements CatalogueMaintenanceUnitOfWork {
  private readonly driver: MaintenancePgUnitOfWork;
  private readonly orderCapability: CategoryOrderWriteCapability | undefined;
  constructor(driver: MaintenancePgUnitOfWork, orderCapability?: CategoryOrderWriteCapability) {
    if (typeof driver?.transaction !== "function") throw new TypeError("Catalogue writes require shared driver"); this.driver = driver;
    if (orderCapability !== undefined) {
      if (!orderCapability || Object.getPrototypeOf(orderCapability) !== Object.prototype || Reflect.ownKeys(orderCapability).length !== 2) throw new TypeError("Exact category order write capability required");
      const p = Object.getOwnPropertyDescriptor(orderCapability, "profile"), v = Object.getOwnPropertyDescriptor(orderCapability, "assertReady");
      if (!p || !("value" in p) || p.value !== "CATEGORY_ORDER_UNDO_V15" || !v || !("value" in v) || typeof v.value !== "function") throw new TypeError("Exact category order write capability required");
      this.orderCapability = Object.freeze({ profile: "CATEGORY_ORDER_UNDO_V15", assertReady: v.value.bind(orderCapability) });
    }
  }
  transaction<T>(work: (tx: CatalogueMaintenanceTransaction) => Promise<T>): Promise<T> {
    return this.driver.transaction(async context => { const tx = new CatalogueSqlTransaction(context, this.orderCapability); try { return await work(tx); } finally { tx.close(); } });
  }
}
class CatalogueSqlTransaction implements CatalogueMaintenanceTransaction {
  readonly evidence: MaintenancePgContext["evidence"]; private readonly context: MaintenancePgContext;
  private active = true; private directory = false; private loaded: { readonly kind: CatalogueMaintenanceKind; readonly id: string } | undefined;
  readonly categoryOrder?: CategoryOrderTransaction;
  private orderReady = false; private siblings: Map<string, CategoryWriteRecord> | undefined; private readonly orderWrites = new Set<string>();
  constructor(context: MaintenancePgContext, orderCapability?: CategoryOrderWriteCapability) {
    this.context = context; this.evidence = context.evidence;
    if (orderCapability) this.categoryOrder = Object.freeze({
      assertReady: async () => {
        requireDomain(this.active && this.directory && !this.loaded, "TRANSACTION_SCOPE", "Original locked catalogue context required");
        const result: unknown = await orderCapability.assertReady(this.context);
        requireDomain(result === undefined, "CATALOGUE_ORDER_NOT_READY", "Actual category order guard proof required"); this.orderReady = true;
      },
      loadSiblings: (parentId: string | null) => this.loadSiblings(parentId),
      loadOriginal: (operationId: string, actorAccountId: string) => this.loadOriginal(operationId, actorAccountId),
      put: (previous: CategoryWriteRecord, next: CategoryWriteRecord) => this.putOrder(previous, next)
    });
  }
  close() { this.active = false; }
  private query(sql: string, values: unknown[] = []) { requireDomain(this.active, "TRANSACTION_CLOSED", "Catalogue transaction closed"); return this.context.client.query(sql, values); }
  async lockDirectory() { if (!this.directory) { requireDomain(!this.loaded, "TRANSACTION_SCOPE", "Lock directory before native identity"); await this.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["naijue:catalogue-maintenance"]); this.directory = true; } }
  async load(kind: CatalogueMaintenanceKind, id: string): Promise<CatalogueWriteRecord | undefined> {
    requireDomain(this.directory && !this.loaded && !this.siblings, "TRANSACTION_SCOPE", "One catalogue root per command"); entityId("category", id); this.loaded = { kind, id };
    const rows = (await this.query(`SELECT id,name,version,to_char(deleted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS deleted_at,${kind === "CATEGORY" ? "parent_id,display_order" : "code,enabled"} FROM naijue_erp.${table(kind)} WHERE id=$1::uuid FOR UPDATE`, [id])).rows;
    requireDomain(rows.length <= 1, "INVALID_DATABASE_VALUE", "Catalogue identity not unique"); if (!rows[0]) return undefined;
    const r = rows[0], base = { id: uuid(r.id), name: stringValue(r.name), version: versionFromSql(r.version), deletedAt: nullableString(r.deleted_at) }; requireDomain(base.id === id, "INVALID_DATABASE_VALUE", "Catalogue identity mismatch");
    return kind === "CATEGORY" ? { ...base, kind, parentId: r.parent_id === null ? null : uuid(r.parent_id), displayOrder: integerValue(r.display_order) } : { ...base, kind, code: stringValue(r.code), enabled: booleanValue(r.enabled) };
  }
  private async loadSiblings(parentId: string | null): Promise<readonly CategoryWriteRecord[]> {
    requireDomain(this.orderReady && this.directory && !this.loaded && !this.siblings, "TRANSACTION_SCOPE", "One verified category sibling scope per command");
    if (parentId !== null) {
      const parent = (await this.query("/* category-order:parent */ SELECT id FROM naijue_erp.product_category WHERE id=$1::uuid AND deleted_at IS NULL FOR SHARE", [parentId])).rows;
      requireDomain(parent.length === 1 && parent[0]!.id === parentId, "CATALOGUE_NOT_FOUND", "Retained category parent unavailable");
    }
    const rows = (await this.query(`/* category-order:siblings */ SELECT id,name,version,parent_id,display_order
      FROM naijue_erp.product_category WHERE parent_id IS NOT DISTINCT FROM $1::uuid AND deleted_at IS NULL
      ORDER BY id LIMIT $2 FOR UPDATE`, [parentId, CATALOGUE_SETTINGS_MAX_CATEGORIES + 1])).rows;
    requireDomain(rows.length <= CATALOGUE_SETTINGS_MAX_CATEGORIES, "CATEGORY_ORDER_CONFLICT", "Complete sibling scope exceeds the existing tree bound");
    const siblings: CategoryWriteRecord[] = rows.map(r => {
      const parent = r.parent_id === null ? null : uuid(r.parent_id);
      requireDomain(parent === parentId, "INVALID_DATABASE_VALUE", "Category sibling belongs to another parent");
      return { kind: "CATEGORY", id: uuid(r.id), name: stringValue(r.name), version: versionFromSql(r.version), parentId: parent, displayOrder: integerValue(r.display_order), deletedAt: null };
    });
    requireDomain(new Set(siblings.map(r => r.id)).size === siblings.length, "INVALID_DATABASE_VALUE", "Duplicate category sibling identity");
    this.siblings = new Map(siblings.map(r => [r.id, r])); return structuredClone(siblings);
  }
  private async loadOriginal(operationId: string, actorAccountId: string): Promise<CategoryOrderOriginal | undefined> {
    requireDomain(this.orderReady && this.directory && !this.loaded && !this.siblings, "TRANSACTION_SCOPE", "Read original reorder before loading its sibling scope");
    const rows = (await this.query(`/* category-order:original */ SELECT r.actor_account_id,r.result_data,a.before_values,a.after_values
      FROM naijue_erp.operation_receipt r JOIN naijue_erp.audit_change a ON a.operation_id=r.id AND a.object_type=r.target_type
        AND a.object_id=r.target_id AND a.actor_account_id=r.actor_account_id AND a.action=r.action
      WHERE r.id=$1::uuid AND r.actor_account_id=$2::uuid AND r.target_type='CATEGORY' AND r.action='REORDER' AND r.status='COMMITTED'`, [operationId, actorAccountId])).rows;
    requireDomain(rows.length <= 1, "INVALID_DATABASE_VALUE", "Original category reorder is not unique");
    if (!rows[0]) return undefined;
    const r = rows[0], result = checkedCategoryOrderResult(jsonObject(r.result_data));
    requireDomain(r.actor_account_id === actorAccountId && result.operationId === operationId, "INVALID_DATABASE_VALUE", "Original category reorder identity differs");
    return { actorAccountId, result, before: checkedCategoryOrderEvidence(jsonObject(r.before_values).category_order), after: checkedCategoryOrderEvidence(jsonObject(r.after_values).category_order) };
  }
  private async putOrder(previous: CategoryWriteRecord, next: CategoryWriteRecord): Promise<void> {
    const locked = this.siblings?.get(previous.id);
    requireDomain(this.orderReady && locked && !this.loaded && !this.orderWrites.has(previous.id) && requestHash(locked) === requestHash(previous)
      && requestHash({ ...next, displayOrder: previous.displayOrder, version: previous.version }) === requestHash(previous)
      && next.version === previous.version + 1 && next.displayOrder !== previous.displayOrder,
    "TRANSACTION_SCOPE", "Only the original locked category order/version may change once");
    const saved = await this.query(`/* category-order:update */ UPDATE naijue_erp.product_category SET display_order=$2,version=$3
      WHERE id=$1::uuid AND version=$4 AND parent_id IS NOT DISTINCT FROM $5::uuid AND display_order=$6 AND deleted_at IS NULL`,
    [next.id, next.displayOrder, next.version, previous.version, previous.parentId, previous.displayOrder]);
    requireDomain(saved.rowCount === 1, "CATEGORY_ORDER_CONFLICT", "Category order CAS did not match the locked before state"); this.orderWrites.add(previous.id);
  }
  private assertRoot(row: CatalogueWriteRecord) { requireDomain(this.loaded?.id === row.id && this.loaded.kind === row.kind, "TRANSACTION_SCOPE", "Change only locked catalogue root"); }
  async validateChange(previous: CatalogueWriteRecord | undefined, next: CatalogueWriteRecord): Promise<void> {
    this.assertRoot(next);
    if (next.deletedAt !== null) return;
    if (next.kind === "CATEGORY") {
      requireDomain(next.parentId !== next.id, "CATEGORY_CYCLE", "Category cannot parent itself");
      if (next.parentId !== null) {
        const chain = (await this.query(`WITH RECURSIVE ancestors AS (
          SELECT id,parent_id,deleted_at,ARRAY[id] AS trail,false AS cyclic,0 AS depth FROM naijue_erp.product_category WHERE id=$1::uuid
          UNION ALL SELECT c.id,c.parent_id,c.deleted_at,a.trail||c.id,c.id=ANY(a.trail),a.depth+1 FROM ancestors a
          JOIN naijue_erp.product_category c ON c.id=a.parent_id WHERE NOT a.cyclic AND a.depth<4999)
          SELECT id,parent_id,deleted_at IS NULL AS retained,cyclic FROM ancestors ORDER BY depth`, [next.parentId])).rows;
        requireDomain(chain.length > 0 && chain.length <= 5000 && chain.at(-1)!.parent_id === null && chain.every(c => c.retained === true && c.cyclic === false && c.id !== next.id), "CATEGORY_CYCLE", "Category parent path is missing, deleted or cyclic");
        const moved = previous === undefined || previous.kind !== "CATEGORY" || previous.parentId !== next.parentId;
        requireDomain(!moved || chain.length === 1, "CATEGORY_DEPTH", "New category parent must be a first-level category; legacy structure remains retained");
        await this.query("SELECT id FROM naijue_erp.product_category WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE", [chain.map(c => uuid(c.id))]);
      }
      const duplicate = (await this.query("SELECT EXISTS(SELECT 1 FROM naijue_erp.product_category WHERE id<>$1::uuid AND parent_id IS NOT DISTINCT FROM $2::uuid AND name=$3 AND deleted_at IS NULL) AS duplicate", [next.id, next.parentId, next.name])).rows;
      requireDomain(duplicate.length === 1 && duplicate[0]!.duplicate === false, "CATALOGUE_NAME_CONFLICT", "Sibling category name already exists");
    } else {
      const duplicate = (await this.query(`SELECT EXISTS(SELECT 1 FROM naijue_erp.${table(next.kind)} WHERE id<>$1::uuid AND (name=$2 OR code=$3)) AS duplicate`, [next.id, next.name, next.code])).rows;
      requireDomain(duplicate.length === 1 && duplicate[0]!.duplicate === false, "CATALOGUE_NAME_CONFLICT", "Catalogue name/code already belongs to another retained identity");
    }
  }
  async assertUnreferenced(row: CatalogueWriteRecord): Promise<void> {
    this.assertRoot(row);
    const predicate = row.kind === "CATEGORY" ? "EXISTS(SELECT 1 FROM naijue_erp.product_category WHERE parent_id=$1::uuid AND deleted_at IS NULL) OR EXISTS(SELECT 1 FROM naijue_erp.product WHERE category_id=$1::uuid)"
      : `EXISTS(SELECT 1 FROM naijue_erp.sku WHERE ${row.kind === "COLOR" ? "color_id" : "fit_id"}=$1::uuid)${row.kind === "COLOR" ? " OR EXISTS(SELECT 1 FROM naijue_erp.product_image WHERE color_id=$1::uuid)" : ""}`;
    const rows = (await this.query(`SELECT (${predicate}) AS referenced`, [row.id])).rows;
    requireDomain(rows.length === 1 && rows[0]!.referenced === false, "CATALOGUE_IN_USE", "Products, actual specifications, images or child categories retain this identity");
  }
  async put(previous: CatalogueWriteRecord | undefined, next: CatalogueWriteRecord): Promise<void> {
    this.assertRoot(next); requireDomain(next.version === (previous?.version ?? 0) + 1, "TRANSACTION_SCOPE", "Catalogue version advances once");
    const fields = next.kind === "CATEGORY" ? ["parent_id", "display_order"] : ["code", "enabled"], extra = next.kind === "CATEGORY" ? [next.parentId, next.displayOrder] : [next.code, next.enabled];
    const parameters = [next.id, next.name, next.version, next.deletedAt, ...extra];
    try {
      const written = previous ? await this.query(`UPDATE naijue_erp.${table(next.kind)} SET name=$2,version=$3,deleted_at=$4::timestamptz,${fields[0]}=$5,${fields[1]}=$6 WHERE id=$1::uuid AND version=$7 AND deleted_at IS NULL`, [...parameters, previous.version])
        : await this.query(`INSERT INTO naijue_erp.${table(next.kind)}(id,name,version,deleted_at,${fields.join(",")}) VALUES($1,$2,$3,$4::timestamptz,$5,$6)`, parameters);
      requireDomain(written.rowCount === 1, "VERSION_CONFLICT", "Catalogue save did not match actual version");
    } catch (error) { if ((error as { code?: string }).code === "23505") requireDomain(false, "CATALOGUE_NAME_CONFLICT", "Catalogue code already exists"); throw error; }
  }
}
