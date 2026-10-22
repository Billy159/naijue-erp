import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import type { PaymentMaintenanceKind, PaymentMaintenanceTransaction, PaymentMaintenanceUnitOfWork, PaymentRecord } from "../../../packages/application/src/payment-maintenance-ports.ts";
import type { MaintenancePgContext, MaintenancePgUnitOfWork } from "./maintenance-command-unit-of-work.ts";
import { booleanValue, stringValue, versionFromSql } from "./codec.ts";
const table = (kind: PaymentMaintenanceKind): "payment_method" | "payment_account" => kind === "PAYMENT_METHOD" ? "payment_method" : "payment_account";
const uuid = (value: unknown): string => entityId("paymentAccount", stringValue(value));
/** D1 owns transaction lifecycle, current identity, original-key locking and evidence. */
export class PostgresPaymentMaintenanceUnitOfWork implements PaymentMaintenanceUnitOfWork {
  private readonly driver: MaintenancePgUnitOfWork;
  constructor(driver: MaintenancePgUnitOfWork) {
    if (typeof driver?.transaction !== "function") throw new TypeError("Payment maintenance requires the shared transaction driver"); this.driver = driver;
  }
  transaction<T>(work: (tx: PaymentMaintenanceTransaction) => Promise<T>): Promise<T> {
    return this.driver.transaction(async context => { const tx = new PaymentTransaction(context); try { return await work(tx); } finally { tx.close(); } });
  }
}
class PaymentTransaction implements PaymentMaintenanceTransaction {
  readonly evidence: MaintenancePgContext["evidence"]; private readonly context: MaintenancePgContext;
  private active = true; private loaded: { readonly kind: PaymentMaintenanceKind; readonly id: string } | undefined;
  constructor(context: MaintenancePgContext) { this.context = context; this.evidence = context.evidence; }
  close() { this.active = false; }
  private query(sql: string, values: unknown[] = []) { requireDomain(this.active, "TRANSACTION_CLOSED", "Payment transaction closed"); return this.context.client.query(sql, values); }
  async load(kind: PaymentMaintenanceKind, id: string): Promise<PaymentRecord | undefined> {
    requireDomain(this.loaded === undefined, "TRANSACTION_SCOPE", "Load exactly one payment root"); entityId("paymentAccount", id); this.loaded = { kind, id };
    await this.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`naijue:${table(kind)}:${id}`]);
    const rows = (await this.query(`SELECT id,name,enabled,version${kind === "PAYMENT_ACCOUNT" ? ",payment_method_id" : ""} FROM naijue_erp.${table(kind)} WHERE id=$1::uuid FOR UPDATE`, [id])).rows;
    requireDomain(rows.length <= 1, "INVALID_DATABASE_VALUE", "Nonunique payment identity"); if (!rows[0]) return undefined;
    const r = rows[0], base = { id: uuid(r.id), name: stringValue(r.name), enabled: booleanValue(r.enabled), version: versionFromSql(r.version) };
    requireDomain(base.id === id, "INVALID_DATABASE_VALUE", "Payment identity mismatch"); if (kind === "PAYMENT_METHOD") return { ...base, kind };
    const links = (await this.query("SELECT hall_id FROM naijue_erp.payment_account_hall WHERE payment_account_id=$1::uuid ORDER BY hall_id LIMIT 5001 FOR UPDATE", [id])).rows;
    requireDomain(links.length <= 5000, "PAYMENT_RELATION_TOO_LARGE", "Stored hall associations exceed edit bound"); const hallIds = links.map(r => uuid(r.hall_id));
    requireDomain(new Set(hallIds).size === hallIds.length, "INVALID_DATABASE_VALUE", "Duplicate native hall relation");
    return { ...base, kind, paymentMethodId: uuid(r.payment_method_id), hallIds };
  }
  private assertRoot(next: PaymentRecord) {
    requireDomain(this.loaded?.id === next.id && this.loaded.kind === next.kind, "TRANSACTION_SCOPE", "Change only the locked payment root");
  }
  async validateChange(previous: PaymentRecord | undefined, next: PaymentRecord): Promise<void> {
    this.assertRoot(next);
    if (next.kind === "PAYMENT_METHOD") {
      if (!next.enabled) {
        const rows = (await this.query("SELECT EXISTS(SELECT 1 FROM naijue_erp.payment_account WHERE payment_method_id=$1::uuid AND enabled) AS referenced", [next.id])).rows;
        requireDomain(rows.length === 1 && rows[0]!.referenced === false, "PAYMENT_METHOD_IN_USE", "Disable active payment accounts first");
      }
      return;
    }
    const method = (await this.query("SELECT id,enabled FROM naijue_erp.payment_method WHERE id=$1::uuid FOR SHARE", [next.paymentMethodId])).rows;
    requireDomain(method.length === 1 && method[0]!.id === next.paymentMethodId && (!next.enabled || method[0]!.enabled === true), "PAYMENT_REFERENCE_UNAVAILABLE", "Active account requires an active real payment method");
    if (next.hallIds.length) {
      const halls = (await this.query("SELECT id,enabled FROM naijue_erp.hall WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE", [[...next.hallIds]])).rows;
      const prior = new Set(previous?.kind === "PAYMENT_ACCOUNT" ? previous.hallIds : []), byId = new Map(halls.map(r => [uuid(r.id), booleanValue(r.enabled)]));
      requireDomain(byId.size === next.hallIds.length && next.hallIds.every(h => byId.has(h) && (prior.has(h) || byId.get(h) === true)), "PAYMENT_REFERENCE_UNAVAILABLE", "New hall associations require enabled native halls");
    }
  }
  async put(previous: PaymentRecord | undefined, next: PaymentRecord): Promise<void> {
    this.assertRoot(next); requireDomain(next.version === (previous?.version ?? 0) + 1, "TRANSACTION_SCOPE", "Payment version must advance once");
    if (next.kind === "PAYMENT_ACCOUNT") requireDomain(previous === undefined || previous.kind === next.kind && previous.paymentMethodId === next.paymentMethodId, "IMMUTABLE_PAYMENT_METHOD", "Account method is immutable");
    try {
      const root = previous
        ? await this.query(`UPDATE naijue_erp.${table(next.kind)} SET name=$2,enabled=$3,version=$4 WHERE id=$1::uuid AND version=$5${next.kind === "PAYMENT_ACCOUNT" ? " AND payment_method_id=$6::uuid" : ""}`,
          [next.id, next.name, next.enabled, next.version, previous.version, ...(next.kind === "PAYMENT_ACCOUNT" ? [next.paymentMethodId] : [])])
        : await this.query(`INSERT INTO naijue_erp.${table(next.kind)}(id,name,enabled,version${next.kind === "PAYMENT_ACCOUNT" ? ",payment_method_id" : ""}) VALUES($1,$2,$3,$4${next.kind === "PAYMENT_ACCOUNT" ? ",$5" : ""})`,
          [next.id, next.name, next.enabled, next.version, ...(next.kind === "PAYMENT_ACCOUNT" ? [next.paymentMethodId] : [])]);
      requireDomain(root.rowCount === 1, "VERSION_CONFLICT", "Payment write did not match exact root version");
      if (next.kind === "PAYMENT_ACCOUNT") {
        const before = new Set(previous?.kind === "PAYMENT_ACCOUNT" ? previous.hallIds : []), after = new Set(next.hallIds);
        const removed = [...before].filter(h => !after.has(h)), added = [...after].filter(h => !before.has(h));
        if (removed.length) {
          const result = await this.query("DELETE FROM naijue_erp.payment_account_hall WHERE payment_account_id=$1::uuid AND hall_id=ANY($2::uuid[])", [next.id, removed]);
          requireDomain(result.rowCount === removed.length, "VERSION_CONFLICT", "Hall association changed");
        }
        if (added.length) {
          const result = await this.query("INSERT INTO naijue_erp.payment_account_hall(payment_account_id,hall_id) SELECT $1::uuid,h.hall_id FROM unnest($2::uuid[]) AS h(hall_id)", [next.id, added]);
          requireDomain(result.rowCount === added.length, "VERSION_CONFLICT", "Hall association write incomplete");
        }
      }
    } catch (error) {
      if ((error as { code?: string }).code === "23503") requireDomain(false, "PAYMENT_RELATION_IN_USE", "Retained source or business reference prevents association removal");
      if ((error as { code?: string }).code === "23505") requireDomain(false, "VERSION_CONFLICT", "Payment identity or association already exists"); throw error;
    }
  }
}
