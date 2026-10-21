import '../demo-presentation/frame.css';
import '../demo-presentation/controls.css';
import { DemoFrame, type DemoNavigationId, type DemoNavigationTarget } from '../demo-presentation/demo-frame.tsx';
import type { ApplicationPresentation, ApplicationRoute } from './contracts.ts';

const destinations: Readonly<Record<ApplicationRoute, DemoNavigationId>> = Object.freeze({
  inventory: 'inventory', sales: 'sales', transfers: 'transfer', customers: 'customers', suppliers: 'suppliers',
});
const breadcrumbs: Readonly<Record<ApplicationRoute, string>> = Object.freeze({
  inventory: '库存管理 / 库存状况表', sales: '销售管理 / 销货单列表', transfers: '库存管理 / 调拨单列表', customers: '基础设置 / 客户', suppliers: '基础设置 / 供应商',
});
/** First-party pure workspace composition. No auth, routing effects, reads,
 * role grants, defaults or alternate frame design. Account controls remain in
 * the existing AuthenticationPanel outside this workspace, not invented here. */
export function createDemoFrameWorkspaceRenderer(): ApplicationPresentation['renderWorkspace'] {
  return ({ controller, state, routeContent }) => {
    const navigation: Partial<Record<DemoNavigationId, DemoNavigationTarget>> = {};
    for (const route of controller.routes) navigation[destinations[route]] = {
      selected: state.route === route,
      onActivate: () => { void controller.navigate(route); },
    };
    return <DemoFrame navigation={navigation} breadcrumb={state.route ? breadcrumbs[state.route] : ''}
      notice={state.notice === 'cannot-leave' ? <p className="iw-inline-state" role="alert">当前页面有未保存输入或尚未确认的操作，请先处理当前页面后再离开。</p> : null}>
      {routeContent}
    </DemoFrame>;
  };
}
