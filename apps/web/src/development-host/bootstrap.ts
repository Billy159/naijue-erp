import { mountDevelopmentHost, type DevelopmentHostEnvironment } from './mount.tsx';

/** Inert until explicitly called by this host's emitted external module script. */
export function startDevelopmentHost(environment: DevelopmentHostEnvironment) {
  const element = environment.document.getElementById('naijue-erp-development-configuration');
  const text = element?.textContent;
  if (element?.tagName !== 'SCRIPT' || element.getAttribute('type') !== 'application/json' || !text || text.length > 16_384) {
    throw new TypeError('The explicit public development-host payload is missing.');
  }
  let value: unknown;
  try { value = JSON.parse(text) as unknown; } catch { throw new TypeError('The public development-host payload is invalid.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2
    || !Object.hasOwn(value, 'configuration') || !Object.hasOwn(value, 'assets')) throw new TypeError('The public development-host payload is invalid.');
  const payload = value as { configuration: unknown; assets: unknown };
  let owner = mountDevelopmentHost({ ...environment, ...payload });
  let disposed = false, suspended = false;
  const view = environment.document.defaultView;
  // Invalidate old identity/scopes before a bfcache snapshot; restore an unverified
  // owner, not cached credentials or an old business page, when that snapshot returns.
  const hide = () => { if (!disposed) { owner.dispose(); suspended = true; } };
  const show = (event: PageTransitionEvent) => {
    if (!disposed && suspended && event.persisted) { owner = mountDevelopmentHost({ ...environment, ...payload }); suspended = false; }
  };
  view?.addEventListener('pagehide', hide); view?.addEventListener('pageshow', show);
  return Object.freeze({ get controller() { return owner.controller; }, dispose(): void {
    if (disposed) return;
    disposed = true; view?.removeEventListener('pagehide', hide); view?.removeEventListener('pageshow', show); owner.dispose();
  } });
}
