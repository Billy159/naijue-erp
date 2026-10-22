import type { SettingsErrors } from '../settings/stores/maintenance-contracts.ts';
import { validateSettingsName } from '../settings/stores/maintenance-validation.ts';
import type { StaffRoleOption, StaffSettingsDraft, StaffSettingsRecord } from './contracts.ts';
export function validateStaffSettingsDraft(draft: Readonly<StaffSettingsDraft>, record: StaffSettingsRecord | null, roles: readonly StaffRoleOption[]): SettingsErrors {
  const errors: Record<string, string> = {}, name = validateSettingsName(draft.name);
  if (name || draft.name.includes('\0')) errors.name = name ?? '名称包含不可用字符。';
  const role = roles.find(item => item.value === draft.role);
  if (!role || !['ADMIN', 'WAREHOUSE', 'SALESPERSON'].includes(draft.role)) errors.role = '请选择已开放的角色。';
  if ((role?.requiresHall || draft.role === 'SALESPERSON') && !draft.hall) errors.hall = '请选择所属营业厅。';
  if ((record?.account || draft.loginEnabled) && !draft.loginName.trim()) errors.loginName = '请输入登录账号。';
  if (draft.contact.length > 2048 || draft.contact.includes('\0')) errors.contact = '联系方式过长或包含不可用字符。';
  if ((record?.account || draft.loginEnabled) && (new TextEncoder().encode(draft.loginName).byteLength > 256 || draft.loginName.includes('\0'))) errors.loginName = '登录账号过长或包含不可用字符。';
  if (new TextEncoder().encode(draft.password).byteLength > 1024) errors.password = '密码过长。';
  if (!record?.account && draft.loginEnabled && !draft.password) errors.password = '请输入初始密码。';
  if (record?.employmentStatus === '离职' && draft.loginEnabled) errors.loginEnabled = '离职员工不能开通登录。';
  return errors;
}

/** Map frozen native reads without retaining provider extras or auth/credential fields. */
export function projectStaffSettingsRecord(item: import('../../../../packages/application/src/organization-maintenance-ports.ts').OrganizationMaintenanceRecord): StaffSettingsRecord {
  if (item.kind !== 'STAFF') throw new TypeError('Expected native staff record');
  return { id: item.id, name: item.name, role: item.role, hall: item.hall ? { id: item.hall.id, name: item.hall.name } : null,
    contact: item.contact, employmentStatus: item.employmentStatus, version: item.version,
    // STAFF account metadata is joined by user_account.staff_id = staff.id.
    account: item.account ? { id: item.account.id, staffId: item.id, loginName: item.account.loginName, loginEnabled: item.account.loginEnabled, version: item.account.version } : null };
}
export function projectAccountSettingsRecord(item: import('../../../../packages/application/src/organization-maintenance-ports.ts').OrganizationMaintenanceRecord): import('./contracts.ts').AccountSettingsRecord {
  if (item.kind !== 'ACCOUNT' || item.createdAt === null || item.updatedAt === null) throw new TypeError('Expected native account record');
  return { id: item.id, version: item.version, loginName: item.loginName, loginEnabled: item.loginEnabled,
    createdAt: item.createdAt, updatedAt: item.updatedAt,
    staff: { id: item.staff.id, name: item.staff.name, role: item.staff.role, employmentStatus: item.staff.employmentStatus, hallId: item.staff.hallId } };
}

import type { StaffCommand, StaffCommandReceipt, StaffCommandResult, StaffReceiptIdentity } from './contracts.ts';
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const version = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 2147483647;
const key = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(value);
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('Invalid staff shape');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || !keys.every(name => Object.hasOwn(row, name))) throw new TypeError('Invalid staff shape'); return row;
}
const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
/** Browser-safe exact W8 parser. The server parser uses Node Buffer; do not bundle it. */
export function validateStaffCommand(value: unknown): StaffCommand {
  const action = (value as { action?: unknown } | null)?.action;
  if (action !== 'CREATE' && action !== 'EDIT' && action !== 'LEAVE' && action !== 'REINSTATE') throw new TypeError('Invalid staff action');
  const full = action === 'CREATE' || action === 'EDIT';
  const row = exact(value, ['action', 'requestKey', ...(action === 'CREATE' ? [] : ['id', 'expectedVersion']), ...(full ? ['values', 'account'] : [])]);
  if (!key(row.requestKey) || action !== 'CREATE' && (!uuid(row.id) || !version(row.expectedVersion))) throw new TypeError('Invalid staff identity');
  if (action === 'LEAVE' || action === 'REINSTATE') return { action, requestKey: row.requestKey, id: row.id as string, expectedVersion: row.expectedVersion as number };
  const v = exact(row.values, ['name', 'role', 'hallId', 'contact']);
  if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 2048 || v.name.includes('\0')
    || v.role !== 'ADMIN' && v.role !== 'WAREHOUSE' && v.role !== 'SALESPERSON'
    || v.hallId !== null && !uuid(v.hallId) || v.role === 'SALESPERSON' && v.hallId === null
    || v.contact !== null && (typeof v.contact !== 'string' || v.contact.length > 2048 || v.contact.includes('\0'))) throw new TypeError('Invalid staff values');
  const values: Extract<StaffCommand, { action: 'CREATE' }>['values'] = { name: v.name, role: v.role, hallId: v.hallId, contact: v.contact };
  let account: Extract<StaffCommand, { action: 'CREATE' }>['account'] = null;
  if (row.account !== null) {
    const a = exact(row.account, ['id', 'expectedVersion', 'loginName', 'loginEnabled', 'password']);
    if (a.id !== null && !uuid(a.id) || a.expectedVersion !== null && !version(a.expectedVersion)
      || (a.id === null) !== (a.expectedVersion === null) || action === 'CREATE' && a.id !== null
      || typeof a.loginName !== 'string' || !a.loginName.trim() || a.loginName.includes('\0') || bytes(a.loginName) > 256
      || typeof a.loginEnabled !== 'boolean' || a.password !== null && (typeof a.password !== 'string' || !a.password || bytes(a.password) > 1024)
      || a.id === null && a.password === null) throw new TypeError('Invalid linked account');
    account = { id: a.id, expectedVersion: a.expectedVersion, loginName: a.loginName, loginEnabled: a.loginEnabled, password: a.password };
  }
  return action === 'CREATE' ? { action, requestKey: row.requestKey, values, account }
    : { action, requestKey: row.requestKey, id: row.id as string, expectedVersion: row.expectedVersion as number, values, account };
}
export function staffReceiptIdentity(command: StaffCommand): StaffReceiptIdentity {
  return Object.freeze(command.action === 'CREATE' ? { action: command.action, requestKey: command.requestKey }
    : { action: command.action, requestKey: command.requestKey, id: command.id, expectedVersion: command.expectedVersion });
}
export function validateStaffReceiptIdentity(value: unknown): StaffReceiptIdentity {
  const action = (value as { action?: unknown } | null)?.action;
  if (action !== 'CREATE' && action !== 'EDIT' && action !== 'LEAVE' && action !== 'REINSTATE') throw new TypeError('Invalid receipt action');
  const row = exact(value, action === 'CREATE' ? ['action', 'requestKey'] : ['action', 'requestKey', 'id', 'expectedVersion']);
  if (!key(row.requestKey) || action !== 'CREATE' && (!uuid(row.id) || !version(row.expectedVersion))) throw new TypeError('Invalid receipt identity');
  return action === 'CREATE' ? { action, requestKey: row.requestKey } : { action, requestKey: row.requestKey, id: row.id as string, expectedVersion: row.expectedVersion as number };
}
export function validateStaffResult(value: unknown, original: StaffReceiptIdentity): StaffCommandResult {
  const row = exact(value, ['operationId', 'kind', 'targetId', 'version']);
  if (!uuid(row.operationId) || !uuid(row.targetId) || row.kind !== 'STAFF' || !version(row.version) || row.version !== (original.action === 'CREATE' ? 1 : original.expectedVersion + 1)
    || original.action !== 'CREATE' && row.targetId !== original.id) throw new TypeError('Invalid staff result');
  return Object.freeze({ operationId: row.operationId, kind: 'STAFF', targetId: row.targetId, version: row.version as number });
}
export function validateStaffReceipt(value: unknown, original: StaffReceiptIdentity): StaffCommandReceipt {
  const row = exact(value, ['requestKey', 'action', 'status', 'completedAt', 'result']);
  if (row.requestKey !== original.requestKey || row.action !== original.action || row.status !== 'COMMITTED' || typeof row.completedAt !== 'string'
    || row.completedAt.length > 64 || !Number.isFinite(Date.parse(row.completedAt)) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(row.completedAt)) throw new TypeError('Invalid staff receipt');
  return Object.freeze({ requestKey: original.requestKey, action: original.action, status: 'COMMITTED', completedAt: row.completedAt, result: validateStaffResult(row.result, original) });
}
/** Drop extra provider fields before retaining any record in a session editor. */
export function safeStaffEditorRecord(record: StaffSettingsRecord): StaffSettingsRecord {
  return { id: record.id, name: record.name, role: record.role, hall: record.hall ? { id: record.hall.id, name: record.hall.name } : null,
    contact: record.contact, employmentStatus: record.employmentStatus, version: record.version,
    account: record.account ? { id: record.account.id, staffId: record.account.staffId, loginName: record.account.loginName, loginEnabled: record.account.loginEnabled, version: record.account.version } : null };
}
export function validateStaffReadback(record: StaffSettingsRecord | null, result: StaffCommandResult): StaffSettingsRecord {
  if (!record || record.id !== result.targetId || !version(record.version) || record.version < result.version
    || record.account && (!uuid(record.account.id) || record.account.staffId !== record.id || !version(record.account.version))) throw new TypeError('Invalid staff readback');
  return safeStaffEditorRecord(record);
}
