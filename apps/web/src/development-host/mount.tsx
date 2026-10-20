import { createApplication, createDemoFrameWorkspaceRenderer, createRouteStylesheet } from '../application/index.tsx';
import type { ApplicationConfiguration } from '../application/contracts.ts';
import { developmentAssetUrl, parseDevelopmentHostAssets, parseDevelopmentHostConfiguration } from './configuration.ts';
import { renderDevelopmentRouteState } from './route-state.tsx';

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
  const stylesheet = (name: keyof typeof assets.styles) => createRouteStylesheet({ document: input.document,
    origin: configuration.http.origin, href: developmentAssetUrl(configuration, assets.styles[name]) });
  const frame = createDemoFrameWorkspaceRenderer();
  const app = createApplication({ http: { ...configuration.http, fetch: input.fetch },
    presentation: {
      renderRouteState: renderDevelopmentRouteState,
      renderWorkspace: props => frame({ ...props, routeContent: <>
        {props.state.phase === 'ready' ? <div className="development-host-actions"><button type="button" onClick={() => { void props.controller.navigate(null); }}>关闭当前页</button></div> : null}
        {props.routeContent}
      </> }),
    },
    // These switches control presentation/composition only. The real API still authorizes every request.
    routes: {
      ...(configuration.routes.inventory ? { inventory: { stylesheet: stylesheet('inventory'), actions: {} } } : {}),
      ...(configuration.routes.sales ? { sales: { stylesheet: stylesheet('sales'), detailStylesheet: stylesheet('sales-detail') } } : {}),
      ...(configuration.routes.transfers ? { transfers: { stylesheet: stylesheet('transfers'), detailStylesheet: stylesheet('transfer-detail'), product: { stylesheet: stylesheet('transfer-product') } } } : {}),
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
