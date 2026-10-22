import type { QueryRead } from '../../loading/latest-query.ts';
import type { ReadScope } from '../../loading/read-scope.ts';
import type { StoreSettingsDetail, StoreSettingsDetailQuery, StoreSettingsKind, StoreSettingsListQuery, StoreSettingsPage } from '../../../../../packages/application/src/store-settings-read-ports.ts';
export type { StoreSettingsDetail, StoreSettingsDetailQuery, StoreSettingsEntry, StoreSettingsKind, StoreSettingsListQuery, StoreSettingsPage, StoreSettingsReference } from '../../../../../packages/application/src/store-settings-read-ports.ts';
export interface StoreSettingsBrowserReader {
  readList(kind: StoreSettingsKind, read: QueryRead<StoreSettingsListQuery>): Promise<StoreSettingsPage>;
  readDetail(kind: StoreSettingsKind, read: QueryRead<StoreSettingsDetailQuery>): Promise<StoreSettingsDetail>;
}
export interface StoreSettingsPageProps {
  readonly scope: ReadScope; readonly reader: StoreSettingsBrowserReader;
  readonly onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void;
  readonly onTab?: (kind: StoreSettingsKind) => void;
  readonly focusTab?: boolean;
  readonly allowedTabs?: readonly StoreSettingsKind[];
  /** UI capability only, not a grant. Clicking the filter still requires an exact,
   * current stores/list directory grant from the trusted server. Absent => disabled. */
  readonly allowHallDirectoryRead?: boolean;
}
