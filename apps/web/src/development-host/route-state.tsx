import type { ApplicationPresentation } from '../application/contracts.ts';

/** Fixed development-only host states, not accepted frozen-Demo visual replacements. */
export const renderDevelopmentRouteState: ApplicationPresentation['renderRouteState'] = ({ controller, state }) => {
  const retry = () => { if (state.route) void controller.navigate(state.route); };
  return <section className="development-host-state" aria-label="开发宿主页面状态">
    {state.phase === 'home' ? <p role="status">请从左侧选择已接入的页面。未接入的功能保持禁用。</p> : null}
    {state.phase === 'loading' ? <><p role="status">正在加载所选页面…</p><button type="button" onClick={() => controller.cancelRoute()}>取消加载</button></> : null}
    {state.phase === 'error' ? <><p role="alert">页面未能加载。请确认所需服务和资源已就绪后重试。</p><button type="button" onClick={retry}>重试页面</button></> : null}
    {state.phase === 'cancelled' ? <><p role="status">已取消加载。</p><button type="button" onClick={retry}>重新加载页面</button></> : null}
    {state.route ? <button type="button" onClick={() => { void controller.navigate(null); }}>关闭当前页</button> : null}
  </section>;
};
