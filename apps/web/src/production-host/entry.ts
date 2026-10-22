import { mountProductionHost, type ProductionHostEnvironment } from './mount.tsx';

export function startProductionHost(environment: ProductionHostEnvironment) {
  const element = environment.document.getElementById('naijue-erp-production-configuration');
  const text = element?.textContent;
  if (element?.tagName !== 'SCRIPT' || element.getAttribute('type') !== 'application/json' || !text || text.length > 16_384) throw new TypeError('Public production configuration is missing.');
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2
    || !Object.hasOwn(value, 'configuration') || !Object.hasOwn(value, 'assets')) throw new TypeError('Public production configuration is invalid.');
  const payload = value as { configuration: unknown; assets: unknown };
  let owner = mountProductionHost({ ...environment, ...payload }), suspended = false, disposed = false;
  const hide = () => { if (!disposed) { owner.dispose(); suspended = true; } };
  const show = (event: PageTransitionEvent) => {
    if (!disposed && suspended && event.persisted) { owner = mountProductionHost({ ...environment, ...payload }); suspended = false; }
  };
  const view = environment.document.defaultView;
  view?.addEventListener('pagehide', hide); view?.addEventListener('pageshow', show);
  return Object.freeze({ get controller() { return owner.controller; }, dispose() {
    if (disposed) return; disposed = true; view?.removeEventListener('pagehide', hide); view?.removeEventListener('pageshow', show); owner.dispose();
  } });
}
if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  try { startProductionHost({ document, location, fetch: globalThis.fetch.bind(globalThis) }); }
  catch {
    const root = document.getElementById('naijue-erp-root');
    if (root) { root.replaceChildren(); const message = document.createElement('p'); message.setAttribute('role', 'alert'); message.textContent = '系统未能启动，请联系管理员检查访问地址和页面资源。'; root.append(message); }
  }
}
