import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import type { StaffMaintenanceAggregate, StaffMaintenanceRecord, StaffMaintenanceTransaction, StaffMaintenanceUnitOfWork } from "../../../packages/application/src/staff-maintenance-ports.ts";
import type { AccountMaintenanceRecord } from "../../../packages/application/src/account-maintenance-ports.ts";
import type { MaintenancePgContext, MaintenancePgUnitOfWork } from "./maintenance-command-unit-of-work.ts";
import { booleanValue, nullableString, stringValue, versionFromSql } from "./codec.ts";
const uuid = (v: unknown): string => entityId("staff", stringValue(v));
const nullableId = (v: unknown): string | null => v === null ? null : uuid(v);
const stamp = (v: "created_at" | "updated_at") => `to_char(${v} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ${v}`;
function accountRecord(r: Record<string, unknown>): AccountMaintenanceRecord {
  const createdAt = stringValue(r.created_at), updatedAt = stringValue(r.updated_at);
  requireDomain(Number.isFinite(Date.parse(createdAt)) && Number.isFinite(Date.parse(updatedAt)), "INVALID_DATABASE_VALUE", "Actual account timestamps required");
  return { id: uuid(r.id), staffId: uuid(r.staff_id), loginName: stringValue(r.login_name), loginEnabled: booleanValue(r.login_enabled), authVersion: versionFromSql(r.auth_version), version: versionFromSql(r.version), createdAt, updatedAt };
}
function staffRecord(r: Record<string, unknown>): StaffMaintenanceRecord {
  return { id: uuid(r.id), name: stringValue(r.name), role: stringValue(r.role), hallId: nullableId(r.hall_id), contact: nullableString(r.contact), employmentStatus: stringValue(r.employment_status), version: versionFromSql(r.version) };
}
export class PostgresStaffMaintenanceUnitOfWork implements StaffMaintenanceUnitOfWork {
  private readonly driver: MaintenancePgUnitOfWork;
  constructor(driver: MaintenancePgUnitOfWork) { if (typeof driver?.transaction !== "function") throw new TypeError("Staff writes require shared driver"); this.driver = driver; }
  transaction<T>(work: (tx: StaffMaintenanceTransaction) => Promise<T>): Promise<T> {
    return this.driver.transaction(async context => { const tx = new StaffSqlTransaction(context); try { return await work(tx); } finally { tx.close(); } });
  }
}
class StaffSqlTransaction implements StaffMaintenanceTransaction {
  readonly evidence: MaintenancePgContext["evidence"]; private readonly context: MaintenancePgContext;
  private active = true; private loaded: string | undefined; private staffWritten = false;
  constructor(context: MaintenancePgContext) { this.context = context; this.evidence = context.evidence; }
  close() { this.active = false; }
  private query(sql: string, values: unknown[] = []) { requireDomain(this.active, "TRANSACTION_CLOSED", "Staff transaction closed"); return this.context.client.query(sql, values); }
  async load(id: string): Promise<StaffMaintenanceAggregate | undefined> {
    requireDomain(this.loaded === undefined, "TRANSACTION_SCOPE", "One staff root per command"); entityId("staff", id); this.loaded = id;
    // The shared administrator mutex is already held. Account -> staff matches
    // standalone account maintenance; a linked account cannot be rebound here.
    const accounts = (await this.query(`SELECT id,staff_id,login_name,login_enabled,auth_version,version,${stamp("created_at")},${stamp("updated_at")}
      FROM naijue_erp.user_account WHERE staff_id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [[id]])).rows;
    const staff = (await this.query("SELECT id,name,role,hall_id,contact,employment_status,version FROM naijue_erp.staff WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [[id]])).rows;
    requireDomain(accounts.length <= 1 && staff.length <= 1 && (staff.length === 1 || accounts.length === 0), "INVALID_DATABASE_VALUE", "Actual staff/account ownership must be unique");
    if (!staff[0]) return undefined;
    const row = staffRecord(staff[0]), account = accounts[0] ? accountRecord(accounts[0]) : null;
    requireDomain(row.id === id && (account === null || account.staffId === id), "INVALID_DATABASE_VALUE", "Actual staff/account ownership differs");
    return { staff: row, account };
  }
  async validateChange(previous: StaffMaintenanceAggregate | undefined, next: StaffMaintenanceAggregate): Promise<void> {
    requireDomain(next.staff.id === this.loaded && (!previous || previous.staff.id === next.staff.id) && (next.account === null || next.account.staffId === next.staff.id)
      && (!previous?.account || next.account?.id === previous.account.id), "TRANSACTION_SCOPE", "Staff/account identities cannot be rebound or removed");
    const ids = [...new Set([previous?.staff.hallId ?? null, next.staff.hallId].filter((v): v is string => v !== null))].sort();
    const halls = ids.length ? (await this.query("SELECT id,enabled FROM naijue_erp.hall WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE", [ids])).rows : [];
    requireDomain(halls.length === ids.length && halls.every(h => ids.includes(uuid(h.id)) && typeof h.enabled === "boolean"), "STAFF_REFERENCE_UNAVAILABLE", "Actual selected halls must exist");
    const enabled = (id: string | null) => id === null || halls.some(h => h.id === id && h.enabled === true);
    const hallSelectionChanged = previous === undefined || previous.staff.hallId !== next.staff.hallId;
    const reinstating = previous !== undefined && previous.staff.employmentStatus !== "在职" && next.staff.employmentStatus === "在职";
    requireDomain(!(hallSelectionChanged || reinstating) || enabled(next.staff.hallId), "STAFF_REFERENCE_UNAVAILABLE", "New or reinstated hall must be enabled");
    const supportedRole = next.staff.role === "ADMIN" || next.staff.role === "WAREHOUSE" || next.staff.role === "SALESPERSON" && next.staff.hallId !== null;
    requireDomain(!next.account?.loginEnabled || next.staff.employmentStatus === "在职" && supportedRole && enabled(next.staff.hallId), "STAFF_REFERENCE_UNAVAILABLE", "Login requires active staff and an actual supported enabled scope");
    const wasAdmin = previous?.staff.role === "ADMIN" && previous.staff.employmentStatus === "在职" && previous.account?.loginEnabled === true && enabled(previous.staff.hallId);
    const remainsAdmin = next.staff.role === "ADMIN" && next.staff.employmentStatus === "在职" && next.account?.loginEnabled === true && enabled(next.staff.hallId);
    if (wasAdmin && !remainsAdmin) {
      const others = (await this.query(`/* staff-maintenance:other-admin */ SELECT EXISTS(SELECT 1 FROM naijue_erp.user_account a
        JOIN naijue_erp.staff s ON s.id=a.staff_id LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id
        WHERE a.id<>$1::uuid AND a.login_enabled AND s.employment_status='在职' AND s.role='ADMIN' AND (s.hall_id IS NULL OR h.enabled)) AS available`, [previous!.account!.id])).rows;
      requireDomain(others.length === 1 && others[0]!.available === true, "LAST_AVAILABLE_ADMIN", "At least one usable administrator must remain");
    }
  }
  async putStaff(previous: StaffMaintenanceRecord | undefined, next: StaffMaintenanceRecord): Promise<void> {
    requireDomain(!this.staffWritten && next.id === this.loaded && next.version === (previous?.version ?? 0) + 1, "TRANSACTION_SCOPE", "One actual staff version increment required");
    const values = [next.id, next.name, next.role, next.hallId, next.contact, next.employmentStatus, next.version];
    const result = previous ? await this.query("UPDATE naijue_erp.staff SET name=$2,role=$3,hall_id=$4::uuid,contact=$5,employment_status=$6,version=$7 WHERE id=$1::uuid AND version=$8", [...values, previous.version])
      : await this.query("INSERT INTO naijue_erp.staff(id,name,role,hall_id,contact,employment_status,version) VALUES($1::uuid,$2,$3,$4::uuid,$5,$6,$7)", values);
    requireDomain(result.rowCount === 1, "VERSION_CONFLICT", "Staff save did not match actual version"); this.staffWritten = true;
  }
  async putAccount(previous: AccountMaintenanceRecord | null, next: AccountMaintenanceRecord, passwordHash: string | null): Promise<void> {
    requireDomain(this.staffWritten && next.staffId === this.loaded && (!previous || previous.id === next.id && previous.staffId === next.staffId && previous.createdAt === next.createdAt)
      && next.version === (previous?.version ?? 0) + 1 && next.authVersion === (previous?.authVersion ?? 0) + 1, "TRANSACTION_SCOPE", "Same staff/account identity and exact version changes required");
    requireDomain(previous !== null || passwordHash !== null, "INVALID_CREDENTIAL_PROVIDER", "New account requires a current password encoding");
    if (passwordHash !== null) requireDomain(/^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$/.test(passwordHash), "INVALID_CREDENTIAL_PROVIDER", "Supported password encoding required");
    try {
      const result = previous ? await this.query(`UPDATE naijue_erp.user_account SET login_name=$3,login_enabled=$4,auth_version=$5,version=$6,updated_at=$8::timestamptz${passwordHash !== null ? ",password_hash=$11" : ""}
        WHERE id=$1::uuid AND staff_id=$2::uuid AND auth_version=$9 AND version=$10 AND created_at=$7::timestamptz`,
      [next.id, next.staffId, next.loginName, next.loginEnabled, next.authVersion, next.version, next.createdAt, next.updatedAt, previous.authVersion, previous.version, ...(passwordHash !== null ? [passwordHash] : [])])
        : await this.query("INSERT INTO naijue_erp.user_account(id,staff_id,login_name,login_enabled,auth_version,version,created_at,updated_at,password_hash) VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz,$9)",
          [next.id, next.staffId, next.loginName, next.loginEnabled, next.authVersion, next.version, next.createdAt, next.updatedAt, passwordHash]);
      requireDomain(result.rowCount === 1, "VERSION_CONFLICT", "Linked account changed");
      if (previous) await this.query("UPDATE naijue_erp.auth_session SET revoked_at=$2::timestamptz WHERE account_id=$1::uuid AND revoked_at IS NULL", [next.id, next.updatedAt]);
    } catch (error) { if ((error as { code?: string }).code === "23505") requireDomain(false, "ACCOUNT_LOGIN_CONFLICT", "Login or staff already owns an account"); throw error; }
  }
}
