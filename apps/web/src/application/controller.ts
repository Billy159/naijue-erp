import { AuthenticationController, readContextAuthenticationLifecycle, type IdentityChange } from '../authentication/model.ts';
import { createAuthHttpClient } from '../authentication/http-client.ts';
import { AsyncLeafRegistry } from '../loading/async-leaf-registry.ts';
import { ReadContext, type ReadScope } from '../loading/read-scope.ts';
import { captureProductFullPageConfiguration, ownProductFullPageConfiguration } from '../products/product-page-configuration.ts';
import type { ApplicationConfiguration, ApplicationRoute, ApplicationSnapshot, PartySession, SalesSession, TransferSession, PreparedApplicationRoute, RoutePreparation, RouteStylesheet } from './contracts.ts';
import type { preparePaymentSettingsSession } from './routes/payment-settings.tsx';
import type { prepareStoreSettingsSession } from './routes/store-settings.tsx';
import type { prepareAccountSettingsSession } from './routes/account-settings.tsx';
import type { prepareStaffSettingsSession } from './routes/staff-settings.tsx';
import type { ProductInventoryNavigationRequest } from '../products/contracts.ts';
import type { DocumentProductInventoryNavigation, DocumentProductInventoryRequest } from '../sales/document-presentation.tsx';
import { entityId } from '../../../../packages/domain/src/values.ts';
import type { TransferRouteConfiguration } from './contracts.ts';
import type { CatalogueMaintenanceCapability } from '../product-settings/colors/contracts.ts';

interface ProductInventoryTrip { readonly request: ProductInventoryNavigationRequest; readonly identity: ReadScope['identity'] }
type DocumentRoute = 'sales' | 'transfers';
type RetainedDocument = ApplicationSnapshot & { readonly phase: 'ready'; readonly route: DocumentRoute; readonly scope: ReadScope; readonly prepared: PreparedApplicationRoute };
interface DocumentInventoryTrip {
  readonly origin: RetainedDocument;
  readonly request: DocumentProductInventoryRequest;
  readonly detach: () => void;
}
const sameIdentity = (left: ReadScope['identity'], right: ReadScope['identity']) => left.accountId === right.accountId && left.sessionRevision === right.sessionRevision && left.permissionRevision === right.permissionRevision;

const home = (): ApplicationSnapshot => Object.freeze({ phase: 'home', route: null, scope: null, prepared: null, notice: null });
function stylesheet(value: RouteStylesheet | undefined): RouteStylesheet {
  if (typeof value?.load !== 'function' || typeof value.dispose !== 'function') throw new TypeError('Each configured route requires an explicit CSS-ready stylesheet provider.');
  return value;
}
function catalogueMaintenance(value: CatalogueMaintenanceCapability | undefined, kind: CatalogueMaintenanceCapability['kind']): CatalogueMaintenanceCapability | undefined {
  if (value === undefined) return;
  if (!value || value.kind !== kind || value.client?.kind !== kind || typeof value.client.execute !== 'function' || typeof value.client.receipt !== 'function'
    || !Array.isArray(value.allowedActions) || value.allowedActions.some(action => !['CREATE', 'EDIT', 'DELETE', 'DISABLE', 'RESTORE'].includes(action))
    || new Set(value.allowedActions).size !== value.allowedActions.length || typeof value.newRequestKey !== 'function' || typeof value.onRecoveryRequired !== 'function') throw new TypeError('Explicit matching catalogue maintenance and recovery capabilities are required.');
  return Object.freeze({ ...value, allowedActions: Object.freeze([...value.allowedActions]) });
}
/** Capture route-owned opt-ins independently; never borrow Products access. */
function documentProduct(route: object) {
  const descriptor = Object.getOwnPropertyDescriptor(route, 'productFullPage');
  if (!descriptor) { if ('productFullPage' in route) throw new TypeError('Own product capability required.'); return undefined; }
  if (!Object.hasOwn(descriptor, 'value')) throw new TypeError('Own product capability required.');
  return captureProductFullPageConfiguration(descriptor.value);
}
function transferSizeGroup(route: TransferRouteConfiguration) {
  const descriptor = Object.getOwnPropertyDescriptor(route, 'initialSizeGroup');
  if (!descriptor) { if ('initialSizeGroup' in route) throw new TypeError('Own size group capability required.'); return undefined; }
  if (!Object.hasOwn(descriptor, 'value') || !descriptor.value || typeof descriptor.value !== 'object') throw new TypeError('Own size group capability required.');
  const source = descriptor.value as object, id = Object.getOwnPropertyDescriptor(source, 'id'), reader = Object.getOwnPropertyDescriptor(source, 'reader');
  if (!id || !reader || !Object.hasOwn(id, 'value') || !Object.hasOwn(reader, 'value') || Reflect.ownKeys(source).length !== 2) throw new TypeError('Own size group capability required.');
  entityId('sizeGroup', id.value);
  const method = reader.value && Object.getOwnPropertyDescriptor(reader.value, 'readSizeGroups');
  if (!method || !Object.hasOwn(method, 'value') || typeof method.value !== 'function') throw new TypeError('Native size group reader required.');
  const readSizeGroups = method.value as NonNullable<TransferRouteConfiguration['initialSizeGroup']>['reader']['readSizeGroups'];
  return Object.freeze({ id: id.value as string, reader: Object.freeze({ readSizeGroups: readSizeGroups.bind(reader.value) }) });
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
  #storeSession: ReturnType<typeof prepareStoreSettingsSession> | null = null;
  #staffSession: ReturnType<typeof prepareStaffSettingsSession> | null = null;
  #accountSession: ReturnType<typeof prepareAccountSettingsSession> | null = null;
  #externalPaymentPending = true;
  #externalStaffPending = true;
  #externalAccountPending = true;
  #productTrip: ProductInventoryTrip | null = null;
  #documentTrip: DocumentInventoryTrip | null = null;
  #disposed = false;
  constructor(configuration: ApplicationConfiguration) {
    if (!configuration?.routes || !configuration.http || typeof configuration.presentation?.renderWorkspace !== 'function' || typeof configuration.presentation.renderRouteState !== 'function') throw new TypeError('Explicit host configuration is required.');
    // Reuse the auth client's strict HTTPS/origin/prefix/fetch validation, without dispatching a request.
    const client = createAuthHttpClient(configuration.http);
    const routes = configuration.routes;
    const inventory = routes.inventory ? Object.freeze({ ...routes.inventory, actions: Object.freeze({ ...routes.inventory.actions }), stylesheet: stylesheet(routes.inventory.stylesheet) }) : undefined;
    if (routes.inventory && (!routes.inventory.actions || (routes.inventory.actions.onOpenCell !== undefined && typeof routes.inventory.actions.onOpenCell !== 'function'))) throw new TypeError('Explicit inventory action capabilities are required.');
    const salesProduct = routes.sales ? documentProduct(routes.sales) : undefined, transferProduct = routes.transfers ? documentProduct(routes.transfers) : undefined;
    const sizeGroup = routes.transfers ? transferSizeGroup(routes.transfers) : undefined;
    const sales = routes.sales ? Object.freeze({ stylesheet: stylesheet(routes.sales.stylesheet), ...(salesProduct ? { productFullPage: salesProduct } : {}), ...(routes.sales.detailStylesheet !== undefined ? { detailStylesheet: stylesheet(routes.sales.detailStylesheet) } : {}), ...(routes.sales.commands ? { commands: Object.freeze({ ...routes.sales.commands }) } : {}) }) : undefined;
    const transfers = routes.transfers ? Object.freeze({ stylesheet: stylesheet(routes.transfers.stylesheet), ...(transferProduct ? { productFullPage: transferProduct } : {}), ...(sizeGroup ? { initialSizeGroup: sizeGroup } : {}), detailStylesheet: stylesheet(routes.transfers.detailStylesheet), ...(routes.transfers.product ? { product: Object.freeze({ stylesheet: stylesheet(routes.transfers.product.stylesheet) }) } : {}), ...(routes.transfers.commands ? { commands: Object.freeze({ ...routes.transfers.commands }) } : {}) }) : undefined;
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
    const productColors = catalogueMaintenance(maintenance?.catalogueMaintenance?.colors, 'COLOR');
    const productFits = catalogueMaintenance(maintenance?.catalogueMaintenance?.fits, 'FIT');
    const products = routes.products ? Object.freeze({ stylesheet: stylesheet(routes.products.stylesheet), ...(routes.products.product ? { product: Object.freeze({ stylesheet: stylesheet(routes.products.product.stylesheet) }) } : {}), ...(fullPage ? { fullPage } : {}),
      ...(maintenance ? { maintenance: Object.freeze({ ...maintenance, allowedActions: Object.freeze([...maintenance.allowedActions]),
        ...(maintenance.catalogueMaintenance ? { catalogueMaintenance: Object.freeze({ ...(productColors ? { colors: productColors } : {}), ...(productFits ? { fits: productFits } : {}) }) } : {}) }) } : {}) }) : undefined;
    const categoryMaintenance = catalogueMaintenance(routes.productCategories?.maintenance, 'CATEGORY');
    const colorMaintenance = catalogueMaintenance(routes.productSettings?.maintenance?.colors, 'COLOR');
    const fitMaintenance = catalogueMaintenance(routes.productSettings?.maintenance?.fits, 'FIT');
    const productCategories = routes.productCategories ? Object.freeze({ stylesheet: stylesheet(routes.productCategories.stylesheet), ...(categoryMaintenance ? { maintenance: categoryMaintenance } : {}) }) : undefined;
    const productSettings = routes.productSettings ? Object.freeze({ stylesheet: stylesheet(routes.productSettings.stylesheet), allowedTabs: Object.freeze([...routes.productSettings.allowedTabs]), initialTab: routes.productSettings.initialTab,
      ...(colorMaintenance || fitMaintenance ? { maintenance: Object.freeze({ ...(colorMaintenance ? { colors: colorMaintenance } : {}), ...(fitMaintenance ? { fits: fitMaintenance } : {}) }) } : {}) }) : undefined;
    if (productSettings && (!productSettings.allowedTabs.length || productSettings.allowedTabs.some(tab => tab !== 'colors' && tab !== 'groups' && tab !== 'fits' && tab !== 'seasons')
      || new Set(productSettings.allowedTabs).size !== productSettings.allowedTabs.length || !productSettings.allowedTabs.includes(productSettings.initialTab))) throw new TypeError('Product settings require explicit available read-only tabs and a permitted initial tab.');
    const barcodeSchemes = routes.barcodeSchemes ? Object.freeze({ stylesheet: stylesheet(routes.barcodeSchemes.stylesheet) }) : undefined;
    if (routes.storeSettings && (!Array.isArray(routes.storeSettings.allowedTabs) || !routes.storeSettings.allowedTabs.length
      || routes.storeSettings.allowedTabs.some(tab => tab !== 'stores' && tab !== 'warehouses')
      || new Set(routes.storeSettings.allowedTabs).size !== routes.storeSettings.allowedTabs.length
      || !routes.storeSettings.allowedTabs.includes(routes.storeSettings.initialTab)
      || typeof routes.storeSettings.allowHallDirectoryRead !== 'boolean')) throw new TypeError('Store settings require explicit read-only tabs, initial tab and directory-read intent.');
    const storeCommands = routes.storeSettings?.commands;
    if (storeCommands && (typeof storeCommands.newRequestKey !== 'function' || typeof storeCommands.writesEnabled !== 'function'
      || storeCommands.customers !== undefined && typeof storeCommands.customers?.candidates !== 'function')) throw new TypeError('Store commands require explicit key/write gates and valid optional customer candidates.');
    const storeSettings = routes.storeSettings ? Object.freeze({ stylesheet: stylesheet(routes.storeSettings.stylesheet), allowedTabs: Object.freeze([...routes.storeSettings.allowedTabs]), initialTab: routes.storeSettings.initialTab, allowHallDirectoryRead: routes.storeSettings.allowHallDirectoryRead,
      ...(storeCommands ? { commands: Object.freeze({ ...storeCommands }) } : {}) }) : undefined;
    if (routes.staffSettings && (typeof routes.staffSettings.view?.canPrepare !== 'boolean' || !Array.isArray(routes.staffSettings.view.roles))
      || routes.paymentSettings && typeof routes.paymentSettings.view?.canPrepare !== 'boolean') throw new TypeError('Explicit settings view dependencies are required.');
    const staffCommands = routes.staffSettings?.commands;
    if (staffCommands && (routes.staffSettings?.view.workspace || typeof staffCommands.newRequestKey !== 'function' || typeof staffCommands.writesEnabled !== 'function')) throw new TypeError('Staff commands require one session owner and explicit key/write gates.');
    const staffSettings = routes.staffSettings ? Object.freeze({ stylesheet: stylesheet(routes.staffSettings.stylesheet), view: Object.freeze({ ...routes.staffSettings.view,
      roles: Object.freeze(routes.staffSettings.view.roles.map(role => Object.freeze({ ...role }))) }), ...(staffCommands ? { commands: Object.freeze({ ...staffCommands }) } : {}) }) : undefined;
    const paymentCommands = routes.paymentSettings?.commands;
    if (paymentCommands && (routes.paymentSettings?.view.workspace || typeof paymentCommands.newRequestKey !== 'function' || typeof paymentCommands.writesEnabled !== 'function')) throw new TypeError('Payment commands require one session owner and explicit key/write gates.');
    const paymentSettings = routes.paymentSettings ? Object.freeze({ stylesheet: stylesheet(routes.paymentSettings.stylesheet), view: Object.freeze({ ...routes.paymentSettings.view }),
      ...(paymentCommands ? { commands: Object.freeze({ ...paymentCommands }) } : {}) }) : undefined;
    const accountCommands = routes.accountSettings?.commands;
    if (routes.accountSettings && (typeof routes.accountSettings.view?.canPrepare !== 'boolean' || !Array.isArray(routes.accountSettings.view.roles))
      || routes.accountSettings?.view.canPrepare && !accountCommands && !routes.accountSettings.view.workspace
      || accountCommands && (routes.accountSettings?.view.workspace || typeof accountCommands.newRequestKey !== 'function' || typeof accountCommands.writesEnabled !== 'function')) throw new TypeError('Explicit account view and one optional session key/write gate are required.');
    const accountSettings = routes.accountSettings ? Object.freeze({ stylesheet: stylesheet(routes.accountSettings.stylesheet), view: Object.freeze({ ...routes.accountSettings.view,
      roles: Object.freeze(routes.accountSettings.view.roles.map(role => Object.freeze({ ...role }))) }), ...(accountCommands ? { commands: Object.freeze({ ...accountCommands }) } : {}) }) : undefined;
    this.#configuration = Object.freeze({ http: Object.freeze({ ...configuration.http }), presentation: configuration.presentation, routes: Object.freeze({ ...(inventory ? { inventory } : {}), ...(sales ? { sales } : {}), ...(transfers ? { transfers } : {}), ...(parties ? { parties } : {}), ...(products ? { products } : {}), ...(productCategories ? { productCategories } : {}), ...(productSettings ? { productSettings } : {}), ...(barcodeSchemes ? { barcodeSchemes } : {}), ...(storeSettings ? { storeSettings } : {}), ...(staffSettings ? { staffSettings } : {}), ...(paymentSettings ? { paymentSettings } : {}), ...(accountSettings ? { accountSettings } : {}) }) });
    this.#configuredRoutes = Object.freeze([...(inventory ? ['inventory' as const] : []), ...(sales ? ['sales' as const] : []), ...(transfers ? ['transfers' as const] : []), ...(parties ? ['customers' as const, 'suppliers' as const] : []), ...(products ? ['products' as const] : []), ...(productCategories ? ['product-categories' as const] : []), ...(productSettings ? ['product-settings' as const] : []), ...(barcodeSchemes ? ['barcode-schemes' as const] : []), ...(storeSettings ? ['store-settings' as const] : []), ...(staffSettings ? ['staff-settings' as const] : []), ...(paymentSettings ? ['payment-settings' as const] : []), ...(accountSettings ? ['account-settings' as const] : [])]);
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
      accountSettings: { load: () => accountSettings ? import('./routes/account-settings.tsx') : unavailable(), loadStyles: () => accountSettings ? accountSettings.stylesheet.load() : unavailable() },
      parties: { load: () => parties ? import('./routes/parties.tsx') : unavailable(), loadStyles: () => parties ? parties.stylesheet.load() : unavailable() },
    }, { maxRetainedEntries: 1 });
    const replaceIdentity = readContextAuthenticationLifecycle(this.#context);
    this.authentication = new AuthenticationController({ client, onIdentityChange: change => {
      // Required order: abort ALL old route/session scopes before the auth controller publishes a replacement principal.
      replaceIdentity(change); this.#productTrip = null; this.#releaseDocumentTrip();
      this.#partySession?.workspace.dispose(); this.#partySession = null;
      this.#salesSession?.workspace.dispose(); this.#salesSession = null;
      this.#transferSession?.workspace.dispose(); this.#transferSession = null;
      this.#paymentSession?.workspace.dispose(); this.#paymentSession = null;
      this.#storeSession?.workspace.dispose(); this.#storeSession = null;
      this.#staffSession?.workspace.dispose(); this.#staffSession = null;
      this.#accountSession?.workspace.dispose(); this.#accountSession = null;
      this.#externalPaymentIdentity(change);
      this.#externalStaffIdentity(change);
      this.#externalAccountIdentity(change);
      this.#leaves.clear();
      this.#publish(home());
    } });
    // A failed/anonymous initial verification has no authenticated identity
    // lifecycle event. It still must release the unverified injected owner.
    this.authentication.subscribe(() => {
      if (this.#externalPaymentPending && ['anonymous', 'error', 'cancelled'].includes(this.authentication.getSnapshot().phase)) {
        this.#externalPaymentPending = false;
        this.#configuration.routes.paymentSettings?.view.workspace?.dispose();
      }
      if (this.#externalStaffPending && ['anonymous', 'error', 'cancelled'].includes(this.authentication.getSnapshot().phase)) {
        this.#externalStaffPending = false;
        this.#configuration.routes.staffSettings?.view.workspace?.dispose();
      }
      if (this.#externalAccountPending && ['anonymous', 'error', 'cancelled'].includes(this.authentication.getSnapshot().phase)) {
        this.#externalAccountPending = false;
        this.#configuration.routes.accountSettings?.view.workspace?.dispose();
      }
    });
  }
  /** Maintenance presentation follows only the currently verified server principal. It is not an authorization grant. */
  get routes(): readonly ApplicationRoute[] {
    const role = this.authentication.getSnapshot().principal?.role;
    return this.#configuredRoutes.filter(route => route === 'staff-settings' || route === 'account-settings' ? role === 'ADMIN' : !['customers', 'suppliers'].includes(route) || role === 'ADMIN' || role === 'WAREHOUSE');
  }
  /** Presentation admission from the explicit existing create configuration.
   * The native mounted page still enforces current write/dirty/session gates. */
  canEnterDocumentCreation(route: 'sales' | 'transfers'): boolean {
    const commands = this.#configuration.routes[route]?.commands;
    return this.authentication.getSnapshot().principal !== null && this.routes.includes(route)
      && !!commands && (commands.manualCreate === true || !!commands.preparation);
  }
  readonly getSnapshot = (): ApplicationSnapshot => this.#state;
  /** Only the current bounded document round trip retains a second render owner. */
  get retainedDocument(): ApplicationSnapshot | null { return this.#documentTrip?.origin ?? null; }
  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#disposed) return () => {};
    this.#listeners.add(listener); return () => { this.#listeners.delete(listener); };
  };
  /** Ordinary navigation only. Identity invalidation/disposal never waits on a leaf guard. */
  canLeave(): boolean {
    const sessions = [this.#partySession, this.#salesSession, this.#transferSession];
    try {
      return (!this.#state.scope?.active || !this.#state.prepared?.canLeave || this.#state.prepared.canLeave() === true)
        && (!this.#documentTrip?.origin.prepared.canLeave || this.#documentTrip.origin.prepared.canLeave() === true)
        && !sessions.some(session => session && !session.workspace.canLeave())
        && this.#paymentWorkspace()?.canLeave() !== false
        && this.#storeSession?.workspace.canLeave() !== false
        && this.#staffWorkspace()?.canLeave() !== false
        && this.#accountWorkspace()?.canLeave() !== false
        && this.#transferSession?.canLeave?.() !== false && this.#salesSession?.canLeave?.() !== false;
    } catch { return false; }
  }
  /** No implicit default route. Call on an actual menu action or an explicitly validated host deep link. */
  async navigate(route: ApplicationRoute | null): Promise<boolean> {
    if (this.#documentTrip?.origin.route === route && this.#state.route === 'inventory' && this.#state.scope) return this.#returnFromDocumentInventory(this.#state.scope, this.#documentTrip);
    return this.#navigate(route);
  }
  async #navigate(route: ApplicationRoute | null, trip?: ProductInventoryTrip): Promise<boolean> {
    if (this.#disposed || !this.authentication.getSnapshot().principal || this.authentication.busy) return false;
    if (route !== null && !this.routes.includes(route)) return false;
    if (route === this.#state.route && this.#state.phase === 'ready') return true;
    // An already-dirty injected owner must be able to enter its own recovery
    // page after first authentication. It still blocks every other destination.
    const enterInjectedPayment = route === 'payment-settings' && this.#state.phase === 'home' && !this.#externalPaymentPending
      && !this.#paymentSession && this.#configuration.routes.paymentSettings?.view.workspace?.scope.active === true;
    const enterInjectedStaff = route === 'staff-settings' && this.#state.phase === 'home' && !this.#externalStaffPending
      && !this.#staffSession && this.#configuration.routes.staffSettings?.view.workspace?.scope.active === true;
    const enterInjectedAccount = route === 'account-settings' && this.#state.phase === 'home' && !this.#externalAccountPending
      && !this.#accountSession && this.#configuration.routes.accountSettings?.view.workspace?.scope.active === true;
    if (route !== this.#state.route && !enterInjectedPayment && !enterInjectedStaff && !enterInjectedAccount && !this.canLeave()) {
      const staff = this.#staffWorkspace()?.getSnapshot();
      if (staff && !staff.canLeave()) staff.requestClose();
      const account = this.#accountWorkspace()?.getSnapshot();
      if (account && !account.canLeave()) account.requestClose();
      this.#publish({ ...this.#state, notice: 'cannot-leave' }); return false;
    }
    if (route !== this.#state.route) { this.#salesSession?.workspace.suspend(); this.#transferSession?.workspace.suspend(); }
    this.#releaseDocumentTrip();
    this.#productTrip = trip ?? null;
    this.#state.scope?.dispose();
    if (route === null) { this.#publish(home()); return true; }
    const scope = this.#context.createScope(`application-route-${++this.#sequence}`);
    this.#publish({ phase: 'loading', route, scope, prepared: null, notice: null });
    const principal = this.authentication.getSnapshot().principal!;
    const input: RoutePreparation = { scope, principal, configuration: this.#configuration.routes, http: this.#httpForScope(scope, route) };
    try {
      let prepared: PreparedApplicationRoute;
      if (route === 'inventory') prepared = (await this.#leaves.load('inventory', scope)).prepareInventoryRoute(input, error => this.#readAccessFailure(scope, error.kind), trip ? { initialProduct: trip.request.product, returnToProduct: () => this.#returnFromInventory(scope, trip) } : {});
      else if (route === 'sales') {
        const module = await this.#leaves.load('sales', scope);
        if (!this.#current(scope)) return false;
        if (this.#configuration.routes.sales?.commands) {
          if (!this.#salesSession) {
            const workspaceScope = this.#context.createScope(`application-sales-session-${++this.#sequence}`);
            let session: SalesSession;
            try { session = await module.prepareSalesSession({ ...input, scope: workspaceScope, http: this.#httpForScope(workspaceScope) }, () => this.authentication.expire(), routeScope => this.#documentInventoryNavigation(routeScope, 'sales')); }
            catch (error) { workspaceScope.dispose(); throw error; }
            if (!this.#current(scope) || !workspaceScope.active) { session.workspace.dispose(); return false; }
            this.#salesSession = session;
          }
          prepared = this.#salesSession.prepare(input);
        } else prepared = module.prepareSalesRoute(input, () => this.authentication.expire(), this.#documentInventoryNavigation(scope, 'sales'));
      }
      else if (route === 'transfers') {
        const module = await this.#leaves.load('transfers', scope);
        if (!this.#current(scope)) return false;
        if (this.#configuration.routes.transfers?.commands) {
          if (!this.#transferSession) {
            const workspaceScope = this.#context.createScope(`application-transfer-session-${++this.#sequence}`);
            this.#transferSession = module.prepareTransferSession({ ...input, scope: workspaceScope, http: this.#httpForScope(workspaceScope) }, () => this.authentication.expire(), routeScope => this.#documentInventoryNavigation(routeScope, 'transfers'));
          }
          prepared = this.#transferSession.prepare(input);
        } else prepared = module.prepareTransferRoute(input, () => this.authentication.expire(), this.#documentInventoryNavigation(scope, 'transfers'));
      }
      else if (route === 'products') {
        const module = await this.#leaves.load('products', scope);
        prepared = module.prepareProductsRoute(input, error => this.#readAccessFailure(scope, error.kind), {
          ...(this.#configuration.routes.inventory ? { openInventory: async (request: ProductInventoryNavigationRequest) => {
            if (!this.#current(scope) || this.#state.route !== 'products' || !this.canLeave()) return false;
            let captured: ProductInventoryNavigationRequest; try { captured = module.captureProductInventoryRequest(request); } catch { return false; }
            if (!await this.#navigationReady('inventory', scope)) return false;
            return this.#navigate('inventory', { request: captured, identity: scope.identity });
          } } : {}), ...(trip ? { receiveReturnContext: trip.request.returnContext } : {}),
        });
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
        if (!this.#current(scope)) return false;
        if (this.#configuration.routes.storeSettings?.commands) {
          if (!this.#storeSession?.workspace.scope.active) {
            const sessionScope = this.#context.createScope(`application-store-session-${++this.#sequence}`);
            try { this.#storeSession = module.prepareStoreSettingsSession({ ...input, scope: sessionScope, http: this.#httpForScope(sessionScope) }, kind => {
              if (kind === 'unauthenticated') this.authentication.expire();
              else if (this.#state.route === 'store-settings' && this.#state.scope) this.#readAccessFailure(this.#state.scope, kind);
            }); } catch (error) { sessionScope.dispose(); throw error; }
          }
          prepared = this.#storeSession.prepare(input, kind => this.#readAccessFailure(scope, kind));
        } else prepared = module.prepareStoreSettingsRoute(input, kind => this.#readAccessFailure(scope, kind));
      }
      else if (route === 'staff-settings') {
        const module = await this.#leaves.load('staffSettings', scope);
        if (!this.#current(scope)) return false;
        if (this.#configuration.routes.staffSettings?.commands) {
          if (!this.#staffSession?.workspace.scope.active) {
            const sessionScope = this.#context.createScope(`application-staff-session-${++this.#sequence}`);
            try { this.#staffSession = module.prepareStaffSettingsSession({ ...input, scope: sessionScope, http: this.#httpForScope(sessionScope) }, kind => {
              if (kind === 'unauthenticated') this.authentication.expire();
              else if (this.#state.route === 'staff-settings' && this.#state.scope) this.#readAccessFailure(this.#state.scope, kind);
            }, () => this.#paymentWorkspace()?.hasUnresolvedWrite() === true || this.#storeSession?.workspace.hasUnresolvedWrite() === true || this.#accountWorkspace()?.hasUnresolvedWrite() === true); }
            catch (error) { sessionScope.dispose(); throw error; }
          }
          prepared = this.#staffSession.prepare(input, kind => this.#readAccessFailure(scope, kind));
        } else prepared = module.prepareStaffSettingsRoute(input, kind => this.#readAccessFailure(scope, kind));
      }
      else if (route === 'account-settings') {
        const module = await this.#leaves.load('accountSettings', scope);
        if (!this.#current(scope)) return false;
        if (this.#configuration.routes.accountSettings?.commands) {
          if (!this.#accountSession?.workspace.scope.active) {
            const sessionScope = this.#context.createScope(`application-account-session-${++this.#sequence}`);
            try { this.#accountSession = module.prepareAccountSettingsSession({ ...input, scope: sessionScope, http: this.#httpForScope(sessionScope) }, kind => {
              if (kind === 'unauthenticated') this.authentication.expire();
              else if (this.#state.route === 'account-settings' && this.#state.scope) this.#readAccessFailure(this.#state.scope, kind);
            }, () => this.#paymentWorkspace()?.hasUnresolvedWrite() === true || this.#storeSession?.workspace.hasUnresolvedWrite() === true || this.#staffWorkspace()?.hasUnresolvedWrite() === true); }
            catch (error) { sessionScope.dispose(); throw error; }
          }
          prepared = this.#accountSession.prepare(input, kind => this.#readAccessFailure(scope, kind));
        } else prepared = module.prepareAccountSettingsRoute(input, kind => this.#readAccessFailure(scope, kind));
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
      else if (route === 'customers' || route === 'suppliers') {
        const module = await this.#leaves.load('parties', scope);
        if (!this.#current(scope)) return false;
        if (!this.#partySession) {
          const workspaceScope = this.#context.createScope(`application-party-session-${++this.#sequence}`);
          this.#partySession = module.preparePartySession({ ...input, scope: workspaceScope, http: this.#httpForScope(workspaceScope) }, () => this.authentication.expire());
        }
        prepared = this.#partySession.prepare(route);
      } else throw new TypeError('Route preparation is unavailable.');
      if (!this.#current(scope)) return false;
      this.#publish({ phase: 'ready', route, scope, prepared: Object.freeze(prepared), notice: null });
      if (route === 'products') this.#productTrip = null;
      return true;
    } catch {
      if (!this.#current(scope)) return false;
      scope.dispose(); this.#productTrip = null; this.#publish({ phase: 'error', route, scope: null, prepared: null, notice: null }); return false;
    }
  }
  /** Preload the destination's real leaf/CSS before releasing a clean source.
   * Failed preparation therefore keeps the current product page and context. */
  async #navigationReady(route: 'inventory' | 'products' | DocumentRoute, source: ReadScope): Promise<boolean> {
    if (!this.#current(source) || !this.canLeave() || this.authentication.busy) return false;
    const probe = this.#context.createScope(`product-navigation-${++this.#sequence}`);
    try { await this.#leaves.load(route, probe); return this.#current(source) && this.canLeave() && !this.authentication.busy; }
    catch { return false; } finally { probe.dispose(); }
  }
  async #returnFromInventory(scope: ReadScope, trip: ProductInventoryTrip): Promise<boolean> {
    if (!this.#current(scope) || this.#state.route !== 'inventory' || this.#productTrip !== trip
      || scope.identity.accountId !== trip.identity.accountId || scope.identity.sessionRevision !== trip.identity.sessionRevision || scope.identity.permissionRevision !== trip.identity.permissionRevision) return false;
    if (!await this.#navigationReady('products', scope)) return false;
    return this.#navigate('products', trip);
  }
  #documentInventoryNavigation(source: ReadScope, route: DocumentRoute): DocumentProductInventoryNavigation | undefined {
    if (!this.#configuration.routes.inventory) return;
    return request => this.#openDocumentInventory(source, route, request);
  }
  #validDocumentTarget(source: ReadScope, request: DocumentProductInventoryRequest): boolean {
    try { return source.active && request.targetScope.active && sameIdentity(source.identity, request.targetScope.identity) && request.isCurrent() === true; }
    catch { return false; }
  }
  async #openDocumentInventory(source: ReadScope, route: DocumentRoute, request: DocumentProductInventoryRequest): Promise<boolean> {
    const current = () => this.#current(source) && this.#state.phase === 'ready' && this.#state.route === route && !this.authentication.busy
      && this.routes.includes('inventory') && this.#validDocumentTarget(source, request) && this.canLeave();
    if (!current() || typeof request.restore !== 'function') return false;
    let product: { readonly id: string; readonly label: string };
    try {
      entityId('product', request.product.id);
      if (typeof request.product.label !== 'string' || !request.product.label.trim()) return false;
      product = Object.freeze({ id: request.product.id, label: request.product.label });
    } catch { return false; }
    const destination = this.#context.createScope(`document-inventory-${++this.#sequence}`);
    const cancelPreparation = () => destination.dispose();
    source.signal.addEventListener('abort', cancelPreparation, { once: true }); request.targetScope.signal.addEventListener('abort', cancelPreparation, { once: true });
    try {
      // Prepare the real destination before hiding/releasing any source UI.
      const module = await this.#leaves.load('inventory', destination);
      if (!destination.active || !current() || !this.#state.prepared) { destination.dispose(); return false; }
      const origin: RetainedDocument = { ...this.#state, phase: 'ready', route, scope: source, prepared: this.#state.prepared };
      let trip: DocumentInventoryTrip;
      const prepared = module.prepareInventoryRoute({ scope: destination, principal: this.authentication.getSnapshot().principal!, configuration: this.#configuration.routes, http: this.#httpForScope(destination, 'inventory') }, error => this.#readAccessFailure(destination, error.kind), { initialProduct: product, returnToProduct: () => this.#returnFromDocumentInventory(destination, trip) });
      if (!destination.active || !current()) { destination.dispose(); return false; }
      const invalidate = () => {
        if (this.#documentTrip !== trip) return;
        trip.detach(); this.#documentTrip = null;
        // A replaced/denied product invalidates its callbacks, while its still
        // authenticated document owner can safely become visible again.
        if (source.active && this.#current(destination) && !this.authentication.busy && sameIdentity(source.identity, destination.identity)) {
          destination.dispose(); this.#publish({ ...origin, notice: null });
        } else { source.dispose(); this.#publish({ ...this.#state }); }
      };
      const detach = () => { source.signal.removeEventListener('abort', invalidate); request.targetScope.signal.removeEventListener('abort', invalidate); };
      trip = { origin, request, detach };
      source.signal.addEventListener('abort', invalidate, { once: true }); request.targetScope.signal.addEventListener('abort', invalidate, { once: true });
      this.#documentTrip = trip; this.#productTrip = null;
      this.#publish({ phase: 'ready', route: 'inventory', scope: destination, prepared: Object.freeze(prepared), notice: null });
      return true;
    } catch { destination.dispose(); return false; }
    finally { source.signal.removeEventListener('abort', cancelPreparation); request.targetScope.signal.removeEventListener('abort', cancelPreparation); }
  }
  async #returnFromDocumentInventory(scope: ReadScope, trip: DocumentInventoryTrip): Promise<boolean> {
    if (!this.#canReturnDocument(scope, trip) || !await this.#navigationReady(trip.origin.route, scope) || !this.#canReturnDocument(scope, trip)) return false;
    return this.#restoreDocumentInventory(scope, trip, true);
  }
  #canReturnDocument(scope: ReadScope, trip: DocumentInventoryTrip): boolean {
    return this.#current(scope) && !this.authentication.busy && !!this.authentication.getSnapshot().principal && this.#state.phase === 'ready' && this.#state.route === 'inventory' && this.#documentTrip === trip
      && sameIdentity(scope.identity, trip.origin.scope.identity) && this.#validDocumentTarget(trip.origin.scope, trip.request);
  }
  #restoreDocumentInventory(scope: ReadScope, trip: DocumentInventoryTrip, refresh: boolean): boolean {
    if (!this.#canReturnDocument(scope, trip) || refresh && !this.canLeave()) return false;
    // Detach before the presentation replaces its old product read scope.
    trip.detach();
    let restored = false;
    try { restored = trip.request.restore(refresh) === true; } catch { /* A stale/failed owner cannot report successful navigation. */ }
    if (!restored) { this.#releaseDocumentTrip(); this.#publish({ ...this.#state }); return false; }
    this.#documentTrip = null; scope.dispose(); this.#publish({ ...trip.origin, notice: null }); return true;
  }
  #releaseDocumentTrip(): void {
    const trip = this.#documentTrip; this.#documentTrip = null;
    if (trip) { trip.detach(); trip.origin.scope.dispose(); }
  }
  cancelRoute(): void {
    if (this.#state.phase !== 'loading' || !this.#state.scope) return;
    this.#state.scope.dispose(); this.#productTrip = null; this.#publish({ ...this.#state, phase: 'cancelled', scope: null, prepared: null });
  }
  /** Safe render-boundary failure. Never display raw exception/provider messages. */
  failRoute(scope: ReadScope): void {
    if (this.#documentTrip?.origin.scope === scope) { this.#releaseDocumentTrip(); this.#publish({ ...this.#state }); return; }
    if (!this.#current(scope)) return;
    if (this.#documentTrip && this.#restoreDocumentInventory(scope, this.#documentTrip, false)) return;
    scope.dispose(); this.#productTrip = null; this.#releaseDocumentTrip(); this.#publish({ ...this.#state, phase: 'error', scope: null, prepared: null });
  }
  dispose(): void {
    if (this.#disposed) return;
    this.authentication.dispose(); this.#disposed = true; this.#productTrip = null; this.#releaseDocumentTrip();
    this.#context.clear(); this.#partySession?.workspace.dispose(); this.#partySession = null;
    this.#salesSession?.workspace.dispose(); this.#salesSession = null;
    this.#transferSession?.workspace.dispose(); this.#transferSession = null; this.#leaves.clear();
    this.#paymentSession?.workspace.dispose(); this.#paymentSession = null;
    this.#storeSession?.workspace.dispose(); this.#storeSession = null;
    this.#staffSession?.workspace.dispose(); this.#staffSession = null;
    this.#accountSession?.workspace.dispose(); this.#accountSession = null;
    this.#configuration.routes.paymentSettings?.view.workspace?.dispose();
    this.#configuration.routes.staffSettings?.view.workspace?.dispose();
    this.#configuration.routes.accountSettings?.view.workspace?.dispose();
    const sales = this.#configuration.routes.sales, transfer = this.#configuration.routes.transfers, products = this.#configuration.routes.products;
    const styles = [...Object.values(this.#configuration.routes).map(route => route.stylesheet), ...(sales?.detailStylesheet ? [sales.detailStylesheet] : []), ...(sales?.productFullPage ? [sales.productFullPage.stylesheet] : []), ...(transfer?.productFullPage ? [transfer.productFullPage.stylesheet] : []), ...(transfer ? [transfer.detailStylesheet] : []), ...(transfer?.product ? [transfer.product.stylesheet] : []), ...(products?.product ? [products.product.stylesheet] : []), ...(products?.fullPage ? [products.fullPage.stylesheet] : [])];
    for (const provider of new Set(styles)) {
      try { provider.dispose(); } catch { /* A failed host asset cleanup must not prevent the other owners/DOM from being released. */ }
    }
    this.#publish({ ...home(), phase: 'disposed' }); this.#listeners.clear();
  }
  #readAccessFailure(scope: ReadScope, kind: string): void {
    if (!this.#current(scope)) return;
    if (kind === 'unauthenticated') this.authentication.expire();
    else if (kind === 'forbidden' && !this.#unresolvedSettingsWrite(this.#state.route)) this.failRoute(scope);
  }
  #unresolvedSettingsWrite(route: ApplicationRoute | null): boolean {
    return (route === 'payment-settings' || route === 'store-settings' || route === 'staff-settings' || route === 'account-settings')
      && (this.#paymentWorkspace()?.hasUnresolvedWrite() === true || this.#storeSession?.workspace.hasUnresolvedWrite() === true || this.#staffWorkspace()?.hasUnresolvedWrite() === true || this.#accountWorkspace()?.hasUnresolvedWrite() === true);
  }
  #paymentWorkspace() { return this.#paymentSession?.workspace ?? this.#configuration.routes.paymentSettings?.view.workspace; }
  #accountWorkspace() { return this.#accountSession?.workspace ?? this.#configuration.routes.accountSettings?.view.workspace; }
  #staffWorkspace() { return this.#staffSession?.workspace ?? this.#configuration.routes.staffSettings?.view.workspace; }
  #externalAccountIdentity(change: IdentityChange): void {
    const external = this.#configuration.routes.accountSettings?.view.workspace;
    if (!external) return;
    if (this.#externalAccountPending && (change.reason === 'initial' || change.reason === 'verification' || change.reason === 'login')) return;
    if (this.#externalAccountPending && change.reason === 'identity' && change.principal) {
      this.#externalAccountPending = false;
      const identity = external.scope.identity, principal = change.principal;
      if (principal.role === 'ADMIN' && external.scope.active && identity.accountId === principal.accountId && identity.sessionRevision === change.sessionRevision
        && identity.permissionRevision === JSON.stringify([principal.authVersion, principal.staffId, principal.role, principal.hallId])) return;
    }
    this.#externalAccountPending = false; external.dispose();
  }
  #externalStaffIdentity(change: IdentityChange): void {
    const external = this.#configuration.routes.staffSettings?.view.workspace;
    if (!external) return;
    if (this.#externalStaffPending && (change.reason === 'initial' || change.reason === 'verification' || change.reason === 'login')) return;
    if (this.#externalStaffPending && change.reason === 'identity' && change.principal) {
      this.#externalStaffPending = false;
      const identity = external.scope.identity, principal = change.principal;
      if (principal.role === 'ADMIN' && external.scope.active && identity.accountId === principal.accountId && identity.sessionRevision === change.sessionRevision
        && identity.permissionRevision === JSON.stringify([principal.authVersion, principal.staffId, principal.role, principal.hallId])) return;
    }
    this.#externalStaffPending = false; external.dispose();
  }
  #externalPaymentIdentity(change: IdentityChange): void {
    const external = this.#configuration.routes.paymentSettings?.view.workspace;
    if (!external) return;
    // Preserve a supplied owner only through its first authentication attempt,
    // then bind it to the exact verified account/session/permission identity.
    if (this.#externalPaymentPending && (change.reason === 'initial' || change.reason === 'verification' || change.reason === 'login')) return;
    if (this.#externalPaymentPending && change.reason === 'identity' && change.principal) {
      this.#externalPaymentPending = false;
      const identity = external.scope.identity, principal = change.principal;
      if (external.scope.active && identity.accountId === principal.accountId && identity.sessionRevision === change.sessionRevision
        && identity.permissionRevision === JSON.stringify([principal.authVersion, principal.staffId, principal.role, principal.hallId])) return;
    }
    this.#externalPaymentPending = false; external.dispose();
  }
  #current(scope: ReadScope): boolean { return !this.#disposed && scope.active && this.#state.scope === scope; }
  #httpForScope(scope: ReadScope, route: ApplicationRoute | null = null): ApplicationConfiguration['http'] {
    const http = this.#configuration.http;
    return Object.freeze({ ...http, fetch: async (url: string, init: RequestInit): Promise<Response> => {
      // Never expire a newer identity because a stale, abort-ignoring route returned a late 401.
      const response = await http.fetch(url, init);
      if (scope.active && !init.signal?.aborted) {
        if (response.status === 401) this.authentication.expire();
        // A document-owned inventory read denial returns the retained form;
        // it never discards that owner or converts denial to empty inventory.
        else if (response.status === 403 && route === 'inventory' && this.#documentTrip && this.#current(scope)) this.#restoreDocumentInventory(scope, this.#documentTrip, false);
        // A current management denial is route-local. Session-owned unresolved
        // settings commands must retain their original receipt recovery page.
        else if (response.status === 403 && (route === 'transfers' || route === 'products' || route === 'product-categories' || route === 'product-settings' || route === 'barcode-schemes' || route === 'store-settings' || route === 'staff-settings' || route === 'payment-settings' || route === 'account-settings')
          && !this.#unresolvedSettingsWrite(route) && this.#state.route === route && this.#state.scope === scope) this.failRoute(scope);
      }
      return response;
    } });
  }
  #publish(state: ApplicationSnapshot): void {
    this.#state = Object.freeze(state);
    for (const listener of [...this.#listeners]) { try { listener(); } catch { /* Cleanup must reach every subscriber. */ } }
  }
}
