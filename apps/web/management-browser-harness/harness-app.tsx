import { createApplication, createDemoFrameWorkspaceRenderer } from '../src/application/index.tsx';
import type { ApplicationRoute, RouteStylesheet } from '../src/application/contracts.ts';
import { createSyntheticManagementTransport, type SyntheticManagementCall } from './synthetic-transport.ts';
import { installManagementSyntheticAuthNotice } from './synthetic-auth-notice.ts';

/** Actual Application and real HTTP reader code; only the explicitly injected
 * transport and style packaging differ from production. Never a formal host export. */
export function mountManagementHarness(root: HTMLElement, onCall?: (call: SyntheticManagementCall) => void) {
  const document = root.ownerDocument, transport = createSyntheticManagementTransport(onCall);
  const style = (): RouteStylesheet => ({ async load() { if (!document.querySelector('style[data-management-harness-style]')) throw new Error('Synthetic bundled style is not ready'); }, dispose() {} });
  const app = createApplication({ http: transport.http,
    presentation: { renderWorkspace: createDemoFrameWorkspaceRenderer(), renderRouteState: ({ controller, state }) => <section className="management-harness-state" aria-label="合成应用路由状态"><p>{state.phase === 'home' ? '请选择左侧商品信息、商品分类、商品设置或条码方案。所有数据均为页面内存合成数据，不是正式业务数据。' : `合成应用状态：${state.phase}`}</p>
      {state.phase === 'loading' && <button type="button" onClick={() => controller.cancelRoute()}>取消路由加载</button>}
      {['error','cancelled'].includes(state.phase) && <button type="button" onClick={() => { void controller.navigate(state.route); }}>重试当前只读页面</button>}</section> },
    routes: { products: { stylesheet: style(), product: { stylesheet: style() } },
      productCategories: { stylesheet: style() }, productSettings: { stylesheet: style(), allowedTabs: ['colors','groups','fits','seasons'], initialTab: 'groups' }, barcodeSchemes: { stylesheet: style() } },
  });
  const detachNotice = installManagementSyntheticAuthNotice(root); app.mount(root);
  return Object.freeze({ app, transport,
    async enter(route: ApplicationRoute = 'products'): Promise<boolean> { transport.authorize(); await app.controller.authentication.resolveSession(); return app.controller.navigate(route); },
    async revoke(): Promise<void> { transport.revoke(); await app.controller.authentication.resolveSession(); },
    dispose(): void { app.dispose(); detachNotice(); },
  });
}
