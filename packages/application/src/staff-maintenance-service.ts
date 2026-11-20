import { requireDomain } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import { requestHash } from "./request-hash.ts";
import { checkedProductActor } from "./product-query-validation.ts";
import { partyRequestKey } from "./party-maintenance-validation.ts";
import { authorizeStaffMaintenance } from "./staff-maintenance-authorization.ts";
import { parseStaffMaintenanceCommand } from "./staff-maintenance-validation.ts";
import { accountMaintenanceFacts } from "./account-maintenance-service.ts";
import type { AccountMaintenanceRecord } from "./account-maintenance-ports.ts";
import type { StaffMaintenanceDependencies, StaffMaintenanceService, StaffMaintenanceRecord } from "./staff-maintenance-ports.ts";
import type { MaintenanceJsonObject, MaintenanceJsonValue } from "./maintenance-commit-ports.ts";
function facts(row: StaffMaintenanceRecord): MaintenanceJsonObject { return { id: row.id, name: row.name, hall_id: row.hallId, role: row.role, contact: row.contact, employment_status: row.employmentStatus, version: row.version }; }
function timestamp(value: string): string {
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)$/.exec(value); requireDomain(match && Number.isFinite(Date.parse(value)), "INVALID_ACTION_TIME", "Trusted exact time required");
  return `${new Date(value).toISOString().slice(0, 19)}.${(match[2] ?? "").padEnd(6, "0")}Z`;
}
export function createStaffMaintenanceService(dependencies: StaffMaintenanceDependencies): StaffMaintenanceService {
  if (typeof dependencies?.unitOfWork?.transaction !== "function" || typeof dependencies?.now !== "function" || typeof dependencies?.newId !== "function" || !Object.hasOwn(dependencies, "credentials")) throw new TypeError("Staff writes require explicit providers");
  const credentials = dependencies.credentials;
  if (credentials !== null && (typeof credentials.passwords?.hash !== "function" || typeof credentials.credentialRequestTag !== "function" || typeof credentials.assertNewPassword !== "function")) throw new TypeError("Complete credential providers required");
  return Object.freeze({
    async execute(actorInput, input) {
      const actor = checkedProductActor(actorInput), command = parseStaffMaintenanceCommand(input), full = command.action === "CREATE" || command.action === "EDIT", accountInput = full ? command.account : null, password = accountInput?.password ?? null;
      let fingerprint: unknown = command;
      if (password !== null) {
        requireDomain(credentials !== null, "ACCOUNT_CREDENTIALS_NOT_READY", "Trusted credential providers unavailable"); const tag = credentials.credentialRequestTag(password); requireDomain(/^[0-9a-f]{64}$/.test(tag), "INVALID_CREDENTIAL_PROVIDER", "Private stable credential tag required");
        const { password: _password, ...safe } = accountInput!; fingerprint = { ...command, account: { ...safe, credentialTag: tag } };
      }
      const hash = requestHash({ actorAccountId: actor.accountId, kind: "STAFF", command: fingerprint });
      let encoded: string | null = null;
      if (password !== null) {
        // This preliminary transaction is read-only at the business level. It ends before
        // password policy/codec work; the final original transaction repeats key/authority/CAS.
        const replay = await dependencies.unitOfWork.transaction(async tx => {
          const receipt = await tx.evidence.getReceipt(actor.accountId, command.requestKey, 'STAFF');
          await authorizeStaffMaintenance(tx.evidence, actor, command.action);
          if (!receipt) return undefined;
          requireDomain(receipt.requestHash === hash && receipt.action === command.action && receipt.result.kind === 'STAFF', 'IDEMPOTENCY_CONFLICT', 'Original staff key differs');
          return receipt.result;
        });
        if (replay) return replay;
        try { await credentials!.assertNewPassword(password); }
        catch { requireDomain(false, 'INVALID_ACCOUNT_PASSWORD', 'Password rejected by current policy'); }
        encoded = await credentials!.passwords.hash(password);
        requireDomain(/^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$/.test(encoded), 'INVALID_CREDENTIAL_PROVIDER', 'Current supported password encoding required');
      }
      return dependencies.unitOfWork.transaction(async tx => {
        const receipt = await tx.evidence.getReceipt(actor.accountId, command.requestKey, "STAFF"); await authorizeStaffMaintenance(tx.evidence, actor, command.action);
        if (receipt) { requireDomain(receipt.requestHash === hash && receipt.action === command.action && receipt.result.kind === "STAFF", "IDEMPOTENCY_CONFLICT", "Original staff key differs"); return receipt.result; }
        const id = command.action === "CREATE" ? entityId("staff", dependencies.newId("staff")) : command.id, previous = await tx.load(id);
        requireDomain(command.action === "CREATE" ? previous === undefined : previous !== undefined, command.action === "CREATE" ? "VERSION_CONFLICT" : "STAFF_NOT_FOUND", "Native staff unavailable");
        if (command.action !== "CREATE") requireDomain(previous!.staff.version === command.expectedVersion, "VERSION_CONFLICT", "Staff changed");
        requireDomain(!previous || previous.staff.version < 2147483647, "VERSION_STORAGE_OVERFLOW", "Staff version exhausted");
        const completedAt = timestamp(dependencies.now()), operationId = entityId("operation", dependencies.newId("operation"));
        let staff: StaffMaintenanceRecord;
        if (command.action === "CREATE") staff = { ...command.values, id, employmentStatus: "在职", version: 1 };
        else if (command.action === "EDIT") staff = { ...previous!.staff, ...command.values, version: previous!.staff.version + 1 };
        else { requireDomain(previous!.staff.employmentStatus === (command.action === "LEAVE" ? "在职" : "离职"), "INVALID_STAFF_STATE", "Employment state already applied or unknown"); staff = { ...previous!.staff, employmentStatus: command.action === "LEAVE" ? "离职" : "在职", version: previous!.staff.version + 1 }; }
        const oldAccount = previous?.account ?? null; let account: AccountMaintenanceRecord | null = oldAccount;
        if (accountInput) {
          requireDomain(oldAccount ? accountInput.id === oldAccount.id && accountInput.expectedVersion === oldAccount.version : accountInput.id === null && accountInput.expectedVersion === null, "VERSION_CONFLICT", "Linked account changed");
          if (oldAccount) account = { ...oldAccount, loginName: accountInput.loginName, loginEnabled: accountInput.loginEnabled };
          else account = { id: entityId("account", dependencies.newId("account")), staffId: id, loginName: accountInput.loginName, loginEnabled: accountInput.loginEnabled, authVersion: 1, version: 1, createdAt: completedAt, updatedAt: completedAt };
        }
        if (command.action === "LEAVE" || command.action === "REINSTATE") { if (account) account = { ...account, loginEnabled: false }; }
        requireDomain(staff.employmentStatus === "在职" || account?.loginEnabled !== true, "INVALID_STAFF_ACCOUNT_STATE", "Departed staff cannot sign in");
        const accessChanged = previous !== undefined && (previous.staff.role !== staff.role || previous.staff.hallId !== staff.hallId || previous.staff.employmentStatus !== staff.employmentStatus);
        const accountChanged = account !== null && (oldAccount === null || account.loginName !== oldAccount.loginName || account.loginEnabled !== oldAccount.loginEnabled || password !== null || accessChanged);
        if (accountChanged && oldAccount) {
          requireDomain(oldAccount.version < 2147483647 && oldAccount.authVersion < 2147483647, "VERSION_STORAGE_OVERFLOW", "Account version exhausted");
          account = { ...account!, version: oldAccount.version + 1, authVersion: oldAccount.authVersion + 1, updatedAt: completedAt };
        }
        const old = previous ? facts(previous.staff) : null, current = facts(staff), before: Record<string, MaintenanceJsonValue> = {}, after: Record<string, MaintenanceJsonValue> = {};
        for (const [k, v] of Object.entries(current)) if (old === null || requestHash(v) !== requestHash(old[k])) { after[k] = v; if (old !== null) before[k] = old[k]!; }
        if (accountChanged || command.action === "LEAVE" || command.action === "REINSTATE") { if (previous) before.accounts = oldAccount ? [accountMaintenanceFacts(oldAccount)] : []; after.accounts = account ? [accountMaintenanceFacts(account)] : []; }
        requireDomain(previous === undefined || accountChanged || Object.keys(after).some(k => k !== "version"), "NO_STAFF_CHANGE", "No staff or linked account change supplied");
        await tx.validateChange(previous, { staff, account });
        if (encoded !== null) after.account_credentials = [{ account_id: account!.id, action: oldAccount ? "RESET_PASSWORD" : "CREATE" }];
        const completion = { operationId, actorAccountId: actor.accountId, requestKey: command.requestKey, requestHash: hash, kind: "STAFF" as const, action: command.action, targetId: id, oldVersion: previous?.staff.version ?? null, newVersion: staff.version, beforeValues: previous ? before : null, afterValues: after, completedAt };
        requireDomain(typeof tx.evidence.prepare === "function", "MAINTENANCE_PREPARE_NOT_READY", "Original audit preparation is unavailable");
        await tx.evidence.prepare(completion);
        await tx.putStaff(previous?.staff, staff); if (accountChanged) await tx.putAccount(oldAccount, account!, encoded);
        const result = await tx.evidence.complete(completion);
        requireDomain(result.kind === "STAFF" && result.targetId === id && result.operationId === operationId && result.version === staff.version, "INVALID_DATABASE_VALUE", "Receipt differs from actual staff save"); return result;
      });
    },
    async receipt(actorInput, keyInput) {
      const actor = checkedProductActor(actorInput), key = partyRequestKey(keyInput);
      return dependencies.unitOfWork.transaction(async tx => { const receipt = await tx.evidence.getReceipt(actor.accountId, key, "STAFF"); await authorizeStaffMaintenance(tx.evidence, actor, "RECEIPT"); requireDomain(receipt && receipt.result.kind === "STAFF", "RECEIPT_NOT_FOUND", "Original staff receipt unavailable"); await authorizeStaffMaintenance(tx.evidence, actor, receipt.action);
        return { requestKey: key, action: receipt.action, status: "COMMITTED" as const, completedAt: receipt.completedAt, result: receipt.result }; });
    }
  } satisfies StaffMaintenanceService);
}
