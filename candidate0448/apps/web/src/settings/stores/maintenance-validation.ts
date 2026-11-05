import type { SettingsErrors, SettingsReference, StoreMaintenanceDraft } from './maintenance-contracts.ts';
import type { StoreSettingsEntry, StoreSettingsKind } from './contracts.ts';
export function validateSettingsName(name: string): string | null {
  return !name.trim() ? '请输入名称。' : name.length > 2048 ? '名称过长。' : null;
}
export function validateStoreMaintenanceDraft(kind: StoreSettingsKind, draft: StoreMaintenanceDraft, record: StoreSettingsEntry | null): SettingsErrors {
  const errors: Record<string, string> = {}, name = validateSettingsName(draft.name);
  if (name) errors.name = name;
  if (kind === 'warehouses' && !draft.hall?.id) errors.hall = '请选择一个所属营业厅。';
  if (kind === 'stores' && draft.warehouse && !record?.id) errors.warehouse = '请先创建营业厅和本厅仓库，再设置默认出库仓。';
  return errors;
}
export function storeMaintenanceDraft(record: StoreSettingsEntry | null): StoreMaintenanceDraft {
  const reference = (value: SettingsReference | null) => value ? { ...value } : null;
  return { name: record?.name ?? '', enabled: record?.enabled ?? true,
    hall: record?.kind === 'warehouses' ? reference(record.hall) : null,
    customer: record?.kind === 'stores' ? reference(record.defaultCustomer) : null,
    warehouse: record?.kind === 'stores' ? reference(record.defaultWarehouse) : null };
}

import type { StoreCommand, StoreCommandReceipt, StoreCommandResult } from './maintenance-contracts.ts';
import { parseOrganizationWriteCommand } from '../../../../../packages/application/src/organization-maintenance-validation.ts';
export function storeNativeKind(kind: StoreSettingsKind): 'HALL' | 'WAREHOUSE' {
  if (kind !== 'stores' && kind !== 'warehouses') throw new TypeError('Invalid organization kind');
  return kind === 'stores' ? 'HALL' : 'WAREHOUSE';
}
export function validateStoreCommand(kind: StoreSettingsKind, value: unknown): StoreCommand {
  return parseOrganizationWriteCommand(storeNativeKind(kind), value);
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid response');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || !keys.every(key => Object.hasOwn(row, key))) throw new TypeError('Invalid response');
  return row;
}
export function validateStoreResult(value: unknown, kind: StoreSettingsKind, original: StoreCommand): StoreCommandResult {
  const row = exact(value, ['operationId', 'kind', 'targetId', 'version']), expectedKind = storeNativeKind(kind);
  if (!uuid(row.operationId) || !uuid(row.targetId) || row.kind !== expectedKind
    || row.version !== (original.action === 'CREATE' ? 1 : original.expectedVersion + 1)
    || (original.action !== 'CREATE' && row.targetId !== original.id)) throw new TypeError('Invalid result');
  return Object.freeze({ operationId: row.operationId, kind: expectedKind, targetId: row.targetId, version: row.version as number });
}
export function validateStoreReceipt(value: unknown, kind: StoreSettingsKind, original: StoreCommand): StoreCommandReceipt {
  const row = exact(value, ['requestKey', 'action', 'status', 'completedAt', 'result']);
  if (row.requestKey !== original.requestKey || row.action !== original.action || row.status !== 'COMMITTED'
    || typeof row.completedAt !== 'string' || row.completedAt.length > 64 || !Number.isFinite(Date.parse(row.completedAt))
    || !/(?:Z|[+-]\d{2}:\d{2})$/.test(row.completedAt)) throw new TypeError('Invalid receipt');
  return Object.freeze({ requestKey: original.requestKey, action: original.action, status: 'COMMITTED', completedAt: row.completedAt,
    result: validateStoreResult(row.result, kind, original) });
}
