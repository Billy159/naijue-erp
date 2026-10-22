import type { QueryRead } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import type { SettingsDirectoryReader, SettingsReference } from '../settings/stores/maintenance-contracts.ts';
/** Private UI projection. The future B05 HTTP adapter must map its frozen DTO. */
export interface StaffSettingsRecord {
  readonly id: string; readonly name: string; readonly role: string;
  readonly hall: SettingsReference | null; readonly contact: string | null;
  readonly employmentStatus: string; readonly version: number;
  readonly account: { readonly id: string; readonly staffId: string; readonly loginName: string; readonly loginEnabled: boolean; readonly version: number } | null;
}
export interface StaffSettingsQuery {
  readonly search: string; readonly role: string; readonly hallId: string | null;
  readonly employmentStatus: '在职' | '离职' | 'all'; readonly loginStatus: '' | 'open' | 'closed';
  readonly page: number; readonly pageSize: 20 | 50 | 100;
}
export interface StaffSettingsPage {
  readonly items: readonly StaffSettingsRecord[]; readonly total: number;
  readonly page: number; readonly pageSize: 20 | 50 | 100;
}
export interface StaffSettingsReader {
  readList(read: QueryRead<StaffSettingsQuery>): Promise<StaffSettingsPage>;
  readDetail(read: QueryRead<{ readonly id: string }>): Promise<StaffSettingsRecord | null>;
}
export interface StaffRoleOption { readonly value: string; readonly label: string; readonly requiresHall: boolean }
/** Ephemeral local input only. Passwords are never a read field or saved draft. */
export interface StaffSettingsDraft {
  readonly name: string; readonly role: string; readonly hall: SettingsReference | null;
  readonly contact: string; readonly loginName: string; readonly loginEnabled: boolean;
  readonly password: string;
}
export interface StaffSettingsProps {
  readonly scope: ReadScope; readonly reader?: StaffSettingsReader;
  readonly directory?: SettingsDirectoryReader; readonly roles: readonly StaffRoleOption[];
  readonly canPrepare: boolean;
  readonly onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void;
}
export const initialStaffSettingsQuery: StaffSettingsQuery = Object.freeze({ search: '', role: '', hallId: null, employmentStatus: '在职', loginStatus: '', page: 1, pageSize: 20 });
