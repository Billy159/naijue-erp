import { entityId } from '../../../../packages/domain/src/values.ts';
/** Public presentation switches only. The server remains the authorization owner. */
export interface ProductionHostConfiguration {
  readonly kind: 'naijue-erp-production-host';
  readonly http: { readonly origin: string; readonly basePath: '/api' };
  readonly assets: { readonly basePath: string };
  readonly session: { readonly verifyOnMount: true };
  readonly routes: {
    readonly inventory: boolean; readonly sales: boolean; readonly transfers: boolean; readonly inventoryLedger?: boolean;
    readonly staffSettings?: boolean; readonly paymentSettings?: boolean; readonly accountSettings?: boolean;
    readonly salesManualCreate?: boolean; readonly transferManualCreate?: boolean;
    readonly salesExistingEdit?: boolean;
    readonly products?: boolean; readonly productCategories?: boolean; readonly barcodeSchemes?: boolean;
    readonly productViewer?: boolean; readonly productFullPage?: boolean; readonly salesProductFullPage?: boolean; readonly transferProductFullPage?: boolean; readonly transferInitialSizeGroupId?: string;
    readonly parties?: false | { readonly readOnly: true };
    readonly productSettings?: false | { readonly colors: boolean; readonly fits: boolean; readonly groups: boolean; readonly seasons: boolean; readonly initialTab: 'colors' | 'fits' | 'groups' | 'seasons' };
    readonly storeSettings?: false | { readonly allowedTabs: readonly ('stores' | 'warehouses')[]; readonly initialTab: 'stores' | 'warehouses'; readonly allowHallDirectoryRead: boolean };
  };
}
const requiredStyles = ['application', 'inventory', 'sales', 'sales-detail', 'parties', 'transfers', 'transfer-detail', 'transfer-product'] as const;
const optionalStyles = ['products', 'product-categories', 'product-settings', 'barcode-schemes', 'store-settings', 'product-full-page', 'staff-settings', 'payment-settings'] as const;
export interface ProductionHostAssets {
  readonly entry: string;
  readonly styles: Readonly<Record<typeof requiredStyles[number], string> & Partial<Record<typeof optionalStyles[number], string>>>;
  readonly productDrawerStyles: string;
}
function invalid(): never { throw new TypeError('Explicit public production-host configuration is required.'); }
function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || required.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) return invalid();
  return value as Record<string, unknown>;
}
export function parseProductionHostConfiguration(value: unknown): ProductionHostConfiguration {
  const row = record(value, ['kind', 'http', 'assets', 'session', 'routes']);
  const http = record(row.http, ['origin', 'basePath']), assets = record(row.assets, ['basePath']), session = record(row.session, ['verifyOnMount']);
  let origin: URL;
  try { origin = new URL(http.origin as string); } catch { return invalid(); }
  if (row.kind !== 'naijue-erp-production-host' || typeof http.origin !== 'string' || origin.protocol !== 'https:'
    || origin.origin !== http.origin || origin.username || origin.password || http.basePath !== '/api' || session.verifyOnMount !== true
    || typeof assets.basePath !== 'string' || !/^\/assets\/(?:[A-Za-z0-9_-]+\/)*$/.test(assets.basePath)) return invalid();
  const booleanKeys = ['inventory', 'sales', 'transfers', 'inventoryLedger', 'salesManualCreate', 'transferManualCreate', 'salesExistingEdit', 'products', 'productCategories', 'barcodeSchemes', 'productViewer', 'productFullPage', 'salesProductFullPage', 'transferProductFullPage', 'staffSettings', 'paymentSettings', 'accountSettings'] as const;
  const routes = record(row.routes, ['inventory', 'sales', 'transfers'], [...booleanKeys.slice(3), 'parties', 'productSettings', 'storeSettings', 'transferInitialSizeGroupId']);
  for (const key of booleanKeys) if (Object.hasOwn(routes, key) && typeof routes[key] !== 'boolean') return invalid();
  for (const [child, parent] of [['inventoryLedger', 'inventory'], ['salesManualCreate', 'sales'], ['transferManualCreate', 'transfers'], ['salesExistingEdit', 'sales'], ['productViewer', 'products'], ['productFullPage', 'products'], ['salesProductFullPage', 'sales'], ['transferProductFullPage', 'transfers']] as const) {
    if (routes[child] === true && routes[parent] !== true) return invalid();
  }
  const switches = Object.fromEntries(booleanKeys.filter(key => Object.hasOwn(routes, key)).map(key => [key, routes[key]]));
  const extras: Record<string, unknown> = {};
  if (Object.hasOwn(routes, 'transferInitialSizeGroupId')) {
    if (routes.transfers !== true || typeof routes.transferInitialSizeGroupId !== 'string') return invalid();
    try { entityId('sizeGroup', routes.transferInitialSizeGroupId); } catch { return invalid(); }
    extras.transferInitialSizeGroupId = routes.transferInitialSizeGroupId;
  }
  if (Object.hasOwn(routes, 'parties')) {
    if (routes.parties === false) extras.parties = false;
    else { if (record(routes.parties, ['readOnly']).readOnly !== true) return invalid(); extras.parties = Object.freeze({ readOnly: true }); }
  }
  if (Object.hasOwn(routes, 'productSettings')) {
    if (routes.productSettings === false) extras.productSettings = false;
    else {
      const settings = record(routes.productSettings, ['colors', 'fits', 'groups', 'seasons', 'initialTab']);
      const tabs = ['colors', 'fits', 'groups', 'seasons'];
      if (tabs.some(key => typeof settings[key] !== 'boolean') || typeof settings.initialTab !== 'string'
        || !tabs.includes(settings.initialTab) || settings[settings.initialTab] !== true) return invalid();
      extras.productSettings = Object.freeze({ ...settings });
    }
  }
  if (Object.hasOwn(routes, 'storeSettings')) {
    if (routes.storeSettings === false) extras.storeSettings = false;
    else {
      const settings = record(routes.storeSettings, ['allowedTabs', 'initialTab', 'allowHallDirectoryRead']);
      const tabs = settings.allowedTabs;
      if (!Array.isArray(tabs) || !tabs.length || tabs.some(tab => tab !== 'stores' && tab !== 'warehouses')
        || new Set(tabs).size !== tabs.length || !tabs.includes(settings.initialTab) || typeof settings.allowHallDirectoryRead !== 'boolean') return invalid();
      extras.storeSettings = Object.freeze({ ...settings, allowedTabs: Object.freeze([...tabs]) });
    }
  }
  return Object.freeze({ kind: row.kind, http: Object.freeze({ origin: http.origin, basePath: '/api' as const }), assets: Object.freeze({ basePath: assets.basePath }),
    session: Object.freeze({ verifyOnMount: true as const }), routes: Object.freeze({ staffSettings: false, paymentSettings: false, ...switches, ...extras }) as unknown as ProductionHostConfiguration['routes'] });
}
export function parseProductionHostAssets(value: unknown): ProductionHostAssets {
  const row = record(value, ['entry', 'styles', 'productDrawerStyles']);
  const styles = record(row.styles, requiredStyles, optionalStyles);
  const filename = (value: unknown, extension: string): string => {
    if (typeof value !== 'string' || !new RegExp(`^(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\\.${extension}$`).test(value)) return invalid();
    return value;
  };
  return Object.freeze({ entry: filename(row.entry, 'js'), productDrawerStyles: filename(row.productDrawerStyles, 'css'),
    styles: Object.freeze(Object.fromEntries(Object.entries(styles).map(([key, value]) => [key, filename(value, 'css')]))) as ProductionHostAssets['styles'] });
}
export function productionAssetUrl(configuration: ProductionHostConfiguration, filename: string): string {
  return new URL(`${configuration.assets.basePath}${filename}`, configuration.http.origin).href;
}
