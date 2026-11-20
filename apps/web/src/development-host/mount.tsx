import { UIButton } from '../components/standard-controls.tsx';
import { createApplication, createDemoFrameWorkspaceRenderer, createRouteStylesheet } from '../application/index.tsx';
import type { ApplicationConfiguration } from '../application/contracts.ts';
import { developmentAssetUrl, parseDevelopmentHostAssets, parseDevelopmentHostConfiguration } from './configuration.ts';
import { renderDevelopmentRouteState } from './route-state.tsx';
import { createProductFullPageHttpReader } from '../products/product-page-http-reader.ts';

const mounted = new WeakSet<Element>();
export interface DevelopmentHostEnvironment {
  readonly document: Document;
  readonly location: Pick<Location, 'origin' | 'protocol'>;
  readonly fetch: ApplicationConfiguration['http']['fetch'];
}
/** Real browser adapters only; no server policy, identity or business-data provider is accepted. */
export function mountDevelopmentHost(input: DevelopmentHostEnvironment & { readonly configuration: unknown; readonly assets: unknown }) {
  const configuration = parseDevelopmentHostConfiguration(input.configuration), assets = parseDevelopmentHostAssets(input.assets);
  if (input.location?.protocol !== 'https:' || input.location.origin !== configuration.http.origin
    || input.document.defaultView?.location.origin !== configuration.http.origin || typeof input.fetch !== 'function') {
    throw new TypeError('The development host must run on its explicitly configured HTTPS application origin.');
  }
  const root = input.document.getElementById('naijue-erp-root');
  if (!root || mounted.has(root)) throw new TypeError('One explicit unowned development-host root is required.');
  const crypto = input.document.defaultView?.crypto;
  if ((configuration.routes.salesManualCreate || configuration.routes.transferManualCreate || configuration.routes.parties)
    && typeof crypto?.randomUUID !== 'function') throw new TypeError('Explicit command/party composition requires the secure host UUID provider.');
  const newRequestKey = () => {
    if (typeof crypto?.randomUUID !== 'function') throw new TypeError('Secure request key generation is unavailable.');
    return crypto.randomUUID();
  };
  const stylesheet = (name: keyof typeof assets.styles) => {
    const filename = assets.styles[name];
    if (!filename) throw new TypeError('A configured read capability requires its explicit emitted stylesheet.');
    return createRouteStylesheet({ document: input.document, origin: configuration.http.origin, href: developmentAssetUrl(configuration, filename) });
  };
  const productStylesheet = configuration.routes.products && configuration.routes.productViewer
    ? createRouteStylesheet({ document: input.document, origin: configuration.http.origin, href: developmentAssetUrl(configuration, assets.productDrawerStyles) }) : undefined;
  const frame = createDemoFrameWorkspaceRenderer();
  const app = createApplication({ http: { ...configuration.http, fetch: input.fetch },
    presentation: {
      renderRouteState: renderDevelopmentRouteState,
      renderWorkspace: props => frame({ ...props, routeContent: <>
        {props.state.phase === 'ready' ? <div className="development-host-actions"><UIButton type="button" onClick={() => { void props.controller.navigate(null); }}>关闭当前页</UIButton></div> : null}
        {props.routeContent}
      </> }),
    },
    // These switches control presentation/composition only. The real API still authorizes every request.
    routes: {
      ...(configuration.routes.inventory ? { inventory: { stylesheet: stylesheet('inventory'), actions: {} } } : {}),
      ...(configuration.routes.sales ? { sales: { stylesheet: stylesheet('sales'), detailStylesheet: stylesheet('sales-detail'),
        ...(configuration.routes.salesManualCreate ? {commands:{newRequestKey,manualCreate:true as const}} : {}) } } : {}),
      ...(configuration.routes.transfers ? { transfers: { stylesheet: stylesheet('transfers'), detailStylesheet: stylesheet('transfer-detail'), product: { stylesheet: stylesheet('transfer-product') },
        ...(configuration.routes.transferManualCreate ? {commands:{newRequestKey,manualCreate:true as const}} : {}) } } : {}),
      ...(configuration.routes.parties ? {parties:{stylesheet:stylesheet('parties'),newRequestKey,readOnly:true as const}} : {}),
      ...(configuration.routes.products ? { products: { stylesheet: stylesheet('products'), ...(productStylesheet ? {product:{stylesheet:productStylesheet}} : {}),
        ...(configuration.routes.productFullPage ? { fullPage: { stylesheet: stylesheet('product-full-page'), allowedTabs: ['base','specs','barcodes','prices','images','stock'] as const, initialTab: 'base' as const,
          reader: createProductFullPageHttpReader({ ...configuration.http, fetch: input.fetch }) } } : {}) } } : {}),
      ...(configuration.routes.productCategories ? { productCategories: { stylesheet: stylesheet('product-categories') } } : {}),
      ...(configuration.routes.productSettings ? { productSettings: { stylesheet: stylesheet('product-settings'), allowedTabs: [
        ...(configuration.routes.productSettings.colors ? ['colors' as const] : []), ...(configuration.routes.productSettings.fits ? ['fits' as const] : []),
        ...(configuration.routes.productSettings.groups ? ['groups' as const] : []), ...(configuration.routes.productSettings.seasons ? ['seasons' as const] : []),
      ], initialTab: configuration.routes.productSettings.initialTab } } : {}),
      ...(configuration.routes.barcodeSchemes ? { barcodeSchemes: { stylesheet: stylesheet('barcode-schemes') } } : {}),
      ...(configuration.routes.storeSettings ? { storeSettings: { stylesheet: stylesheet('store-settings'), allowedTabs: [...configuration.routes.storeSettings.allowedTabs],
        initialTab: configuration.routes.storeSettings.initialTab, allowHallDirectoryRead: configuration.routes.storeSettings.allowHallDirectoryRead } } : {}),
    },
  });
  mounted.add(root);
  try { app.mount(root); } catch { app.dispose(); mounted.delete(root); throw new Error('Development host could not mount.'); }
  // This is the only optional bootstrap request, explicitly selected in the public configuration.
  // It verifies the existing server-managed cookie. It never logs in, grants a role or opens a route.
  if (configuration.session.verifyOnMount) void app.controller.authentication.resolveSession();
  let disposed = false;
  return Object.freeze({ controller: app.controller, dispose(): void {
    if (disposed) return;
    disposed = true; app.dispose(); mounted.delete(root);
  } });
}
