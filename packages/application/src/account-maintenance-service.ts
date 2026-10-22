import { requireDomain } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import { checkedProductActor } from "./product-query-validation.ts";
import { partyRequestKey } from "./party-maintenance-validation.ts";
import { requestHash } from "./request-hash.ts";
import { authorizeAccountMaintenance } from "./account-maintenance-authorization.ts";
import { parseAccountMaintenanceCommand } from "./account-maintenance-validation.ts";
import type { AccountMaintenanceDependencies, AccountMaintenanceRecord, AccountMaintenanceService } from "./account-maintenance-ports.ts";
import type { MaintenanceJsonObject, MaintenanceJsonValue } from "./maintenance-commit-ports.ts";
export function accountMaintenanceFacts(row: AccountMaintenanceRecord): MaintenanceJsonObject {
  return { id: row.id, staff_id: row.staffId, login_name: row.loginName, login_enabled: row.loginEnabled, auth_version: row.authVersion, version: row.version, created_at: row.createdAt, updated_at: row.updatedAt };
}
function completionTimestamp(input: string): string {
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)$/.exec(input);
  requireDomain(match && Number.isFinite(Date.parse(input)), "INVALID_ACTION_TIME", "Exact trusted timestamp required");
  return `${new Date(input).toISOString().slice(0, 19)}.${(match[2] ?? "").padEnd(6, "0")}Z`;
}
export function createAccountMaintenanceService(dependencies: AccountMaintenanceDependencies): AccountMaintenanceService {
  if (typeof dependencies?.unitOfWork?.transaction !== "function" || typeof dependencies?.newId !== "function" || typeof dependencies?.now !== "function" || !Object.hasOwn(dependencies, "credentials")) throw new TypeError("Account maintenance requires explicit providers and credential availability");
  const credentials = dependencies.credentials;
  if (credentials !== null && (typeof credentials.passwords?.hash !== "function" || typeof credentials.credentialRequestTag !== "function" || typeof credentials.assertNewPassword !== "function")) throw new TypeError("Complete credential providers required");
  return Object.freeze({
    async execute(actorInput, input) {
      const actor = checkedProductActor(actorInput), command = parseAccountMaintenanceCommand(input);
      const password = command.action === "CREATE" ? command.values.password : command.action === "RESET_PASSWORD" ? command.password : null;
      let fingerprint: unknown = command;
      if (password !== null) {
        requireDomain(credentials !== null, "ACCOUNT_CREDENTIALS_NOT_READY", "Trusted credential providers unavailable"); const tag = credentials.credentialRequestTag(password); requireDomain(/^[0-9a-f]{64}$/.test(tag), "INVALID_CREDENTIAL_PROVIDER", "Stable private credential request tag required");
        if (command.action === "CREATE") { const { password: _password, ...values } = command.values; fingerprint = { ...command, values, credentialTag: tag }; }
        else if (command.action === "RESET_PASSWORD") { const { password: _password, ...safe } = command; fingerprint = { ...safe, credentialTag: tag }; }
      }
      const hash = requestHash({ actorAccountId: actor.accountId, kind: "ACCOUNT", command: fingerprint });
      return dependencies.unitOfWork.transaction(async tx => {
        // D1 getReceipt takes global admin + original key before current identity row locks.
        const receipt = await tx.evidence.getReceipt(actor.accountId, command.requestKey, "ACCOUNT"); await authorizeAccountMaintenance(tx.evidence, actor, command.action);
        if (receipt) { requireDomain(receipt.requestHash === hash && receipt.action === command.action && receipt.result.kind === "ACCOUNT", "IDEMPOTENCY_CONFLICT", "Original account key differs"); return receipt.result; }
        const id = command.action === "CREATE" ? entityId("account", dependencies.newId("account")) : command.id, previous = await tx.load(id);
        requireDomain(command.action === "CREATE" ? previous === undefined : previous !== undefined, command.action === "CREATE" ? "VERSION_CONFLICT" : "ACCOUNT_NOT_FOUND", "Native account identity unavailable");
        if (command.action !== "CREATE") requireDomain(previous!.version === command.expectedVersion, "VERSION_CONFLICT", "Account changed");
        requireDomain(!previous || previous.version < 2147483647 && previous.authVersion < 2147483647, "VERSION_STORAGE_OVERFLOW", "Account version exhausted");
        const timestamp = completionTimestamp(dependencies.now()), operationId = entityId("operation", dependencies.newId("operation"));
        let next: AccountMaintenanceRecord;
        if (command.action === "CREATE") next = { id, staffId: command.values.staffId, loginName: command.values.loginName, loginEnabled: command.values.loginEnabled, authVersion: 1, version: 1, createdAt: timestamp, updatedAt: timestamp };
        else {
          next = { ...previous!, version: previous!.version + 1, authVersion: previous!.authVersion + 1, updatedAt: timestamp };
          if (command.action === "EDIT") { requireDomain(previous!.loginName !== command.values.loginName || previous!.loginEnabled !== command.values.loginEnabled, "NO_ACCOUNT_CHANGE", "No account changes supplied"); next = { ...next, ...command.values }; }
          else if (command.action !== "RESET_PASSWORD") { requireDomain(command.action === "DISABLE" ? previous!.loginEnabled : !previous!.loginEnabled, "INVALID_ACCOUNT_STATE", "Login state already applied"); next = { ...next, loginEnabled: command.action === "RESTORE" }; }
        }
        await tx.validateChange(previous, next);
        let passwordHash: string | null = null;
        if (password !== null) {
          try { await credentials!.assertNewPassword(password); } catch { requireDomain(false, "INVALID_ACCOUNT_PASSWORD", "Password does not meet the configured policy"); }
          passwordHash = await credentials!.passwords.hash(password);
          requireDomain(/^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$/.test(passwordHash), "INVALID_CREDENTIAL_PROVIDER", "Current supported password encoding required");
        }
        const old = previous ? accountMaintenanceFacts(previous) : null, current = accountMaintenanceFacts(next), before: Record<string, MaintenanceJsonValue> = {}, after: Record<string, MaintenanceJsonValue> = {};
        for (const [k, v] of Object.entries(current)) if (old === null || requestHash(v) !== requestHash(old[k])) { after[k] = v; if (old !== null) before[k] = old[k]!; }
        await tx.put(previous, next, passwordHash);
        const result = await tx.evidence.complete({ operationId, actorAccountId: actor.accountId, requestKey: command.requestKey, requestHash: hash, kind: "ACCOUNT", action: command.action, targetId: id, oldVersion: previous?.version ?? null, newVersion: next.version, beforeValues: previous ? before : null, afterValues: after, completedAt: timestamp });
        requireDomain(result.kind === "ACCOUNT" && result.operationId === operationId && result.targetId === id && result.version === next.version, "INVALID_DATABASE_VALUE", "Receipt differs from actual account save"); return result;
      });
    },
    async receipt(actorInput, keyInput) {
      const actor = checkedProductActor(actorInput), key = partyRequestKey(keyInput);
      return dependencies.unitOfWork.transaction(async tx => { const receipt = await tx.evidence.getReceipt(actor.accountId, key, "ACCOUNT"); await authorizeAccountMaintenance(tx.evidence, actor, "RECEIPT"); requireDomain(receipt && receipt.result.kind === "ACCOUNT", "RECEIPT_NOT_FOUND", "Original account receipt unavailable"); await authorizeAccountMaintenance(tx.evidence, actor, receipt.action);
        return { requestKey: key, action: receipt.action, status: "COMMITTED" as const, completedAt: receipt.completedAt, result: receipt.result }; });
    }
  } satisfies AccountMaintenanceService);
}
