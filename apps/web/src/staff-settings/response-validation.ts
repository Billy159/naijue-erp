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
