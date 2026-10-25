import { entityId } from '../../../../packages/domain/src/values.ts';
/** Public presentation switches only. The server remains the authorization owner. */
export interface ProductionHostConfiguration {
  readonly kind: 'naijue-erp-production-host';
  readonly http: { readonly origin: string; readonly basePath: '/api' | '/__naijue_candidate/replica-private-01/api' };
  readonly assets: { readonly basePath: string };
  readonly session: { readonly verifyOnMount: true };
  readonly routes: {
    readonly inventory: boolean; readonly sales: boolean; readonly transfers: boolean; readonly inventoryLedger?: boolean;
    readonly staffSettings?: boolean; readonly paymentSettings?: boolean; readonly accountSettings?: boolean;
    readonly salesManualCreate?: boolean; readonly transferManualCreate?: boolean;
    readonly salesExistingEdit?: boolean; readonly transferExistingEdit?: boolean;
    /** Presentation only; requires the independently reviewed B07 server provider. */
    readonly historyRevision?: Readonly<{ readonly sales?: boolean; readonly transfers?: boolean }>;
    readonly products?: boolean; readonly productCategories?: boolean; readonly barcodeSchemes?: boolean;
    readonly productViewer?: boolean; readonly productFullPage?: boolean; readonly salesProductFullPage?: boolean; readonly transferProductFullPage?: boolean; readonly transferInitialSizeGroupId?: string;
    /** Existing stock overview provider must be explicitly enabled by this host. */
    readonly productStockOverview?: boolean;
    /** Presentation opt-in only after this release is paired with the v16 backend. */
    readonly documentResponsibleReady?: boolean;
    readonly parties?: false | { readonly readOnly: boolean };
    /** Explicit UI composition only; omitted flags stay false. Server authorizes every operation. */
    readonly maintenance?: { readonly products?: boolean; readonly storeSettings?: boolean; readonly staffSettings?: boolean; readonly paymentSettings?: boolean; readonly accountSettings?: boolean;
      readonly categories?: boolean; readonly colors?: boolean; readonly fits?: boolean;
      /** Set only after the exact v15 backend profile/order capability is paired. */
      readonly categoryOrderReady?: boolean };
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
    || origin.origin !== http.origin || origin.username || origin.password
    || (http.basePath !== '/api' && http.basePath !== '/__naijue_candidate/replica-private-01/api') || session.verifyOnMount !== true
    || typeof assets.basePath !== 'string' || !/^\/assets\/(?:[A-Za-z0-9_-]+\/)*$/.test(assets.basePath)) return invalid();
  const booleanKeys = ['inventory', 'sales', 'transfers', 'inventoryLedger', 'salesManualCreate', 'transferManualCreate', 'salesExistingEdit', 'transferExistingEdit', 'products', 'productCategories', 'barcodeSchemes', 'productViewer', 'productFullPage', 'salesProductFullPage', 'transferProductFullPage', 'staffSettings', 'paymentSettings', 'accountSettings', 'productStockOverview', 'documentResponsibleReady'] as const;
  const routes = record(row.routes, ['inventory', 'sales', 'transfers'], [...booleanKeys.slice(3), 'parties', 'productSettings', 'storeSettings', 'transferInitialSizeGroupId', 'maintenance', 'historyRevision']);
  for (const key of booleanKeys) if (Object.hasOwn(routes, key) && typeof routes[key] !== 'boolean') return invalid();
  for (const [child, parent] of [['inventoryLedger', 'inventory'], ['salesManualCreate', 'sales'], ['transferManualCreate', 'transfers'], ['salesExistingEdit', 'sales'], ['transferExistingEdit', 'transfers'], ['productViewer', 'products'], ['productFullPage', 'products'], ['salesProductFullPage', 'sales'], ['transferProductFullPage', 'transfers']] as const) {
    if (routes[child] === true && routes[parent] !== true) return invalid();
  }
  if (routes.productStockOverview === true && !['productFullPage', 'salesProductFullPage', 'transferProductFullPage'].some(key => routes[key] === true)) return invalid();
  const switches = Object.fromEntries(booleanKeys.filter(key => Object.hasOwn(routes, key)).map(key => [key, routes[key]]));
  if (routes.documentResponsibleReady === true && !routes.salesManualCreate && !routes.salesExistingEdit && !routes.transferManualCreate && !routes.transferExistingEdit) return invalid();
  const extras: Record<string, unknown> = {};
  if (Object.hasOwn(routes, 'historyRevision')) {
    const history = record(routes.historyRevision, [], ['sales', 'transfers']);
    for (const key of ['sales', 'transfers']) if (Object.hasOwn(history, key) && (typeof history[key] !== 'boolean' || history[key] === true && routes[key] !== true)) return invalid();
    extras.historyRevision = Object.freeze({ ...history });
  }
  if (Object.hasOwn(routes, 'transferInitialSizeGroupId')) {
    if (routes.transfers !== true || typeof routes.transferInitialSizeGroupId !== 'string') return invalid();
    try { entityId('sizeGroup', routes.transferInitialSizeGroupId); } catch { return invalid(); }
    extras.transferInitialSizeGroupId = routes.transferInitialSizeGroupId;
  }
  if (Object.hasOwn(routes, 'parties')) {
    if (routes.parties === false) extras.parties = false;
    else { const readOnly = record(routes.parties, ['readOnly']).readOnly; if (typeof readOnly !== 'boolean') return invalid(); extras.parties = Object.freeze({ readOnly }); }
  }
  if (Object.hasOwn(routes, 'maintenance')) {
    const names = ['products', 'storeSettings', 'staffSettings', 'paymentSettings', 'accountSettings'] as const;
    const maintenance = record(routes.maintenance, [], [...names, 'categories', 'colors', 'fits', 'categoryOrderReady']);
    for (const name of names) if (Object.hasOwn(maintenance, name) && (typeof maintenance[name] !== 'boolean' || maintenance[name] === true && !routes[name])) return invalid();
    for (const name of ['categories', 'colors', 'fits', 'categoryOrderReady']) if (Object.hasOwn(maintenance, name) && typeof maintenance[name] !== 'boolean') return invalid();
    if (maintenance.categories === true && routes.productCategories !== true
      || maintenance.categoryOrderReady === true && maintenance.categories !== true) return invalid();
    if (maintenance.colors === true || maintenance.fits === true) {
      const settings = record(routes.productSettings, ['colors', 'fits', 'groups', 'seasons', 'initialTab']);
      if (maintenance.colors === true && settings.colors !== true || maintenance.fits === true && settings.fits !== true) return invalid();
    }
    extras.maintenance = Object.freeze({ ...maintenance });
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
  return Object.freeze({ kind: row.kind, http: Object.freeze({ origin: http.origin, basePath: http.basePath }), assets: Object.freeze({ basePath: assets.basePath }),
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
