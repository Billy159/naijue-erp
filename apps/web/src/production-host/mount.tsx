import { UIButton } from '../components/standard-controls.tsx';
import { createApplication, createDemoFrameWorkspaceRenderer, createRouteStylesheet } from '../application/index.tsx';
import type { ApplicationConfiguration, ApplicationPresentation } from '../application/contracts.ts';
import { createProductFullPageHttpReader } from '../products/product-page-http-reader.ts';
import { createStaffSettingsHttpReader } from '../staff-settings/http-client.ts';
import { createPaymentSettingsHttpReader } from '../payment-settings/http-client.ts';
import { parseProductionHostAssets, parseProductionHostConfiguration, productionAssetUrl } from './configuration.ts';

export interface ProductionHostEnvironment {
  readonly document: Document;
  readonly location: Pick<Location, 'origin' | 'protocol'>;
  readonly fetch: ApplicationConfiguration['http']['fetch'];
  /** Trusted executable adapters, never serialized HTTP guesses or credentials. */
  readonly settingsViews?: {
    readonly staffSettings?: NonNullable<ApplicationConfiguration['routes']['staffSettings']>['view'];
    readonly paymentSettings?: NonNullable<ApplicationConfiguration['routes']['paymentSettings']>['view'];
  };
}
const mounted = new WeakSet<Element>();
// Display options for the existing three roles; never an authorization grant.
const staffRoles = Object.freeze([
  Object.freeze({ value: 'ADMIN', label: '管理员', requiresHall: false }),
  Object.freeze({ value: 'WAREHOUSE', label: '仓库', requiresHall: false }),
  Object.freeze({ value: 'SALESPERSON', label: '营业员', requiresHall: true }),
]);
const renderRouteState: ApplicationPresentation['renderRouteState'] = ({ controller, state }) => <section className="production-route-state" aria-label="页面状态">
  {state.phase === 'home' && <p role="status">请从左侧选择业务页面。</p>}
  {state.phase === 'loading' && <><p role="status">正在加载…</p><UIButton type="button" onClick={() => controller.cancelRoute()}>取消加载</UIButton></>}
  {state.phase === 'error' && <><p role="alert">页面加载失败，请重试。</p><UIButton type="button" onClick={() => { if (state.route) void controller.navigate(state.route); }}>重试加载</UIButton></>}
  {state.phase === 'cancelled' && <><p role="status">已取消加载。</p><UIButton type="button" onClick={() => { if (state.route) void controller.navigate(state.route); }}>重新加载</UIButton></>}
</section>;

/** One real application owner. Only the configured same-origin HTTP adapters can supply data. */
export function mountProductionHost(input: ProductionHostEnvironment & { readonly configuration: unknown; readonly assets: unknown }) {
  const configuration = parseProductionHostConfiguration(input.configuration), assets = parseProductionHostAssets(input.assets);
  if (input.location.protocol !== 'https:' || input.location.origin !== configuration.http.origin
    || input.document.defaultView?.location.origin !== configuration.http.origin || typeof input.fetch !== 'function') {
    throw new TypeError('The production host requires its configured same-origin HTTPS location.');
  }
  const root = input.document.getElementById('naijue-erp-root');
  if (!root || mounted.has(root)) throw new TypeError('One unowned production application root is required.');
  const http = { ...configuration.http, fetch: input.fetch };
  const staffView = configuration.routes.staffSettings ? input.settingsViews?.staffSettings
    ?? { reader: createStaffSettingsHttpReader(http), roles: staffRoles, canPrepare: false } : undefined;
  const paymentView = configuration.routes.paymentSettings ? input.settingsViews?.paymentSettings
    ?? { reader: createPaymentSettingsHttpReader(http), canPrepare: false } : undefined;
  // The current F3 slice has no session-level dirty/uncertain-write owner. Do
  // not expose editable production forms until that lifecycle is integrated.
  if (staffView?.canPrepare || paymentView?.canPrepare) throw new TypeError('Editable settings require a configured maintenance session owner.');
  const crypto = input.document.defaultView?.crypto;
  if ((configuration.routes.salesManualCreate || configuration.routes.transferManualCreate || configuration.routes.parties || configuration.routes.paymentSettings && !paymentView?.workspace)
    && typeof crypto?.randomUUID !== 'function') throw new TypeError('Secure request key generation is required.');
  const newRequestKey = () => { if (typeof crypto?.randomUUID !== 'function') throw new TypeError('Secure request key generation is unavailable.'); return crypto.randomUUID(); };
  const stylesheet = (name: keyof typeof assets.styles) => {
    const filename = assets.styles[name];
    if (!filename) throw new TypeError('An enabled page requires its emitted stylesheet.');
    return createRouteStylesheet({ document: input.document, origin: configuration.http.origin, href: productionAssetUrl(configuration, filename) });
  };
  const app = createApplication({ http, presentation: { renderRouteState, renderWorkspace: createDemoFrameWorkspaceRenderer() }, routes: {
    ...(configuration.routes.inventory ? { inventory: { stylesheet: stylesheet('inventory'), actions: {}, ...(configuration.routes.inventoryLedger ? { ledger: true as const } : {}) } } : {}),
    ...(configuration.routes.sales ? { sales: { stylesheet: stylesheet('sales'), detailStylesheet: stylesheet('sales-detail'),
      ...(configuration.routes.salesManualCreate ? { commands: { newRequestKey, manualCreate: true as const } } : {}) } } : {}),
    ...(configuration.routes.transfers ? { transfers: { stylesheet: stylesheet('transfers'), detailStylesheet: stylesheet('transfer-detail'), product: { stylesheet: stylesheet('transfer-product') },
      ...(configuration.routes.transferManualCreate ? { commands: { newRequestKey, manualCreate: true as const } } : {}) } } : {}),
    ...(configuration.routes.parties ? { parties: { stylesheet: stylesheet('parties'), newRequestKey, readOnly: true as const } } : {}),
    ...(configuration.routes.products ? { products: { stylesheet: stylesheet('products'), ...(configuration.routes.productViewer ? { product: { stylesheet: createRouteStylesheet({ document: input.document, origin: configuration.http.origin, href: productionAssetUrl(configuration, assets.productDrawerStyles) }) } } : {}),
      ...(configuration.routes.productFullPage ? { fullPage: { stylesheet: stylesheet('product-full-page'), allowedTabs: ['base', 'specs', 'barcodes', 'prices', 'images', 'stock'] as const, initialTab: 'base' as const, reader: createProductFullPageHttpReader({ ...configuration.http, fetch: input.fetch }, ['prices', 'barcodes', 'stock']) } } : {}) } } : {}),
    ...(configuration.routes.productCategories ? { productCategories: { stylesheet: stylesheet('product-categories') } } : {}),
    ...(configuration.routes.barcodeSchemes ? { barcodeSchemes: { stylesheet: stylesheet('barcode-schemes') } } : {}),
    ...(configuration.routes.productSettings ? { productSettings: { stylesheet: stylesheet('product-settings'), allowedTabs: [
      ...(configuration.routes.productSettings.colors ? ['colors' as const] : []), ...(configuration.routes.productSettings.fits ? ['fits' as const] : []),
      ...(configuration.routes.productSettings.groups ? ['groups' as const] : []), ...(configuration.routes.productSettings.seasons ? ['seasons' as const] : []),
    ], initialTab: configuration.routes.productSettings.initialTab } } : {}),
    ...(configuration.routes.storeSettings ? { storeSettings: { stylesheet: stylesheet('store-settings'), allowedTabs: configuration.routes.storeSettings.allowedTabs,
      initialTab: configuration.routes.storeSettings.initialTab, allowHallDirectoryRead: configuration.routes.storeSettings.allowHallDirectoryRead } } : {}),
    ...(staffView ? { staffSettings: { stylesheet: stylesheet('staff-settings'), view: staffView } } : {}),
    ...(paymentView ? { paymentSettings: { stylesheet: stylesheet('payment-settings'), view: paymentView,
      ...(!paymentView.workspace ? { commands: { newRequestKey, writesEnabled: () => false } } : {}) } } : {}),
  } });
  mounted.add(root);
  try { app.mount(root); } catch { app.dispose(); mounted.delete(root); throw new Error('Production application could not mount.'); }
  void app.controller.authentication.resolveSession();
  let disposed = false;
  return Object.freeze({ controller: app.controller, dispose() { if (disposed) return; disposed = true; app.dispose(); mounted.delete(root); } });
}
