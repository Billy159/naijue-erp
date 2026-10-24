import { historicalCustomerExclusionEnabled, EXACT_HISTORICAL_CUSTOMER_EXCLUSION, type HistoricalCustomerExclusionCapability } from "./party-read-reader.ts";
import type { MaintenancePgContext, MaintenancePgUnitOfWork } from "./maintenance-command-unit-of-work.ts";
import type { OrganizationWriteKind, OrganizationWriteRecord, OrganizationWriteTransaction, OrganizationWriteUnitOfWork } from "../../../packages/application/src/organization-maintenance-ports.ts";
import { booleanValue, stringValue, versionFromSql } from "./codec.ts";
import type { OrganizationReadListQuery, OrganizationMaintenanceKind, OrganizationMaintenancePage, OrganizationMaintenanceRecord, OrganizationReadTransaction, OrganizationReadUnitOfWork } from "../../../packages/application/src/organization-maintenance-ports.ts";
import { organizationKind, parseOrganizationListQuery, projectOrganizationRecord } from "../../../packages/application/src/organization-maintenance-validation.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
const object = (fields: Readonly<Record<string, string>>) => `jsonb_build_object(${Object.entries(fields).flatMap(([key, expression]) => [`'${key}'`, expression]).join(",")})`;
const reference = (id: string, name: string, enabled: string) => object({ id, name, enabled });
const nativeUuid = (value: unknown): string => entityId("hall", stringValue(value));
const organizationTable = (kind: OrganizationWriteKind): "hall" | "warehouse" => kind === "HALL" ? "hall" : "warehouse";
export class PostgresOrganizationMaintenanceUnitOfWork implements OrganizationWriteUnitOfWork {
  private readonly driver: MaintenancePgUnitOfWork; private readonly excludeHistorical: boolean;
  constructor(driver: MaintenancePgUnitOfWork, capability: HistoricalCustomerExclusionCapability | null = null) { if (typeof driver?.transaction !== "function") throw new TypeError("Hall/warehouse writes require shared driver"); this.driver = driver; this.excludeHistorical = historicalCustomerExclusionEnabled(driver, capability); }
  transaction<T>(work: (tx: OrganizationWriteTransaction) => Promise<T>): Promise<T> {
    return this.driver.transaction(async context => { const tx = new OrganizationWriteSqlTransaction(context, this.excludeHistorical); try { return await work(tx); } finally { tx.close(); } });
  }
}
class OrganizationWriteSqlTransaction implements OrganizationWriteTransaction {
  readonly evidence: MaintenancePgContext["evidence"]; private readonly context: MaintenancePgContext;
  private readonly excludeHistorical: boolean;
  private active = true; private topology = false; private loaded: { readonly kind: OrganizationWriteKind; readonly id: string } | undefined;
  constructor(context: MaintenancePgContext, excludeHistorical: boolean) { this.excludeHistorical = excludeHistorical; this.context = context; this.evidence = context.evidence; }
  close() { this.active = false; }
  private query(sql: string, values: unknown[] = []) { requireDomain(this.active, "TRANSACTION_CLOSED", "Organization transaction closed"); return this.context.client.query(sql, values); }
  async lockTopology() {
    requireDomain(!this.loaded, "TRANSACTION_SCOPE", "Topology lock precedes native roots");
    if (!this.topology) { await this.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["naijue:organization-topology"]); this.topology = true; }
  }
  async load(kind: OrganizationWriteKind, id: string): Promise<OrganizationWriteRecord | undefined> {
    requireDomain(this.topology && this.loaded === undefined, "TRANSACTION_SCOPE", "One locked organization root"); entityId("hall", id); this.loaded = { kind, id };
    const rows = (await this.query(`SELECT id,name,enabled,version,${kind === "HALL" ? "default_customer_id,default_sales_warehouse_id" : "hall_id,created_operation_id"} FROM naijue_erp.${organizationTable(kind)} WHERE id=$1::uuid FOR UPDATE`, [id])).rows;
    requireDomain(rows.length <= 1, "INVALID_DATABASE_VALUE", "Organization identity not unique"); if (!rows[0]) return undefined;
    const row = rows[0], base = { id: nativeUuid(row.id), name: stringValue(row.name), enabled: booleanValue(row.enabled), version: versionFromSql(row.version) };
    requireDomain(base.id === id, "INVALID_DATABASE_VALUE", "Organization identity mismatch");
    return kind === "HALL" ? { ...base, kind, defaultCustomerId: row.default_customer_id === null ? null : nativeUuid(row.default_customer_id), defaultSalesWarehouseId: row.default_sales_warehouse_id === null ? null : nativeUuid(row.default_sales_warehouse_id) }
      : { ...base, kind, hallId: nativeUuid(row.hall_id), createdOperationId: row.created_operation_id === null ? null : nativeUuid(row.created_operation_id) };
  }
  private assertRoot(next: OrganizationWriteRecord) { requireDomain(this.loaded?.kind === next.kind && this.loaded.id === next.id, "TRANSACTION_SCOPE", "Change only the locked hall/warehouse"); }
  async validateChange(previous: OrganizationWriteRecord | undefined, next: OrganizationWriteRecord): Promise<void> {
    this.assertRoot(next);
    if (next.kind === "HALL") {
      if (next.defaultCustomerId !== null) {
        const rows = (await this.query(`SELECT id,enabled FROM naijue_erp.customer WHERE id=$1::uuid${this.excludeHistorical ? ` AND ${EXACT_HISTORICAL_CUSTOMER_EXCLUSION}` : ""} FOR SHARE`, [next.defaultCustomerId])).rows;
        requireDomain(rows.length === 1 && rows[0]!.id === next.defaultCustomerId && (!next.enabled || rows[0]!.enabled === true), "ORGANIZATION_REFERENCE_UNAVAILABLE", "Enabled hall requires a real enabled default customer");
      }
      if (next.defaultSalesWarehouseId !== null) {
        const rows = (await this.query("SELECT id,hall_id,enabled FROM naijue_erp.warehouse WHERE id=$1::uuid FOR SHARE", [next.defaultSalesWarehouseId])).rows;
        requireDomain(rows.length === 1 && rows[0]!.id === next.defaultSalesWarehouseId && rows[0]!.hall_id === next.id && (!next.enabled || rows[0]!.enabled === true), "ORGANIZATION_REFERENCE_UNAVAILABLE", "Default sales warehouse must belong to this hall and be enabled for an enabled hall");
      }
    } else {
      const rows = (await this.query("SELECT id,enabled FROM naijue_erp.hall WHERE id=$1::uuid FOR SHARE", [next.hallId])).rows;
      const newSelection = previous === undefined || previous.kind !== "WAREHOUSE" || previous.hallId !== next.hallId || !previous.enabled && next.enabled;
      requireDomain(rows.length === 1 && rows[0]!.id === next.hallId && (!newSelection || rows[0]!.enabled === true), "ORGANIZATION_REFERENCE_UNAVAILABLE", "Explicit warehouse hall selection requires one enabled native hall");
      const defaults = (await this.query("SELECT id,enabled FROM naijue_erp.hall WHERE default_sales_warehouse_id=$1::uuid ORDER BY id FOR SHARE", [next.id])).rows;
      requireDomain(defaults.every(h => h.id === next.hallId && (next.enabled || h.enabled === false)), "WAREHOUSE_DEFAULT_IN_USE", "Warehouse move or disable conflicts with a real hall default");
    }
  }
  async put(previous: OrganizationWriteRecord | undefined, next: OrganizationWriteRecord): Promise<void> {
    this.assertRoot(next); requireDomain(next.version === (previous?.version ?? 0) + 1, "TRANSACTION_SCOPE", "Organization version advances once");
    const extra = next.kind === "HALL" ? [next.defaultCustomerId, next.defaultSalesWarehouseId] : [next.hallId, next.createdOperationId];
    const names = next.kind === "HALL" ? ["default_customer_id", "default_sales_warehouse_id"] : ["hall_id", "created_operation_id"];
    if (previous?.kind === "WAREHOUSE" && next.kind === "WAREHOUSE") requireDomain(previous.createdOperationId === next.createdOperationId, "TRANSACTION_SCOPE", "Historical warehouse creation proof is immutable");
    const values = [next.id, next.name, next.enabled, next.version, ...extra];
    const written = previous ? await this.query(`UPDATE naijue_erp.${organizationTable(next.kind)} SET name=$2,enabled=$3,version=$4,${names[0]}=$5${next.kind === "HALL" ? ",default_sales_warehouse_id=$6" : ""} WHERE id=$1::uuid AND version=$7${next.kind === "WAREHOUSE" ? " AND created_operation_id IS NOT DISTINCT FROM $6::uuid" : ""}`, [...values, previous.version])
      : await this.query(`INSERT INTO naijue_erp.${organizationTable(next.kind)}(id,name,enabled,version,${names.join(",")}) VALUES($1,$2,$3,$4,$5,$6)`, values);
    requireDomain(written.rowCount === 1, "VERSION_CONFLICT", "Hall/warehouse save did not match exact version");
  }
}
interface Specification { readonly from: string; readonly columns: string; readonly display: string; readonly normal: string; readonly disabled: string; readonly hallFilter: string; readonly record: string }
function specification(kind: OrganizationMaintenanceKind): Specification {
  const base = { kind: `'${kind}'`, id: "m.id", version: "m.version", createdAt: "m.created_at_value", updatedAt: "m.updated_at_value" };
  const common = "m.id,m.version", named = `${common},m.name,m.enabled`;
  const states = { normal: "m.enabled", disabled: "NOT m.enabled" };
  switch (kind) {
    case "HALL": return {
      from: "naijue_erp.hall m LEFT JOIN naijue_erp.customer c ON c.id=m.default_customer_id LEFT JOIN naijue_erp.warehouse w ON w.id=m.default_sales_warehouse_id",
      columns: `${named},m.default_customer_id,m.default_sales_warehouse_id,c.name AS customer_name,c.enabled AS customer_enabled,w.name AS warehouse_name,w.enabled AS warehouse_enabled,w.hall_id AS warehouse_hall_id`,
      display: "m.name", ...states, hallFilter: "m.id=$3::uuid", record: object({ ...base, name: "m.name", enabled: "m.enabled",
        defaultCustomer: `CASE WHEN m.default_customer_id IS NULL THEN NULL ELSE ${reference("m.default_customer_id", "m.customer_name", "m.customer_enabled")} END`,
        defaultSalesWarehouse: `CASE WHEN m.default_sales_warehouse_id IS NULL THEN NULL ELSE ${object({ id: "m.default_sales_warehouse_id", name: "m.warehouse_name", enabled: "m.warehouse_enabled", hallId: "m.warehouse_hall_id" })} END` })
    };
    case "WAREHOUSE": return {
      from: "naijue_erp.warehouse m JOIN naijue_erp.hall h ON h.id=m.hall_id", columns: `${named},m.hall_id,h.name AS hall_name,h.enabled AS hall_enabled`,
      display: "m.name", ...states, hallFilter: "m.hall_id=$3::uuid", record: object({ ...base, name: "m.name", enabled: "m.enabled", hall: reference("m.hall_id", "m.hall_name", "m.hall_enabled") })
    };
    case "STAFF": return {
      from: "naijue_erp.staff m LEFT JOIN naijue_erp.hall h ON h.id=m.hall_id LEFT JOIN naijue_erp.user_account a ON a.staff_id=m.id",
      columns: `${common},m.name,m.hall_id,m.role,m.contact,m.employment_status,h.name AS hall_name,h.enabled AS hall_enabled,a.id AS account_id,a.login_name AS account_login_name,a.login_enabled AS account_login_enabled,a.auth_version AS account_auth_version,a.version AS account_version`,
      display: "m.name", normal: "m.employment_status='在职'", disabled: "m.employment_status='离职'", hallFilter: "m.hall_id=$3::uuid",
      record: object({ ...base, name: "m.name", role: "m.role", contact: "m.contact", employmentStatus: "m.employment_status",
        hall: `CASE WHEN m.hall_id IS NULL THEN NULL ELSE ${reference("m.hall_id", "m.hall_name", "m.hall_enabled")} END`,
        account: `CASE WHEN m.account_id IS NULL THEN NULL ELSE ${object({ id: "m.account_id", loginName: "m.account_login_name", loginEnabled: "m.account_login_enabled", authVersion: "m.account_auth_version", version: "m.account_version" })} END` })
    };
    case "ACCOUNT": return {
      from: "naijue_erp.user_account m JOIN naijue_erp.staff s ON s.id=m.staff_id",
      columns: `${common},m.login_name,m.login_enabled,m.auth_version,m.staff_id,s.name AS staff_name,s.role AS staff_role,s.employment_status AS staff_employment_status,s.hall_id AS staff_hall_id`,
      display: "m.login_name", normal: "m.login_enabled", disabled: "NOT m.login_enabled", hallFilter: "s.hall_id=$3::uuid",
      record: object({ ...base, loginName: "m.login_name", loginEnabled: "m.login_enabled", authVersion: "m.auth_version",
        staff: object({ id: "m.staff_id", name: "m.staff_name", role: "m.staff_role", employmentStatus: "m.staff_employment_status", hallId: "m.staff_hall_id" }) })
    };
    case "PAYMENT_METHOD": return { from: "naijue_erp.payment_method m", columns: named, display: "m.name", ...states, hallFilter: "false", record: object({ ...base, name: "m.name", enabled: "m.enabled" }) };
    case "PAYMENT_ACCOUNT": return {
      from: "naijue_erp.payment_account m JOIN naijue_erp.payment_method pm ON pm.id=m.payment_method_id",
      columns: `${named},m.payment_method_id,pm.name AS method_name,pm.enabled AS method_enabled`, display: "m.name", ...states,
      hallFilter: "EXISTS(SELECT 1 FROM naijue_erp.payment_account_hall link WHERE link.payment_account_id=m.id AND link.hall_id=$3::uuid)",
      record: object({ ...base, name: "m.name", enabled: "m.enabled", paymentMethod: reference("m.payment_method_id", "m.method_name", "m.method_enabled"),
        halls: `COALESCE((SELECT jsonb_agg(${reference("h.id", "h.name", "h.enabled")} ORDER BY h.id) FROM
          (SELECT hh.id,hh.name,hh.enabled FROM naijue_erp.payment_account_hall link JOIN naijue_erp.hall hh ON hh.id=link.hall_id
          WHERE link.payment_account_id=m.id ORDER BY hh.id LIMIT 5001) h),'[]'::jsonb)` })
    };
  }
}
async function page(context: MaintenancePgContext, kind: OrganizationMaintenanceKind, q: OrganizationReadListQuery, targetId: string | null): Promise<OrganizationMaintenancePage> {
  organizationKind(kind); const checked = parseOrganizationListQuery(q, kind); if (targetId !== null) entityId("hall", targetId);
  const role = "role" in checked ? checked.role : undefined;
  const loginStatus = "loginStatus" in checked ? checked.loginStatus : undefined;
  requireDomain(loginStatus !== "closed", "STAFF_LOGIN_FILTER_NOT_READY", "Closed-login no-account classification is pending");
  const loginParameter = role === undefined ? 7 : 8;
  const paymentMethodId = "paymentMethodId" in checked ? checked.paymentMethodId : undefined;
  const s = specification(kind);
  const search = kind === "STAFF"
    ? "(strpos(lower(m.name),lower($1::text))>0 OR strpos(lower(COALESCE(a.login_name,'')),lower($1::text))>0)"
    : `strpos(lower(${s.display}),lower($1::text))>0`;
  const timestamp = (column: "created_at" | "updated_at") => kind === "ACCOUNT" ? `to_char(m.${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` : "NULL::text";
  // Explicit column whitelist: account reads never select password_hash or tokens.
  const rows = (await context.client.query(`WITH matched AS (SELECT ${s.columns},${s.display} AS display_name,
    ${timestamp("created_at")} AS created_at_value,${timestamp("updated_at")} AS updated_at_value FROM ${s.from}
    WHERE ${search} AND ($2::text='all' OR ($2='normal' AND ${s.normal}) OR ($2='disabled' AND ${s.disabled}))
    AND ($3::uuid IS NULL OR ${s.hallFilter}) AND ($6::uuid IS NULL OR m.id=$6::uuid)${role === undefined ? "" : " AND ($7::text='' OR m.role=$7::text)"}${loginStatus === undefined ? "" : ` AND ($${loginParameter}::text='' OR a.login_enabled IS TRUE)`}${paymentMethodId === undefined ? "" : " AND ($7::uuid IS NULL OR m.payment_method_id=$7::uuid)"}),
    page AS (SELECT * FROM matched ORDER BY display_name COLLATE "C",id LIMIT $4 OFFSET $5)
    SELECT (SELECT count(*)::text FROM matched) AS total,COALESCE((SELECT jsonb_agg(${s.record} ORDER BY m.display_name COLLATE "C",m.id) FROM page m),'[]'::jsonb) AS items`,
  [q.search, q.status, q.hallId, q.pageSize, (q.page - 1) * q.pageSize, targetId, ...(role === undefined ? [] : [role]), ...(loginStatus === undefined ? [] : [loginStatus]), ...(paymentMethodId === undefined ? [] : [paymentMethodId])])).rows;
  requireDomain(rows.length === 1 && typeof rows[0]!.total === "string" && /^(?:0|[1-9]\d*)$/.test(rows[0]!.total)
    && BigInt(rows[0]!.total) <= BigInt(Number.MAX_SAFE_INTEGER) && Array.isArray(rows[0]!.items), "INVALID_DATABASE_VALUE", "Invalid native settings page");
  const total = Number(rows[0]!.total), items = (rows[0]!.items as unknown[]).map(row => projectOrganizationRecord(row, kind));
  requireDomain(items.length === Math.min(q.pageSize, Math.max(0, total - (q.page - 1) * q.pageSize)), "INVALID_DATABASE_VALUE", "Inconsistent native settings count");
  return { kind, page: q.page, pageSize: q.pageSize, total, items };
}
/** Current D1 identity/role gate plus one target/count/page SQL; no pool, writer or fake timestamps. */
export class PostgresOrganizationMaintenanceReadUnitOfWork implements OrganizationReadUnitOfWork {
  private readonly driver: MaintenancePgUnitOfWork;
  constructor(driver: MaintenancePgUnitOfWork) { if (typeof driver?.transaction !== "function") throw new TypeError("Settings reads require the explicit D1 transaction driver"); this.driver = driver; }
  transaction<T>(work: (tx: OrganizationReadTransaction) => Promise<T>): Promise<T> {
    return this.driver.transaction(async context => work({ evidence: context.evidence,
      readList: (kind, query) => page(context, kind, query, null),
      async readDetail(kind, id): Promise<OrganizationMaintenanceRecord | null> {
        const result = await page(context, kind, { search: "", status: "all", hallId: null, page: 1, pageSize: 20 }, id);
        requireDomain(result.total <= 1, "INVALID_DATABASE_VALUE", "Settings identity is not unique"); return result.items[0] ?? null;
      }
    }));
  }
}
