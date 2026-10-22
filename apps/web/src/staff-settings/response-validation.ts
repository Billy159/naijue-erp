import type { SettingsErrors } from '../settings/stores/maintenance-contracts.ts';
import { validateSettingsName } from '../settings/stores/maintenance-validation.ts';
import type { StaffRoleOption, StaffSettingsDraft, StaffSettingsRecord } from './contracts.ts';
export function validateStaffSettingsDraft(draft: Readonly<StaffSettingsDraft>, record: StaffSettingsRecord | null, roles: readonly StaffRoleOption[]): SettingsErrors {
  const errors: Record<string, string> = {}, name = validateSettingsName(draft.name);
  if (name) errors.name = name;
  const role = roles.find(item => item.value === draft.role);
  if (!role) errors.role = '请选择已开放的角色。';
  if (role?.requiresHall && !draft.hall) errors.hall = '请选择所属营业厅。';
  if ((record?.account || draft.loginEnabled) && !draft.loginName.trim()) errors.loginName = '请输入登录账号。';
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
