import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import type { CatalogueMaintenanceKind, CatalogueMaintenanceTransaction, CatalogueMaintenanceUnitOfWork, CatalogueWriteRecord } from "../../../packages/application/src/catalogue-maintenance-ports.ts";
import type { MaintenancePgContext, MaintenancePgUnitOfWork } from "./maintenance-command-unit-of-work.ts";
import { booleanValue, integerValue, nullableString, stringValue, versionFromSql } from "./codec.ts";
const table = (kind: CatalogueMaintenanceKind): "product_category" | "color" | "fit" => kind === "CATEGORY" ? "product_category" : kind === "COLOR" ? "color" : "fit";
const uuid = (v: unknown): string => entityId("category", stringValue(v));
export class PostgresCatalogueMaintenanceUnitOfWork implements CatalogueMaintenanceUnitOfWork {
  private readonly driver: MaintenancePgUnitOfWork;
  constructor(driver: MaintenancePgUnitOfWork) { if (typeof driver?.transaction !== "function") throw new TypeError("Catalogue writes require shared driver"); this.driver = driver; }
  transaction<T>(work: (tx: CatalogueMaintenanceTransaction) => Promise<T>): Promise<T> {
    return this.driver.transaction(async context => { const tx = new CatalogueSqlTransaction(context); try { return await work(tx); } finally { tx.close(); } });
  }
}
class CatalogueSqlTransaction implements CatalogueMaintenanceTransaction {
  readonly evidence: MaintenancePgContext["evidence"]; private readonly context: MaintenancePgContext;
  private active = true; private directory = false; private loaded: { readonly kind: CatalogueMaintenanceKind; readonly id: string } | undefined;
  constructor(context: MaintenancePgContext) { this.context = context; this.evidence = context.evidence; }
  close() { this.active = false; }
  private query(sql: string, values: unknown[] = []) { requireDomain(this.active, "TRANSACTION_CLOSED", "Catalogue transaction closed"); return this.context.client.query(sql, values); }
  async lockDirectory() { if (!this.directory) { requireDomain(!this.loaded, "TRANSACTION_SCOPE", "Lock directory before native identity"); await this.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["naijue:catalogue-maintenance"]); this.directory = true; } }
  async load(kind: CatalogueMaintenanceKind, id: string): Promise<CatalogueWriteRecord | undefined> {
    requireDomain(this.directory && !this.loaded, "TRANSACTION_SCOPE", "One catalogue root per command"); entityId("category", id); this.loaded = { kind, id };
    const rows = (await this.query(`SELECT id,name,version,to_char(deleted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS deleted_at,${kind === "CATEGORY" ? "parent_id,display_order" : "code,enabled"} FROM naijue_erp.${table(kind)} WHERE id=$1::uuid FOR UPDATE`, [id])).rows;
    requireDomain(rows.length <= 1, "INVALID_DATABASE_VALUE", "Catalogue identity not unique"); if (!rows[0]) return undefined;
    const r = rows[0], base = { id: uuid(r.id), name: stringValue(r.name), version: versionFromSql(r.version), deletedAt: nullableString(r.deleted_at) }; requireDomain(base.id === id, "INVALID_DATABASE_VALUE", "Catalogue identity mismatch");
    return kind === "CATEGORY" ? { ...base, kind, parentId: r.parent_id === null ? null : uuid(r.parent_id), displayOrder: integerValue(r.display_order) } : { ...base, kind, code: stringValue(r.code), enabled: booleanValue(r.enabled) };
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
