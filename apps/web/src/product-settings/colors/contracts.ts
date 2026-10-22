import type { QueryRead } from '../../loading/latest-query.ts';
import type { ReadScope } from '../../loading/read-scope.ts';
import type { CatalogueSettingsEntry, CatalogueSettingsListQuery, CatalogueSettingsPage, CatalogueSettingsTree, CatalogueSettingsTreeQuery } from '../../../../../packages/application/src/catalogue-settings-read-ports.ts';

export type { CatalogueSettingsCategory, CatalogueSettingsEntry, CatalogueSettingsListQuery, CatalogueSettingsPage, CatalogueSettingsTree, CatalogueSettingsTreeQuery } from '../../../../../packages/application/src/catalogue-settings-read-ports.ts';
export interface CatalogueSettingsBrowserReader {
  readCategories(read: QueryRead<CatalogueSettingsTreeQuery>): Promise<CatalogueSettingsTree>;
  readColors(read: QueryRead<CatalogueSettingsListQuery>): Promise<CatalogueSettingsPage<CatalogueSettingsEntry>>;
  readFits(read: QueryRead<CatalogueSettingsListQuery>): Promise<CatalogueSettingsPage<CatalogueSettingsEntry>>;
}
export interface CatalogueSettingsPageProps {
  readonly scope: ReadScope;
  readonly reader: CatalogueSettingsBrowserReader;
  /** The page clears its child scope before the trusted host invalidates current access. */
  readonly onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void;
}
export type CatalogueSettingTab = 'colors' | 'groups' | 'fits' | 'seasons';
export interface CatalogueEntryPageProps extends CatalogueSettingsPageProps {
  readonly onSettingTab?: (tab: CatalogueSettingTab) => void;
  /** An existing callback is not proof that all four destinations are implemented. */
  readonly focusSettingTab?: boolean;
  readonly allowedSettingTabs?: readonly CatalogueSettingTab[];
}
