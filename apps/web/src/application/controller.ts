import { AuthenticationController, readContextAuthenticationLifecycle } from '../authentication/model.ts';
import { createAuthHttpClient } from '../authentication/http-client.ts';
import { AsyncLeafRegistry } from '../loading/async-leaf-registry.ts';
import { ReadContext, type ReadScope } from '../loading/read-scope.ts';
import { ownProductFullPageConfiguration } from '../products/product-page-configuration.ts';
import type { ApplicationConfiguration, ApplicationRoute, ApplicationSnapshot, PartySession, SalesSession, TransferSession, PreparedApplicationRoute, RoutePreparation, RouteStylesheet } from './contracts.ts';
import type { preparePaymentSettingsSession } from './routes/payment-settings.tsx';

const home = (): ApplicationSnapshot => Object.freeze({ phase: 'home', route: null, scope: null, prepared: null, notice: null });
function stylesheet(value: RouteStylesheet | undefined): RouteStylesheet {
  if (typeof value?.load !== 'function' || typeof value.dispose !== 'function') throw new TypeError('Each configured route requires an explicit CSS-ready stylesheet provider.');
  return value;
}
/** One authenticated app owner. Construction is inert: no session check, route, stylesheet or business read. */
export class ApplicationController {
  readonly authentication: AuthenticationController;
  readonly #context = new ReadContext();
  readonly #configuration: ApplicationConfiguration;
  readonly #listeners = new Set<() => void>();
  readonly #leaves;
  readonly #configuredRoutes: readonly ApplicationRoute[];
  #state = home();
  #sequence = 0;
  #partySession: PartySession | null = null;
  #salesSession: SalesSession | null = null;
  #transferSession: TransferSession | null = null;
  #paymentSession: ReturnType<typeof preparePaymentSettingsSession> | null = null;
  #disposed = false;
  constructor(configuration: ApplicationConfiguration) {
    if (!configuration?.routes || !configuration.http || typeof configuration.presentation?.renderWorkspace !== 'function' || typeof configuration.presentation.renderRouteState !== 'function') throw new TypeError('Explicit host configuration is required.');
    // Reuse the auth client's strict HTTPS/origin/prefix/fetch validation, without dispatching a request.
    const client = createAuthHttpClient(configuration.http);
    const routes = configuration.routes;
    const inventory = routes.inventory ? Object.freeze({ ...routes.inventory, actions: Object.freeze({ ...routes.inventory.actions }), stylesheet: stylesheet(routes.inventory.stylesheet) }) : undefined;
    if (routes.inventory && (!routes.inventory.actions || (routes.inventory.actions.onOpenCell !== undefined && typeof routes.inventory.actions.onOpenCell !== 'function'))) throw new TypeError('Explicit inventory action capabilities are required.');
    const sales = routes.sales ? Object.freeze({ stylesheet: stylesheet(routes.sales.stylesheet), ...(routes.sales.detailStylesheet !== undefined ? { detailStylesheet: stylesheet(routes.sales.detailStylesheet) } : {}), ...(routes.sales.commands ? { commands: Object.freeze({ ...routes.sales.commands }) } : {}) }) : undefined;
    const transfers = routes.transfers ? Object.freeze({ stylesheet: stylesheet(routes.transfers.stylesheet), detailStylesheet: stylesheet(routes.transfers.detailStylesheet), ...(routes.transfers.product ? { product: Object.freeze({ stylesheet: stylesheet(routes.transfers.product.stylesheet) }) } : {}), ...(routes.transfers.commands ? { commands: Object.freeze({ ...routes.transfers.commands }) } : {}) }) : undefined;
    if (sales?.commands && (typeof sales.commands.newRequestKey !== 'function' || !sales.detailStylesheet)
      || transfers?.commands && typeof transfers.commands.newRequestKey !== 'function') throw new TypeError('Command routes require explicit key providers and document styles.');
    const parties = routes.parties ? Object.freeze({ ...routes.parties, stylesheet: stylesheet(routes.parties.stylesheet) }) : undefined;
    if (parties && typeof parties.newRequestKey !== 'function') throw new TypeError('A party request-key provider is required.');
    if (parties && parties.readOnly !== undefined && parties.readOnly !== true) throw new TypeError('Party read-only mode must be explicitly true or omitted.');
    const fullPage = routes.products ? ownProductFullPageConfiguration(routes.products) : undefined;
    const maintenance = routes.products?.maintenance;
    if (maintenance !== undefined && (!maintenance || !Array.isArray(maintenance.allowedActions) || typeof maintenance.reader?.readDetail !== 'function'
      || typeof maintenance.reader.readCandidates !== 'function' || typeof maintenance.client?.execute !== 'function'
      || typeof maintenance.client.receipt !== 'function' || typeof maintenance.newRequestKey !== 'function'
      || typeof maintenance.onRecoveryRequired !== 'function')) throw new TypeError('Explicit product maintenance dependencies are required.');
    const products = routes.products ? Object.freeze({ stylesheet: stylesheet(routes.products.stylesheet), ...(routes.products.product ? { product: Object.freeze({ stylesheet: stylesheet(routes.products.product.stylesheet) }) } : {}), ...(fullPage ? { fullPage } : {}),
      ...(maintenance ? { maintenance: Object.freeze({ ...maintenance, allowedActions: Object.freeze([...maintenance.allowedActions]) }) } : {}) }) : undefined;
    const productCategories = routes.productCategories ? Object.freeze({ stylesheet: stylesheet(routes.productCategories.stylesheet) }) : undefined;
    const productSettings = routes.productSettings ? Object.freeze({ stylesheet: stylesheet(routes.productSettings.stylesheet), allowedTabs: Object.freeze([...routes.productSettings.allowedTabs]), initialTab: routes.productSettings.initialTab }) : undefined;
    if (productSettings && (!productSettings.allowedTabs.length || productSettings.allowedTabs.some(tab => tab !== 'colors' && tab !== 'groups' && tab !== 'fits' && tab !== 'seasons')
      || new Set(productSettings.allowedTabs).size !== productSettings.allowedTabs.length || !productSettings.allowedTabs.includes(productSettings.initialTab))) throw new TypeError('Product settings require explicit available read-only tabs and a permitted initial tab.');
    const barcodeSchemes = routes.barcodeSchemes ? Object.freeze({ stylesheet: stylesheet(routes.barcodeSchemes.stylesheet) }) : undefined;
    if (routes.storeSettings && (!Array.isArray(routes.storeSettings.allowedTabs) || !routes.storeSettings.allowedTabs.length
      || routes.storeSettings.allowedTabs.some(tab => tab !== 'stores' && tab !== 'warehouses')
      || new Set(routes.storeSettings.allowedTabs).size !== routes.storeSettings.allowedTabs.length
      || !routes.storeSettings.allowedTabs.includes(routes.storeSettings.initialTab)
      || typeof routes.storeSettings.allowHallDirectoryRead !== 'boolean')) throw new TypeError('Store settings require explicit read-only tabs, initial tab and directory-read intent.');
    const storeSettings = routes.storeSettings ? Object.freeze({ stylesheet: stylesheet(routes.storeSettings.stylesheet), allowedTabs: Object.freeze([...routes.storeSettings.allowedTabs]), initialTab: routes.storeSettings.initialTab, allowHallDirectoryRead: routes.storeSettings.allowHallDirectoryRead }) : undefined;
    if (routes.staffSettings && (typeof routes.staffSettings.view?.canPrepare !== 'boolean' || !Array.isArray(routes.staffSettings.view.roles))
      || routes.paymentSettings && typeof routes.paymentSettings.view?.canPrepare !== 'boolean') throw new TypeError('Explicit settings view dependencies are required.');
    const staffSettings = routes.staffSettings ? Object.freeze({ stylesheet: stylesheet(routes.staffSettings.stylesheet), view: Object.freeze({ ...routes.staffSettings.view,
      roles: Object.freeze(routes.staffSettings.view.roles.map(role => Object.freeze({ ...role }))) }) }) : undefined;
    const paymentCommands = routes.paymentSettings?.commands;
    if (paymentCommands && (routes.paymentSettings?.view.workspace || typeof paymentCommands.newRequestKey !== 'function' || typeof paymentCommands.writesEnabled !== 'function')) throw new TypeError('Payment commands require one session owner and explicit key/write gates.');
    const paymentSettings = routes.paymentSettings ? Object.freeze({ stylesheet: stylesheet(routes.paymentSettings.stylesheet), view: Object.freeze({ ...routes.paymentSettings.view }),
      ...(paymentCommands ? { commands: Object.freeze({ ...paymentCommands }) } : {}) }) : undefined;
    this.#configuration = Object.freeze({ http: Object.freeze({ ...configuration.http }), presentation: configuration.presentation, routes: Object.freeze({ ...(inventory ? { inventory } : {}), ...(sales ? { sales } : {}), ...(transfers ? { transfers } : {}), ...(parties ? { parties } : {}), ...(products ? { products } : {}), ...(productCategories ? { productCategories } : {}), ...(productSettings ? { productSettings } : {}), ...(barcodeSchemes ? { barcodeSchemes } : {}), ...(storeSettings ? { storeSettings } : {}), ...(staffSettings ? { staffSettings } : {}), ...(paymentSettings ? { paymentSettings } : {}) }) });
    this.#configuredRoutes = Object.freeze([...(inventory ? ['inventory' as const] : []), ...(sales ? ['sales' as const] : []), ...(transfers ? ['transfers' as const] : []), ...(parties ? ['customers' as const, 'suppliers' as const] : []), ...(products ? ['products' as const] : []), ...(productCategories ? ['product-categories' as const] : []), ...(productSettings ? ['product-settings' as const] : []), ...(barcodeSchemes ? ['barcode-schemes' as const] : []), ...(storeSettings ? ['store-settings' as const] : []), ...(staffSettings ? ['staff-settings' as const] : []), ...(paymentSettings ? ['payment-settings' as const] : [])]);
    const unavailable = (): Promise<never> => Promise.reject(new Error('Route capability is unavailable.'));
    this.#leaves = new AsyncLeafRegistry({
      inventory: { load: () => inventory ? import('./routes/inventory.tsx') : unavailable(), loadStyles: () => inventory ? inventory.stylesheet.load() : unavailable() },
      sales: { load: () => sales ? import('./routes/sales.tsx') : unavailable(), loadStyles: () => sales ? sales.stylesheet.load() : unavailable() },
      transfers: { load: () => transfers ? import('./routes/transfers.tsx') : unavailable(), loadStyles: () => transfers ? transfers.stylesheet.load() : unavailable() },
      products: { load: () => products ? import('./routes/products.tsx') : unavailable(), loadStyles: () => products ? products.stylesheet.load() : unavailable() },
      productCategories: { load: () => productCategories ? import('./routes/product-categories.tsx') : unavailable(), loadStyles: () => productCategories ? productCategories.stylesheet.load() : unavailable() },
      productSettings: { load: () => productSettings ? import('./routes/product-settings.tsx') : unavailable(), loadStyles: () => productSettings ? productSettings.stylesheet.load() : unavailable() },
      barcodeSchemes: { load: () => barcodeSchemes ? import('./routes/barcode-schemes.tsx') : unavailable(), loadStyles: () => barcodeSchemes ? barcodeSchemes.stylesheet.load() : unavailable() },
      storeSettings: { load: () => storeSettings ? import('./routes/store-settings.tsx') : unavailable(), loadStyles: () => storeSettings ? storeSettings.stylesheet.load() : unavailable() },
      staffSettings: { load: () => staffSettings ? import('./routes/staff-settings.tsx') : unavailable(), loadStyles: () => staffSettings ? staffSettings.stylesheet.load() : unavailable() },
      paymentSettings: { load: () => paymentSettings ? import('./routes/payment-settings.tsx') : unavailable(), loadStyles: () => paymentSettings ? paymentSettings.stylesheet.load() : unavailable() },
      parties: { load: () => parties ? import('./routes/parties.tsx') : unavailable(), loadStyles: () => parties ? parties.stylesheet.load() : unavailable() },
    }, { maxRetainedEntries: 1 });
    const replaceIdentity = readContextAuthenticationLifecycle(this.#context);
    this.authentication = new AuthenticationController({ client, onIdentityChange: change => {
      // Required order: abort ALL old route/session scopes before the auth controller publishes a replacement principal.
      replaceIdentity(change);
      this.#partySession?.workspace.dispose(); this.#partySession = null;
      this.#salesSession?.workspace.dispose(); this.#salesSession = null;
      this.#transferSession?.workspace.dispose(); this.#transferSession = null;
      this.#paymentSession?.workspace.dispose(); this.#paymentSession = null;
      this.#configuration.routes.paymentSettings?.view.workspace?.dispose();
      this.#leaves.clear();
      this.#publish(home());
    } });
  }
  /** Maintenance presentation follows only the currently verified server principal. It is not an authorization grant. */
  get routes(): readonly ApplicationRoute[] {
    const role = this.authentication.getSnapshot().principal?.role;
    return this.#configuredRoutes.filter(route => !['customers', 'suppliers'].includes(route) || role === 'ADMIN' || role === 'WAREHOUSE');
  }
  readonly getSnapshot = (): ApplicationSnapshot => this.#state;
  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#disposed) return () => {};
    this.#listeners.add(listener); return () => { this.#listeners.delete(listener); };
  };
  /** Ordinary navigation only. Identity invalidation/disposal never waits on a leaf guard. */
  canLeave(): boolean {
    const sessions = [this.#partySession, this.#salesSession, this.#transferSession];
    try {
      return (!this.#state.scope?.active || !this.#state.prepared?.canLeave || this.#state.prepared.canLeave() === true)
        && !sessions.some(session => session && !session.workspace.canLeave())
        && this.#paymentWorkspace()?.canLeave() !== false
        && this.#transferSession?.canLeave?.() !== false && this.#salesSession?.canLeave?.() !== false;
    } catch { return false; }
  }
  /** No implicit default route. Call on an actual menu action or an explicitly validated host deep link. */
  async navigate(route: ApplicationRoute | null): Promise<boolean> {
    if (this.#disposed || !this.authentication.getSnapshot().principal || this.authentication.busy) return false;
    if (route !== null && !this.routes.includes(route)) return false;
    if (route === this.#state.route && this.#state.phase === 'ready') return true;
    if (route !== this.#state.route && !this.canLeave()) {
      this.#publish({ ...this.#state, notice: 'cannot-leave' }); return false;
    }
    if (route !== this.#state.route) { this.#salesSession?.workspace.suspend(); this.#transferSession?.workspace.suspend(); }
    this.#state.scope?.dispose();
    if (route === null) { this.#publish(home()); return true; }
    const scope = this.#context.createScope(`application-route-${++this.#sequence}`);
    this.#publish({ phase: 'loading', route, scope, prepared: null, notice: null });
    const principal = this.authentication.getSnapshot().principal!;
    const input: RoutePreparation = { scope, principal, configuration: this.#configuration.routes, http: this.#httpForScope(scope, route) };
    try {
      let prepared: PreparedApplicationRoute;
      if (route === 'inventory') prepared = (await this.#leaves.load('inventory', scope)).prepareInventoryRoute(input, error => this.#readAccessFailure(scope, error.kind));
      else if (route === 'sales') {
        const module = await this.#leaves.load('sales', scope);
        if (!this.#current(scope)) return false;
        if (this.#configuration.routes.sales?.commands) {
          if (!this.#salesSession) {
            const workspaceScope = this.#context.createScope(`application-sales-session-${++this.#sequence}`);
            let session: SalesSession;
            try { session = await module.prepareSalesSession({ ...input, scope: workspaceScope, http: this.#httpForScope(workspaceScope) }, () => this.authentication.expire()); }
            catch (error) { workspaceScope.dispose(); throw error; }
            if (!this.#current(scope) || !workspaceScope.active) { session.workspace.dispose(); return false; }
            this.#salesSession = session;
          }
          prepared = this.#salesSession.prepare(input);
        } else prepared = module.prepareSalesRoute(input);
      }
      else if (route === 'transfers') {
        const module = await this.#leaves.load('transfers', scope);
        if (!this.#current(scope)) return false;
        if (this.#configuration.routes.transfers?.commands) {
          if (!this.#transferSession) {
            const workspaceScope = this.#context.createScope(`application-transfer-session-${++this.#sequence}`);
            this.#transferSession = module.prepareTransferSession({ ...input, scope: workspaceScope, http: this.#httpForScope(workspaceScope) }, () => this.authentication.expire());
          }
          prepared = this.#transferSession.prepare(input);
        } else prepared = module.prepareTransferRoute(input);
      }
      else if (route === 'products') {
        const module = await this.#leaves.load('products', scope);
        prepared = module.prepareProductsRoute(input, error => this.#readAccessFailure(scope, error.kind));
      }
      else if (route === 'product-categories') {
        const module = await this.#leaves.load('productCategories', scope);
        prepared = module.prepareProductCategoriesRoute(input, kind => this.#readAccessFailure(scope, kind));
      }
      else if (route === 'product-settings') {
        const module = await this.#leaves.load('productSettings', scope);
        prepared = module.prepareProductSettingsRoute(input, kind => this.#readAccessFailure(scope, kind));
      }
      else if (route === 'barcode-schemes') {
        const module = await this.#leaves.load('barcodeSchemes', scope);
        prepared = module.prepareBarcodeSchemesRoute(input, kind => this.#readAccessFailure(scope, kind));
      }
      else if (route === 'store-settings') {
        const module = await this.#leaves.load('storeSettings', scope);
        prepared = module.prepareStoreSettingsRoute(input, kind => this.#readAccessFailure(scope, kind));
      }
      else if (route === 'staff-settings') {
        const module = await this.#leaves.load('staffSettings', scope);
        prepared = module.prepareStaffSettingsRoute(input, kind => this.#readAccessFailure(scope, kind));
      }
      else if (route === 'payment-settings') {
        const module = await this.#leaves.load('paymentSettings', scope);
        if (!this.#current(scope)) return false;
        if (this.#configuration.routes.paymentSettings?.commands) {
          if (!this.#paymentSession?.workspace.scope.active) {
            const sessionScope = this.#context.createScope(`application-payment-session-${++this.#sequence}`);
            try { this.#paymentSession = module.preparePaymentSettingsSession({ ...input, scope: sessionScope, http: this.#httpForScope(sessionScope) }, kind => {
              if (kind === 'unauthenticated') this.authentication.expire();
              else if (this.#state.route === 'payment-settings' && this.#state.scope) this.#readAccessFailure(this.#state.scope, kind);
            }); } catch (error) { sessionScope.dispose(); throw error; }
          }
          prepared = this.#paymentSession.prepare(input, kind => this.#readAccessFailure(scope, kind));
        } else prepared = module.preparePaymentSettingsRoute(input, kind => this.#readAccessFailure(scope, kind));
      }
      else {
        const module = await this.#leaves.load('parties', scope);
        if (!this.#current(scope)) return false;
        if (!this.#partySession) {
          const workspaceScope = this.#context.createScope(`application-party-session-${++this.#sequence}`);
          this.#partySession = module.preparePartySession({ ...input, scope: workspaceScope, http: this.#httpForScope(workspaceScope) }, () => this.authentication.expire());
        }
        prepared = this.#partySession.prepare(route);
      }
      if (!this.#current(scope)) return false;
      this.#publish({ phase: 'ready', route, scope, prepared: Object.freeze(prepared), notice: null }); return true;
    } catch {
      if (!this.#current(scope)) return false;
      scope.dispose(); this.#publish({ phase: 'error', route, scope: null, prepared: null, notice: null }); return false;
    }
  }
  cancelRoute(): void {
    if (this.#state.phase !== 'loading' || !this.#state.scope) return;
    this.#state.scope.dispose(); this.#publish({ ...this.#state, phase: 'cancelled', scope: null, prepared: null });
  }
  /** Safe render-boundary failure. Never display raw exception/provider messages. */
  failRoute(scope: ReadScope): void {
    if (!this.#current(scope)) return;
    scope.dispose(); this.#publish({ ...this.#state, phase: 'error', scope: null, prepared: null });
  }
  dispose(): void {
    if (this.#disposed) return;
    this.authentication.dispose(); this.#disposed = true;
    this.#context.clear(); this.#partySession?.workspace.dispose(); this.#partySession = null;
    this.#salesSession?.workspace.dispose(); this.#salesSession = null;
    this.#transferSession?.workspace.dispose(); this.#transferSession = null; this.#leaves.clear();
    this.#paymentSession?.workspace.dispose(); this.#paymentSession = null;
    this.#configuration.routes.paymentSettings?.view.workspace?.dispose();
    const sales = this.#configuration.routes.sales, transfer = this.#configuration.routes.transfers, products = this.#configuration.routes.products;
    const styles = [...Object.values(this.#configuration.routes).map(route => route.stylesheet), ...(sales?.detailStylesheet ? [sales.detailStylesheet] : []), ...(transfer ? [transfer.detailStylesheet] : []), ...(transfer?.product ? [transfer.product.stylesheet] : []), ...(products?.product ? [products.product.stylesheet] : []), ...(products?.fullPage ? [products.fullPage.stylesheet] : [])];
    for (const provider of new Set(styles)) {
      try { provider.dispose(); } catch { /* A failed host asset cleanup must not prevent the other owners/DOM from being released. */ }
    }
    this.#publish({ ...home(), phase: 'disposed' }); this.#listeners.clear();
  }
  #readAccessFailure(scope: ReadScope, kind: string): void {
    if (!this.#current(scope)) return;
    if (kind === 'unauthenticated') this.authentication.expire();
    else if (kind === 'forbidden' && !(this.#state.route === 'payment-settings' && this.#paymentWorkspace()?.hasUnresolvedWrite())) this.failRoute(scope);
  }
  #paymentWorkspace() { return this.#paymentSession?.workspace ?? this.#configuration.routes.paymentSettings?.view.workspace; }
  #current(scope: ReadScope): boolean { return !this.#disposed && scope.active && this.#state.scope === scope; }
  #httpForScope(scope: ReadScope, route: ApplicationRoute | null = null): ApplicationConfiguration['http'] {
    const http = this.#configuration.http;
    return Object.freeze({ ...http, fetch: async (url: string, init: RequestInit): Promise<Response> => {
      // Never expire a newer identity because a stale, abort-ignoring route returned a late 401.
      const response = await http.fetch(url, init);
      if (scope.active && !init.signal?.aborted) {
        if (response.status === 401) this.authentication.expire();
        // Read-only transfer/management routes have no unknown-write keys to preserve. A current
        // denial becomes a route-local failure so its same-menu retry can remount.
        // Never generalize this disposal to party or sales command workspaces.
        else if (response.status === 403 && (route === 'transfers' || route === 'products' || route === 'product-categories' || route === 'product-settings' || route === 'barcode-schemes' || route === 'store-settings' || route === 'staff-settings' || route === 'payment-settings')
          && !(route === 'payment-settings' && this.#paymentWorkspace()?.hasUnresolvedWrite()) && this.#state.route === route && this.#state.scope === scope) this.failRoute(scope);
      }
      return response;
    } });
  }
  #publish(state: ApplicationSnapshot): void {
    this.#state = Object.freeze(state);
    for (const listener of [...this.#listeners]) { try { listener(); } catch { /* Cleanup must reach every subscriber. */ } }
  }
}
