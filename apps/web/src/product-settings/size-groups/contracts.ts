import type { QueryRead } from '../../loading/latest-query.ts';
import type { ReadScope } from '../../loading/read-scope.ts';
import type { DictionaryBarcodeScheme, DictionaryListQuery, DictionaryPage, DictionarySchemeQuery, DictionarySeason, DictionarySizeGroup } from '../../../../../packages/application/src/dictionary-read-ports.ts';
export type { DictionaryBarcodeScheme, DictionaryKind, DictionaryListQuery, DictionaryPage, DictionaryPageSize, DictionarySchemeQuery, DictionarySeason, DictionarySizeGroup } from '../../../../../packages/application/src/dictionary-read-ports.ts';
export interface DictionaryBrowserReader {
  readSizeGroups(read: QueryRead<DictionaryListQuery>): Promise<DictionaryPage<DictionarySizeGroup>>;
  readSeasons(read: QueryRead<DictionaryListQuery>): Promise<DictionaryPage<DictionarySeason>>;
  readBarcodeSchemes(read: QueryRead<DictionaryListQuery>): Promise<DictionaryPage<DictionaryBarcodeScheme>>;
  readBarcodeScheme(read: QueryRead<DictionarySchemeQuery>): Promise<DictionaryBarcodeScheme | null>;
}
export type ProductSettingTab = 'colors' | 'groups' | 'fits' | 'seasons';
export interface DictionaryPageProps {
  readonly scope: ReadScope; readonly reader: DictionaryBrowserReader;
  readonly onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void;
}
export interface ReadOnlySettingPageProps extends DictionaryPageProps {
  /** Parent owns route transitions and editable color/fit lanes. Missing destinations stay disabled. */
  readonly onSettingTab?: (tab: ProductSettingTab) => void;
  /** Explicit navigable tabs only. A callback alone never enables unavailable maintenance. */
  readonly focusSettingTab?: boolean;
  readonly allowedSettingTabs?: readonly ProductSettingTab[];
}
