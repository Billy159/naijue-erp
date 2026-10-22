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
