import type { QueryRead } from '../../loading/latest-query.ts';
import type { ReadScope } from '../../loading/read-scope.ts';
import type { CatalogueMaintenanceAction, CatalogueMaintenanceClient, CatalogueMaintenanceCommand } from '../catalogue-maintenance-http-client.ts';
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
  readonly maintenance?: CatalogueMaintenanceCapability;
  readonly onCanLeaveChange?: (guard: (() => boolean) | null) => void;
}
/** Explicit UI capability; server independently checks current actor and schema. */
interface CatalogueMaintenanceCapabilityBase {
  readonly client: CatalogueMaintenanceClient;
  readonly allowedActions: readonly CatalogueMaintenanceAction[];
  readonly newRequestKey: () => string;
  readonly onRecoveryRequired: (command: CatalogueMaintenanceCommand) => void;
}
/** Trusted host sets this only after the exact v15 profile and backend order
 * transaction are paired. The action grant alone cannot activate dragging. */
export type CatalogueMaintenanceCapability = CatalogueMaintenanceCapabilityBase & (
  { readonly kind: 'CATEGORY'; readonly categoryOrderReady?: true }
  | { readonly kind: 'COLOR' | 'FIT'; readonly categoryOrderReady?: never }
);
export type CatalogueSettingTab = 'colors' | 'groups' | 'fits' | 'seasons';
export interface CatalogueEntryPageProps extends CatalogueSettingsPageProps {
  readonly onSettingTab?: (tab: CatalogueSettingTab) => void;
  /** An existing callback is not proof that all four destinations are implemented. */
  readonly focusSettingTab?: boolean;
  readonly allowedSettingTabs?: readonly CatalogueSettingTab[];
}
