import { AuthenticationController, readContextAuthenticationLifecycle } from '../authentication/model.ts';
import { createAuthHttpClient } from '../authentication/http-client.ts';
import { AsyncLeafRegistry } from '../loading/async-leaf-registry.ts';
import { ReadContext, type ReadScope } from '../loading/read-scope.ts';
import type { ApplicationConfiguration, ApplicationRoute, ApplicationSnapshot, PartySession, PreparedApplicationRoute, RoutePreparation, RouteStylesheet } from './contracts.ts';

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
  #disposed = false;
  constructor(configuration: ApplicationConfiguration) {
    if (!configuration?.routes || !configuration.http || typeof configuration.presentation?.renderWorkspace !== 'function' || typeof configuration.presentation.renderRouteState !== 'function') throw new TypeError('Explicit host configuration is required.');
    // Reuse the auth client's strict HTTPS/origin/prefix/fetch validation, without dispatching a request.
    const client = createAuthHttpClient(configuration.http);
    const routes = configuration.routes;
    const inventory = routes.inventory ? Object.freeze({ ...routes.inventory, actions: Object.freeze({ ...routes.inventory.actions }), stylesheet: stylesheet(routes.inventory.stylesheet) }) : undefined;
    if (routes.inventory && (!routes.inventory.actions || (routes.inventory.actions.onOpenCell !== undefined && typeof routes.inventory.actions.onOpenCell !== 'function'))) throw new TypeError('Explicit inventory action capabilities are required.');
    const sales = routes.sales ? Object.freeze({ ...routes.sales, stylesheet: stylesheet(routes.sales.stylesheet) }) : undefined;
    const parties = routes.parties ? Object.freeze({ ...routes.parties, stylesheet: stylesheet(routes.parties.stylesheet) }) : undefined;
    if (parties && typeof parties.newRequestKey !== 'function') throw new TypeError('A party request-key provider is required.');
    this.#configuration = Object.freeze({ http: Object.freeze({ ...configuration.http }), presentation: configuration.presentation, routes: Object.freeze({ ...(inventory ? { inventory } : {}), ...(sales ? { sales } : {}), ...(parties ? { parties } : {}) }) });
    this.#configuredRoutes = Object.freeze([...(inventory ? ['inventory' as const] : []), ...(sales ? ['sales' as const] : []), ...(parties ? ['customers' as const, 'suppliers' as const] : [])]);
    const unavailable = (): Promise<never> => Promise.reject(new Error('Route capability is unavailable.'));
    this.#leaves = new AsyncLeafRegistry({
      inventory: { load: () => inventory ? import('./routes/inventory.tsx') : unavailable(), loadStyles: () => inventory ? inventory.stylesheet.load() : unavailable() },
      sales: { load: () => sales ? import('./routes/sales.tsx') : unavailable(), loadStyles: () => sales ? sales.stylesheet.load() : unavailable() },
      parties: { load: () => parties ? import('./routes/parties.tsx') : unavailable(), loadStyles: () => parties ? parties.stylesheet.load() : unavailable() },
    }, { maxRetainedEntries: 1 });
    const replaceIdentity = readContextAuthenticationLifecycle(this.#context);
    this.authentication = new AuthenticationController({ client, onIdentityChange: change => {
      // Required order: abort ALL old route/session scopes before the auth controller publishes a replacement principal.
      replaceIdentity(change);
      this.#partySession?.workspace.dispose(); this.#partySession = null;
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
  /** No implicit default route. Call on an actual menu action or an explicitly validated host deep link. */
  async navigate(route: ApplicationRoute | null): Promise<boolean> {
    if (this.#disposed || !this.authentication.getSnapshot().principal || this.authentication.busy) return false;
    if (route !== null && !this.routes.includes(route)) return false;
    if (route === this.#state.route && this.#state.phase === 'ready') return true;
    if (this.#partySession && route !== this.#state.route && !this.#partySession.workspace.canLeave()) {
      this.#publish({ ...this.#state, notice: 'cannot-leave' }); return false;
    }
    this.#state.scope?.dispose();
    if (route === null) { this.#publish(home()); return true; }
    const scope = this.#context.createScope(`application-route-${++this.#sequence}`);
    this.#publish({ phase: 'loading', route, scope, prepared: null, notice: null });
    const principal = this.authentication.getSnapshot().principal!;
    const input: RoutePreparation = { scope, principal, configuration: this.#configuration.routes, http: this.#httpForScope(scope) };
    try {
      let prepared: PreparedApplicationRoute;
      if (route === 'inventory') prepared = (await this.#leaves.load('inventory', scope)).prepareInventoryRoute(input);
      else if (route === 'sales') prepared = (await this.#leaves.load('sales', scope)).prepareSalesRoute(input);
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
    this.#context.clear(); this.#partySession?.workspace.dispose(); this.#partySession = null; this.#leaves.clear();
    for (const provider of new Set(Object.values(this.#configuration.routes).map(route => route.stylesheet))) {
      try { provider.dispose(); } catch { /* A failed host asset cleanup must not prevent the other owners/DOM from being released. */ }
    }
    this.#publish({ ...home(), phase: 'disposed' }); this.#listeners.clear();
  }
  #current(scope: ReadScope): boolean { return !this.#disposed && scope.active && this.#state.scope === scope; }
  #httpForScope(scope: ReadScope): ApplicationConfiguration['http'] {
    const http = this.#configuration.http;
    return Object.freeze({ ...http, fetch: async (url: string, init: RequestInit): Promise<Response> => {
      // Never expire a newer identity because a stale, abort-ignoring route returned a late 401.
      const response = await http.fetch(url, init);
      if (scope.active && response.status === 401) this.authentication.expire();
      return response;
    } });
  }
  #publish(state: ApplicationSnapshot): void {
    this.#state = Object.freeze(state);
    for (const listener of [...this.#listeners]) { try { listener(); } catch { /* Cleanup must reach every subscriber. */ } }
  }
}
