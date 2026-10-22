/** Public development presentation settings only. Never credentials or authorization policy. */
export interface DevelopmentHostConfiguration {
  readonly kind: 'naijue-erp-development-host';
  readonly http: { readonly origin: string; readonly basePath: string };
  readonly assets: { readonly basePath: string };
  readonly routes: { readonly inventory: boolean; readonly sales: boolean; readonly transfers: boolean;
    readonly products?: boolean; readonly productCategories?: boolean; readonly barcodeSchemes?: boolean;
    readonly productSettings?: false | { readonly groups: boolean; readonly seasons: boolean; readonly colors?: boolean; readonly fits?: boolean; readonly initialTab: 'colors'|'groups'|'fits'|'seasons' };
    readonly storeSettings?: false | { readonly allowedTabs: readonly ('stores'|'warehouses')[]; readonly initialTab: 'stores'|'warehouses'; readonly allowHallDirectoryRead: boolean };
    /** UI composition only; commands still require current server authorization. */
    readonly salesManualCreate?: boolean;
    readonly transferManualCreate?: boolean;
    readonly parties?: false | { readonly readOnly: true };
    readonly productViewer?: boolean;
    readonly productFullPage?: boolean;
  };
  readonly session: { readonly verifyOnMount: boolean };
}
export interface DevelopmentHostAssets {
  readonly entry: string;
  readonly styles: Readonly<Record<'application' | 'inventory' | 'sales' | 'sales-detail' | 'parties' | 'transfers' | 'transfer-detail' | 'transfer-product', string> & Partial<Record<'products'|'product-categories'|'product-settings'|'barcode-schemes'|'store-settings'|'product-full-page', string>>>;
  readonly productDrawerStyles: string;
}
const failure = (): never => { throw new TypeError('Explicit public development-host configuration is required.'); };
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) return failure();
  return value as Record<string, unknown>;
}
function optionalRecord(value: unknown, required: readonly string[], optional: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !required.every(key => Object.hasOwn(value,key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) return failure();
  return value as Record<string, unknown>;
}
function readOnlyRouteSwitches(routes: Record<string, unknown>): Pick<DevelopmentHostConfiguration['routes'],'products'|'productCategories'|'barcodeSchemes'|'productSettings'|'storeSettings'> {
  for (const key of ['products','productCategories','barcodeSchemes']) if (Object.hasOwn(routes,key) && typeof routes[key] !== 'boolean') return failure();
  let productSettings: DevelopmentHostConfiguration['routes']['productSettings'];
  if (Object.hasOwn(routes,'productSettings')) {
    if (routes.productSettings === false) productSettings = false;
    else {
      const tabs = optionalRecord(routes.productSettings,['groups','seasons','initialTab'],['colors','fits']);
      if (typeof tabs.groups !== 'boolean' || typeof tabs.seasons !== 'boolean' || (tabs.initialTab !== 'colors' && tabs.initialTab !== 'groups' && tabs.initialTab !== 'fits' && tabs.initialTab !== 'seasons')
        || ['colors','fits'].some(key => Object.hasOwn(tabs,key) && typeof tabs[key] !== 'boolean')
        || tabs[tabs.initialTab] !== true) return failure();
      productSettings = Object.freeze({groups:tabs.groups,seasons:tabs.seasons,initialTab:tabs.initialTab, ...(Object.hasOwn(tabs,'colors') ? {colors:tabs.colors as boolean} : {}), ...(Object.hasOwn(tabs,'fits') ? {fits:tabs.fits as boolean} : {})});
    }
  }
  let storeSettings: DevelopmentHostConfiguration['routes']['storeSettings'];
  if (Object.hasOwn(routes,'storeSettings')) {
    if (routes.storeSettings === false) storeSettings = false;
    else {
      const settings = record(routes.storeSettings,['allowedTabs','initialTab','allowHallDirectoryRead']);
      const tabs = settings.allowedTabs;
      if (!Array.isArray(tabs) || tabs.length === 0 || tabs.some(tab => tab !== 'stores' && tab !== 'warehouses')
        || new Set(tabs).size !== tabs.length || !tabs.includes(settings.initialTab) || typeof settings.allowHallDirectoryRead !== 'boolean') return failure();
      storeSettings = Object.freeze({allowedTabs:Object.freeze([...tabs]) as readonly ('stores'|'warehouses')[],initialTab:settings.initialTab as 'stores'|'warehouses',allowHallDirectoryRead:settings.allowHallDirectoryRead});
    }
  }
  return { ...(Object.hasOwn(routes,'productCategories') ? {productCategories:routes.productCategories as boolean} : {}), ...(Object.hasOwn(routes,'products') ? {products:routes.products as boolean} : {}), ...(Object.hasOwn(routes,'barcodeSchemes') ? {barcodeSchemes:routes.barcodeSchemes as boolean} : {}),
    ...(productSettings !== undefined ? {productSettings} : {}), ...(storeSettings !== undefined ? {storeSettings} : {}) };
}
export function parseDevelopmentHostConfiguration(value: unknown): DevelopmentHostConfiguration {
  const row = record(value, ['kind', 'http', 'assets', 'routes', 'session']);
  const http = record(row.http, ['origin', 'basePath']);
  const assets = record(row.assets, ['basePath']);
  const routes = optionalRecord(row.routes, ['inventory', 'sales', 'transfers'], ['products','productCategories','productSettings','barcodeSchemes','storeSettings','salesManualCreate','transferManualCreate','parties','productViewer','productFullPage']);
  const readOnlyRoutes = readOnlyRouteSwitches(routes);
  const optIns: Pick<DevelopmentHostConfiguration['routes'],'salesManualCreate'|'transferManualCreate'|'parties'|'productViewer'|'productFullPage'> = {};
  for (const [key, route] of [['salesManualCreate','sales'],['transferManualCreate','transfers'],['productViewer','products'],['productFullPage','products']] as const) {
    if (Object.hasOwn(routes,key)) {
      if (typeof routes[key] !== 'boolean' || routes[key] === true && routes[route] !== true) return failure();
      Object.assign(optIns,{[key]:routes[key]});
    }
  }
  if (Object.hasOwn(routes,'parties')) {
    if (routes.parties === false) Object.assign(optIns,{parties:false});
    else { const parties=record(routes.parties,['readOnly']); if (parties.readOnly !== true) return failure(); Object.assign(optIns,{parties:Object.freeze({readOnly:true as const})}); }
  }
  const session = record(row.session, ['verifyOnMount']);
  let origin: URL;
  try { origin = new URL(http.origin as string); } catch { return failure(); }
  if (row.kind !== 'naijue-erp-development-host' || typeof http.origin !== 'string'
    || origin.protocol !== 'https:' || origin.origin !== http.origin || origin.username || origin.password
    || typeof http.basePath !== 'string' || (http.basePath !== '' && !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*$/.test(http.basePath))
    || typeof assets.basePath !== 'string' || !/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(assets.basePath)
    || typeof routes.inventory !== 'boolean' || typeof routes.sales !== 'boolean' || typeof routes.transfers !== 'boolean'
    || typeof session.verifyOnMount !== 'boolean') return failure();
  if ((optIns.salesManualCreate || optIns.transferManualCreate || optIns.parties || optIns.productViewer || optIns.productFullPage)
    && (http.basePath !== '/api' || assets.basePath !== '/assets/')) return failure();
  return Object.freeze({ kind: row.kind, http: Object.freeze({ origin: http.origin, basePath: http.basePath }),
    assets: Object.freeze({ basePath: assets.basePath }), routes: Object.freeze({ inventory: routes.inventory, sales: routes.sales, transfers: routes.transfers, ...readOnlyRoutes, ...optIns }),
    session: Object.freeze({ verifyOnMount: session.verifyOnMount }) });
}
/** Accept only the builder's finite relative asset surface, not arbitrary URLs or traversals. */
export function parseDevelopmentHostAssets(value: unknown): DevelopmentHostAssets {
  const row = record(value, ['entry', 'styles', 'productDrawerStyles']);
  const styles = optionalRecord(row.styles, ['application', 'inventory', 'sales', 'sales-detail', 'parties', 'transfers', 'transfer-detail', 'transfer-product'], ['products','product-categories','product-settings','barcode-schemes','store-settings','product-full-page']);
  const name = (value: unknown, extension: 'js' | 'css'): string => {
    if (typeof value !== 'string' || !new RegExp(`^(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\\.${extension}$`).test(value)) return failure();
    return value;
  };
  const checked = Object.fromEntries(Object.entries(styles).map(([key, value]) => [key, name(value, 'css')])) as DevelopmentHostAssets['styles'];
  return Object.freeze({ entry: name(row.entry, 'js'), styles: Object.freeze(checked), productDrawerStyles: name(row.productDrawerStyles, 'css') });
}
export function developmentAssetUrl(configuration: DevelopmentHostConfiguration, filename: string): string {
  return new URL(`${configuration.assets.basePath}${filename}`, configuration.http.origin).href;
}
