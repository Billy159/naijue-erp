import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import type { AccountMaintenanceRecord, AccountMaintenanceTransaction, AccountMaintenanceUnitOfWork } from "../../../packages/application/src/account-maintenance-ports.ts";
import type { MaintenancePgContext, MaintenancePgUnitOfWork } from "./maintenance-command-unit-of-work.ts";
import { booleanValue, stringValue, versionFromSql } from "./codec.ts";
const uuid = (v: unknown): string => entityId("account", stringValue(v));
const stamp = (v: "created_at" | "updated_at") => `to_char(${v} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ${v}`;
function record(r: Record<string, unknown>): AccountMaintenanceRecord {
  const createdAt = stringValue(r.created_at), updatedAt = stringValue(r.updated_at); requireDomain(Number.isFinite(Date.parse(createdAt)) && Number.isFinite(Date.parse(updatedAt)), "INVALID_DATABASE_VALUE", "Account timestamps unavailable");
  return { id: uuid(r.id), staffId: uuid(r.staff_id), loginName: stringValue(r.login_name), loginEnabled: booleanValue(r.login_enabled), authVersion: versionFromSql(r.auth_version), version: versionFromSql(r.version), createdAt, updatedAt };
}
export class PostgresAccountMaintenanceUnitOfWork implements AccountMaintenanceUnitOfWork {
  private readonly driver: MaintenancePgUnitOfWork;
  constructor(driver: MaintenancePgUnitOfWork) { if (typeof driver?.transaction !== "function") throw new TypeError("Account writes require shared driver"); this.driver = driver; }
  transaction<T>(work: (tx: AccountMaintenanceTransaction) => Promise<T>): Promise<T> {
    return this.driver.transaction(async context => { const tx = new AccountSqlTransaction(context); try { return await work(tx); } finally { tx.close(); } });
  }
}
class AccountSqlTransaction implements AccountMaintenanceTransaction {
  readonly evidence: MaintenancePgContext["evidence"]; private readonly context: MaintenancePgContext;
  private active = true; private loaded: string | undefined;
  constructor(context: MaintenancePgContext) { this.context = context; this.evidence = context.evidence; }
  close() { this.active = false; }
  private query(sql: string, values: unknown[] = []) { requireDomain(this.active, "TRANSACTION_CLOSED", "Account transaction closed"); return this.context.client.query(sql, values); }
  async load(id: string): Promise<AccountMaintenanceRecord | undefined> {
    requireDomain(!this.loaded, "TRANSACTION_SCOPE", "One account root per command"); entityId("account", id); this.loaded = id;
    const rows = (await this.query(`SELECT id,staff_id,login_name,login_enabled,auth_version,version,${stamp("created_at")},${stamp("updated_at")}
      FROM naijue_erp.user_account WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [[id]])).rows;
    requireDomain(rows.length <= 1, "INVALID_DATABASE_VALUE", "Account identity not unique"); if (!rows[0]) return undefined; const row = record(rows[0]); requireDomain(row.id === id, "INVALID_DATABASE_VALUE", "Account identity mismatch"); return row;
  }
  async validateChange(previous: AccountMaintenanceRecord | undefined, next: AccountMaintenanceRecord): Promise<void> {
    requireDomain(next.id === this.loaded && (!previous || previous.staffId === next.staffId), "TRANSACTION_SCOPE", "Account owning staff is immutable");
    const rows = (await this.query("SELECT id,role,employment_status,hall_id FROM naijue_erp.staff WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [[next.staffId]])).rows;
    requireDomain(rows.length === 1 && rows[0]!.id === next.staffId, "ACCOUNT_REFERENCE_UNAVAILABLE", "Owning staff must exist"); const staff = rows[0]!;
    let hallEnabled = staff.hall_id === null;
    if (staff.hall_id !== null) {
      const halls = (await this.query("SELECT id,enabled FROM naijue_erp.hall WHERE id=$1::uuid FOR SHARE", [uuid(staff.hall_id)])).rows;
      hallEnabled = halls.length === 1 && halls[0]!.id === staff.hall_id && halls[0]!.enabled === true;
    }
    requireDomain(!next.loginEnabled || staff.employment_status === "在职" && (staff.role === "ADMIN" || staff.role === "WAREHOUSE" || staff.role === "SALESPERSON" && staff.hall_id !== null) && hallEnabled,
      "ACCOUNT_REFERENCE_UNAVAILABLE", "Login requires active staff, supported role and actual enabled hall scope");
    if (previous?.loginEnabled && !next.loginEnabled && staff.role === "ADMIN" && staff.employment_status === "在职" && hallEnabled) {
      const others = (await this.query(`/* account-maintenance:other-admin */ SELECT EXISTS(SELECT 1 FROM naijue_erp.user_account a
        JOIN naijue_erp.staff s ON s.id=a.staff_id LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id
        WHERE a.id<>$1::uuid AND a.login_enabled AND s.employment_status='在职' AND s.role='ADMIN' AND (s.hall_id IS NULL OR h.enabled)) AS available`, [next.id])).rows;
      requireDomain(others.length === 1 && others[0]!.available === true, "LAST_AVAILABLE_ADMIN", "At least one usable administrator must remain");
    }
  }
  async put(previous: AccountMaintenanceRecord | undefined, next: AccountMaintenanceRecord, passwordHash: string | null): Promise<void> {
    requireDomain(next.id === this.loaded && next.version === (previous?.version ?? 0) + 1 && next.authVersion === (previous?.authVersion ?? 0) + 1,
      "TRANSACTION_SCOPE", "Account/auth versions advance exactly once");
    requireDomain(previous !== undefined || passwordHash !== null, "INVALID_CREDENTIAL_PROVIDER", "New account requires a real password encoding");
    if (passwordHash !== null) requireDomain(/^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$/.test(passwordHash), "INVALID_CREDENTIAL_PROVIDER", "Supported password encoding required");
    try {
      const result = previous ? await this.query(`UPDATE naijue_erp.user_account SET login_name=$3,login_enabled=$4,auth_version=$5,version=$6,updated_at=$8::timestamptz${passwordHash !== null ? ",password_hash=$11" : ""}
        WHERE id=$1::uuid AND staff_id=$2::uuid AND auth_version=$9 AND version=$10 AND created_at=$7::timestamptz`,
      [next.id, next.staffId, next.loginName, next.loginEnabled, next.authVersion, next.version, next.createdAt, next.updatedAt, previous.authVersion, previous.version, ...(passwordHash !== null ? [passwordHash] : [])])
        : await this.query("INSERT INTO naijue_erp.user_account(id,staff_id,login_name,login_enabled,auth_version,version,created_at,updated_at,password_hash) VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz,$9)",
          [next.id, next.staffId, next.loginName, next.loginEnabled, next.authVersion, next.version, next.createdAt, next.updatedAt, passwordHash]);
      requireDomain(result.rowCount === 1, "VERSION_CONFLICT", "Account save did not match actual version");
      if (previous) await this.query("UPDATE naijue_erp.auth_session SET revoked_at=$2::timestamptz WHERE account_id=$1::uuid AND revoked_at IS NULL", [next.id, next.updatedAt]);
    } catch (error) { if ((error as { code?: string }).code === "23505") requireDomain(false, "ACCOUNT_LOGIN_CONFLICT", "Login or staff already owns an account"); throw error; }
  }
}
