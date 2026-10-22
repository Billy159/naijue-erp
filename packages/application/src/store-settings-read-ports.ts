import type { ActorContext } from './ports.ts';

export const storeSettingsPageSizes = [20, 50, 100] as const;
export type StoreSettingsPageSize = typeof storeSettingsPageSizes[number];
export type StoreSettingsKind = 'stores' | 'warehouses';
export type StoreSettingsStatus = 'normal' | 'disabled' | 'all';
export interface StoreSettingsListQuery {
  readonly search: string; readonly status: StoreSettingsStatus; readonly hallId: string | null;
  readonly page: number; readonly pageSize: StoreSettingsPageSize;
}
export interface StoreSettingsDetailQuery { readonly id: string }
export type StoreSettingsReadIntent =
  | { readonly kind: StoreSettingsKind; readonly operation: 'list'; readonly parameters: StoreSettingsListQuery }
  | { readonly kind: StoreSettingsKind; readonly operation: 'detail'; readonly parameters: StoreSettingsDetailQuery };
/** Server-only directory scope. A transaction candidate grant is NOT this grant.
 * HALL_IDS applies to hall.id for stores and warehouse.hall_id for warehouses.
 * REFERENCES explicitly authorizes names of the actual FK targets of permitted
 * rows, including disabled targets and cross-hall default warehouses. NONE must
 * not read target tables and must return null names. Neither permits enumeration
 * of the referenced customer/warehouse/hall directories. */
export type StoreSettingsScope = { readonly kind: 'ALL' } | { readonly kind: 'HALL_IDS'; readonly hallIds: readonly string[] };
export interface StoreSettingsReadGrant {
  readonly kind: StoreSettingsKind; readonly operation: 'list' | 'detail';
  readonly scope: StoreSettingsScope; readonly references: 'NONE' | 'REFERENCES';
  /** Explicit null for enumeration; exact native target for a detail grant. */
  readonly targetId: string | null;
}
export interface StoreSettingsReference { readonly id: string; readonly name: string | null }
interface StoreSettingsNativeBase {
  readonly id: string; readonly name: string; readonly enabled: boolean; readonly version: number;
  /** These native tables do not record timestamps. Import/review time is not creation time. */
  readonly createdAt: null; readonly updatedAt: null;
}
export interface StoreSettingsStore extends StoreSettingsNativeBase {
  readonly kind: 'stores'; readonly defaultCustomer: StoreSettingsReference | null; readonly defaultWarehouse: StoreSettingsReference | null;
}
export interface StoreSettingsWarehouse extends StoreSettingsNativeBase {
  readonly kind: 'warehouses'; readonly hall: StoreSettingsReference;
  /** No inventory completeness/deactivation capability is granted by this read. */
  readonly stockFacts: null;
}
export type StoreSettingsEntry = StoreSettingsStore | StoreSettingsWarehouse;
export interface StoreSettingsPage { readonly page: number; readonly pageSize: StoreSettingsPageSize; readonly total: number; readonly items: readonly StoreSettingsEntry[] }
export interface StoreSettingsDetail { readonly item: StoreSettingsEntry | null }
export interface StoreSettingsReadAuthorization {
  authorize(actor: ActorContext, intent: StoreSettingsReadIntent, signal: AbortSignal): Promise<StoreSettingsReadGrant>;
}
export interface StoreSettingsScopedRead { readonly actor: ActorContext; readonly intent: StoreSettingsReadIntent; readonly grant: StoreSettingsReadGrant; readonly signal: AbortSignal }
export interface StoreSettingsReader {
  readList(read: StoreSettingsScopedRead): Promise<StoreSettingsPage>;
  readDetail(read: StoreSettingsScopedRead): Promise<StoreSettingsDetail>;
}
export interface StoreSettingsReadDependencies { readonly authorization: StoreSettingsReadAuthorization; readonly reader: StoreSettingsReader }
