import type { AccountCommand, AccountCommandReceipt, AccountCommandResult, AccountReceiptIdentity, AccountSettingsRecord, AccountStaffCandidate } from './contracts.ts';
import type { StaffSettingsRecord } from '../staff-settings/contracts.ts';
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const version = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 2147483647;
const key = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(value);
const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
export const validLoginName = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && !value.includes('\0') && bytes(value) <= 256;
export const validPassword = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && bytes(value) <= 1024;
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('Invalid account shape');
  const row = value as Record<string, unknown>; if (Reflect.ownKeys(row).length !== keys.length || !keys.every(name => Object.hasOwn(row, name))) throw new TypeError('Invalid account shape'); return row;
}
/** Browser-safe W7 parser. Runtime server password parser uses Node Buffer. */
export function validateAccountCommand(value: unknown): AccountCommand {
  const action = (value as { action?: unknown } | null)?.action;
  if (action !== 'CREATE' && action !== 'EDIT' && action !== 'DISABLE' && action !== 'RESTORE' && action !== 'RESET_PASSWORD') throw new TypeError('Invalid account action');
  const row = exact(value, ['action', 'requestKey', ...(action === 'CREATE' ? [] : ['id', 'expectedVersion']), ...(action === 'CREATE' || action === 'EDIT' ? ['values'] : action === 'RESET_PASSWORD' ? ['password'] : [])]);
  if (!key(row.requestKey) || action !== 'CREATE' && (!uuid(row.id) || !version(row.expectedVersion))) throw new TypeError('Invalid account identity');
  if (action === 'CREATE' || action === 'EDIT') {
    const values = exact(row.values, action === 'CREATE' ? ['staffId', 'loginName', 'loginEnabled', 'password'] : ['loginName', 'loginEnabled']);
    if (!validLoginName(values.loginName) || typeof values.loginEnabled !== 'boolean') throw new TypeError('Invalid account values');
    const safe = { loginName: values.loginName, loginEnabled: values.loginEnabled };
    if (action === 'CREATE') {
      if (!uuid(values.staffId) || !validPassword(values.password)) throw new TypeError('Invalid account creation');
      return { action, requestKey: row.requestKey, values: { ...safe, staffId: values.staffId, password: values.password } };
    }
    return { action, requestKey: row.requestKey, id: row.id as string, expectedVersion: row.expectedVersion as number, values: safe };
  }
  const base = { requestKey: row.requestKey, id: row.id as string, expectedVersion: row.expectedVersion as number };
  if (action === 'RESET_PASSWORD') { if (!validPassword(row.password)) throw new TypeError('Invalid new password'); return { ...base, action, password: row.password }; }
  return { ...base, action };
}
export function accountReceiptIdentity(command: AccountCommand): AccountReceiptIdentity {
  return Object.freeze(command.action === 'CREATE' ? { action: command.action, requestKey: command.requestKey }
    : { action: command.action, requestKey: command.requestKey, id: command.id, expectedVersion: command.expectedVersion });
}
export function validateAccountReceiptIdentity(value: unknown): AccountReceiptIdentity {
  const action = (value as { action?: unknown } | null)?.action;
  if (action !== 'CREATE' && action !== 'EDIT' && action !== 'DISABLE' && action !== 'RESTORE' && action !== 'RESET_PASSWORD') throw new TypeError('Invalid account receipt action');
  const row = exact(value, action === 'CREATE' ? ['action', 'requestKey'] : ['action', 'requestKey', 'id', 'expectedVersion']);
  if (!key(row.requestKey) || action !== 'CREATE' && (!uuid(row.id) || !version(row.expectedVersion))) throw new TypeError('Invalid account receipt identity');
  return action === 'CREATE' ? { action, requestKey: row.requestKey } : { action, requestKey: row.requestKey, id: row.id as string, expectedVersion: row.expectedVersion as number };
}
export function validateAccountResult(value: unknown, original: AccountReceiptIdentity): AccountCommandResult {
  const row = exact(value, ['operationId', 'kind', 'targetId', 'version']);
  if (!uuid(row.operationId) || !uuid(row.targetId) || row.kind !== 'ACCOUNT' || !version(row.version)
    || row.version !== (original.action === 'CREATE' ? 1 : original.expectedVersion + 1) || original.action !== 'CREATE' && row.targetId !== original.id) throw new TypeError('Invalid account result');
  return Object.freeze({ operationId: row.operationId, kind: 'ACCOUNT', targetId: row.targetId, version: row.version });
}
export function validateAccountReceipt(value: unknown, original: AccountReceiptIdentity): AccountCommandReceipt {
  const row = exact(value, ['requestKey', 'action', 'status', 'completedAt', 'result']);
  if (row.requestKey !== original.requestKey || row.action !== original.action || row.status !== 'COMMITTED' || typeof row.completedAt !== 'string'
    || row.completedAt.length > 64 || !Number.isFinite(Date.parse(row.completedAt)) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(row.completedAt)) throw new TypeError('Invalid account receipt');
  return Object.freeze({ requestKey: original.requestKey, action: original.action, status: 'COMMITTED', completedAt: row.completedAt, result: validateAccountResult(row.result, original) });
}
export function accountStaffCandidate(row: StaffSettingsRecord): AccountStaffCandidate {
  return { id: row.id, name: row.name, role: row.role, employmentStatus: row.employmentStatus, hallId: row.hall?.id ?? null, hasAccount: row.account !== null };
}
export function safeAccountRecord(row: AccountSettingsRecord): AccountSettingsRecord {
  return { id: row.id, version: row.version, loginName: row.loginName, loginEnabled: row.loginEnabled, createdAt: row.createdAt, updatedAt: row.updatedAt,
    staff: { id: row.staff.id, name: row.staff.name, role: row.staff.role, employmentStatus: row.staff.employmentStatus, hallId: row.staff.hallId } };
}
export function validateAccountReadback(row: AccountSettingsRecord | null, result: AccountCommandResult, staffId: string): AccountSettingsRecord {
  if (!row || row.id !== result.targetId || !version(row.version) || row.version < result.version || row.staff.id !== staffId) throw new TypeError('Invalid account readback');
  return safeAccountRecord(row);
}
export function mayEnableLogin(staff: { readonly employmentStatus: string; readonly role: string; readonly hallId: string | null }): boolean {
  return staff.employmentStatus === '在职' && (staff.role === 'ADMIN' || staff.role === 'WAREHOUSE' || staff.role === 'SALESPERSON' && staff.hallId !== null);
}
