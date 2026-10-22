import type { ReadScope } from '../loading/read-scope.ts';
import { SettingsDraftController } from '../settings/stores/maintenance-controller.ts';
import type { StaffRoleOption, StaffSettingsDraft, StaffSettingsRecord } from './contracts.ts';
import { validateStaffSettingsDraft } from './response-validation.ts';
export class StaffSettingsController extends SettingsDraftController<StaffSettingsDraft> {
  readonly record: StaffSettingsRecord | null;
  constructor(scope: ReadScope, record: StaffSettingsRecord | null, roles: readonly StaffRoleOption[]) {
    super(scope, { name: record?.name ?? '', role: record?.role ?? '', hall: record?.hall ?? null,
      contact: record?.contact ?? '', loginName: record?.account?.loginName ?? '',
      loginEnabled: record ? record.account?.loginEnabled ?? false : true, password: '' },
      draft => validateStaffSettingsDraft(draft, record, roles));
    this.record = record;
  }
}
