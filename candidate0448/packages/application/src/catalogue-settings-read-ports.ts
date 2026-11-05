import type { ActorContext } from './ports.ts';

export const catalogueSettingsPageSizes = [20, 50, 100] as const;
export const CATALOGUE_SETTINGS_MAX_CATEGORIES = 5000;
export type CatalogueSettingsPageSize = typeof catalogueSettingsPageSizes[number];
export type CatalogueSettingsKind = 'categories' | 'colors' | 'fits';
export interface CatalogueSettingsListQuery { readonly search: string; readonly page: number; readonly pageSize: CatalogueSettingsPageSize }
export type CatalogueSettingsTreeQuery = Readonly<Record<string, never>>;
export type CatalogueSettingsReadIntent =
  | { readonly kind: 'categories'; readonly operation: 'tree'; readonly parameters: CatalogueSettingsTreeQuery }
  | { readonly kind: 'colors' | 'fits'; readonly operation: 'list'; readonly parameters: CatalogueSettingsListQuery };
/** Server-only explicit full-directory grants, not transaction candidate access.
 * ALL additionally means the current actor may see COMPLETE direct product counts
 * for every category. A category directory grant alone never implies that right.
 * NONE must not query products and returns productCount:null, never a guessed zero.
 * A hall-limited or partially visible product scope is NOT an ALL grant. */
export type CatalogueSettingsReadGrant =
  | { readonly kind: 'categories'; readonly operation: 'tree'; readonly productCounts: 'NONE' | 'ALL' }
  | { readonly kind: 'colors' | 'fits'; readonly operation: 'list' };
export interface CatalogueSettingsReadAuthorization {
  authorize(actor: ActorContext, intent: CatalogueSettingsReadIntent, signal: AbortSignal): Promise<CatalogueSettingsReadGrant>;
}
export interface CatalogueSettingsScopedRead {
  readonly actor: ActorContext; readonly grant: CatalogueSettingsReadGrant;
  readonly intent: CatalogueSettingsReadIntent; readonly signal: AbortSignal;
}
export interface CatalogueSettingsEntry { readonly id: string; readonly code: string; readonly name: string; readonly enabled: boolean; readonly version: number }
/** Native category has no code or enabled field. Parent/order are preserved exactly;
 * no artificial 'all' record, inferred identity, reparenting or two-level flattening. */
export interface CatalogueSettingsCategory {
  readonly id: string; readonly parentId: string | null; readonly name: string; readonly displayOrder: number;
  readonly version: number; readonly code: null; readonly productCount: number | null; readonly childCount: number;
}
export interface CatalogueSettingsPage<T> { readonly page: number; readonly pageSize: CatalogueSettingsPageSize; readonly total: number; readonly items: readonly T[] }
export interface CatalogueSettingsTree { readonly total: number; readonly items: readonly CatalogueSettingsCategory[] }
export interface CatalogueSettingsReader {
  readCategories(read: CatalogueSettingsScopedRead): Promise<CatalogueSettingsTree>;
  readColors(read: CatalogueSettingsScopedRead): Promise<CatalogueSettingsPage<CatalogueSettingsEntry>>;
  readFits(read: CatalogueSettingsScopedRead): Promise<CatalogueSettingsPage<CatalogueSettingsEntry>>;
}
export interface CatalogueSettingsReadDependencies { readonly authorization: CatalogueSettingsReadAuthorization; readonly reader: CatalogueSettingsReader }
