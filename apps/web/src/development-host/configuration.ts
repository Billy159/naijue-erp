/** Public development presentation settings only. Never credentials or authorization policy. */
export interface DevelopmentHostConfiguration {
  readonly kind: 'naijue-erp-development-host';
  readonly http: { readonly origin: string; readonly basePath: string };
  readonly assets: { readonly basePath: string };
  readonly routes: { readonly inventory: boolean; readonly sales: boolean; readonly transfers: boolean };
  readonly session: { readonly verifyOnMount: boolean };
}
export interface DevelopmentHostAssets {
  readonly entry: string;
  readonly styles: Readonly<Record<'application' | 'inventory' | 'sales' | 'sales-detail' | 'parties' | 'transfers' | 'transfer-detail' | 'transfer-product', string>>;
  readonly productDrawerStyles: string;
}
const failure = (): never => { throw new TypeError('Explicit public development-host configuration is required.'); };
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) return failure();
  return value as Record<string, unknown>;
}
export function parseDevelopmentHostConfiguration(value: unknown): DevelopmentHostConfiguration {
  const row = record(value, ['kind', 'http', 'assets', 'routes', 'session']);
  const http = record(row.http, ['origin', 'basePath']);
  const assets = record(row.assets, ['basePath']);
  const routes = record(row.routes, ['inventory', 'sales', 'transfers']);
  const session = record(row.session, ['verifyOnMount']);
  let origin: URL;
  try { origin = new URL(http.origin as string); } catch { return failure(); }
  if (row.kind !== 'naijue-erp-development-host' || typeof http.origin !== 'string'
    || origin.protocol !== 'https:' || origin.origin !== http.origin || origin.username || origin.password
    || typeof http.basePath !== 'string' || (http.basePath !== '' && !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*$/.test(http.basePath))
    || typeof assets.basePath !== 'string' || !/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(assets.basePath)
    || typeof routes.inventory !== 'boolean' || typeof routes.sales !== 'boolean' || typeof routes.transfers !== 'boolean'
    || typeof session.verifyOnMount !== 'boolean') return failure();
  return Object.freeze({ kind: row.kind, http: Object.freeze({ origin: http.origin, basePath: http.basePath }),
    assets: Object.freeze({ basePath: assets.basePath }), routes: Object.freeze({ inventory: routes.inventory, sales: routes.sales, transfers: routes.transfers }),
    session: Object.freeze({ verifyOnMount: session.verifyOnMount }) });
}
/** Accept only the builder's finite relative asset surface, not arbitrary URLs or traversals. */
export function parseDevelopmentHostAssets(value: unknown): DevelopmentHostAssets {
  const row = record(value, ['entry', 'styles', 'productDrawerStyles']);
  const styles = record(row.styles, ['application', 'inventory', 'sales', 'sales-detail', 'parties', 'transfers', 'transfer-detail', 'transfer-product']);
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
