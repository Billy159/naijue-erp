import '../demo-presentation/frame.css';
import '../demo-presentation/controls.css';
import { DemoFrame, type DemoNavigationId, type DemoNavigationTarget } from '../demo-presentation/demo-frame.tsx';
import type { BreadcrumbSegment } from '../components/standard-breadcrumb.tsx';
import type { ApplicationPresentation, ApplicationRoute } from './contracts.ts';
import { AuthenticationAccountMenu } from '../authentication/account-menu.tsx';

const destinations: Readonly<Record<ApplicationRoute, DemoNavigationId>> = Object.freeze({
  inventory: 'inventory', sales: 'sales', transfers: 'transfer', customers: 'customers', suppliers: 'suppliers', products: 'products', 'product-categories': 'product-categories', 'product-settings': 'product-settings', 'barcode-schemes': 'barcode-schemes', 'store-settings': 'settings/stores', 'staff-settings': 'settings/staff', 'payment-settings': 'settings/payments',
});
const breadcrumbs: Readonly<Record<ApplicationRoute, readonly BreadcrumbSegment[]>> = Object.freeze({
  inventory: [{ id: 'inventory-management', label: '库存管理' }, { id: 'inventory', label: '库存状况表' }],
  sales: [{ id: 'sales-management', label: '销售管理' }, { id: 'sales', label: '销货单列表' }],
  transfers: [{ id: 'inventory-management', label: '库存管理' }, { id: 'transfers', label: '调拨单列表' }],
  customers: [{ id: 'basic-settings', label: '基础设置' }, { id: 'customers', label: '客户' }],
  suppliers: [{ id: 'basic-settings', label: '基础设置' }, { id: 'suppliers', label: '供应商' }],
  products: [{ id: 'product-management', label: '商品管理' }, { id: 'products', label: '商品信息' }],
  'product-categories': [{ id: 'product-management', label: '商品管理' }, { id: 'product-categories', label: '商品分类' }],
  'product-settings': [{ id: 'product-management', label: '商品管理' }, { id: 'product-settings', label: '商品设置' }],
  'barcode-schemes': [{ id: 'product-management', label: '商品管理' }, { id: 'barcode-schemes', label: '条码方案' }],
  'store-settings': [{ id: 'basic-settings', label: '基础设置' }, { id: 'store-settings', label: '营业厅与仓库' }],
  'staff-settings': [{ id: 'basic-settings', label: '基础设置' }, { id: 'staff-settings', label: '员工与账号' }],
  'payment-settings': [{ id: 'basic-settings', label: '基础设置' }, { id: 'payment-settings', label: '收款配置' }],
});
/** First-party pure workspace composition. No auth, routing effects, reads,
 * role grants, defaults or alternate frame design. The authentication owner
 * supplies the real account menu through its context. */
export function createDemoFrameWorkspaceRenderer(): ApplicationPresentation['renderWorkspace'] {
  return ({ controller, state, routeContent }) => {
    const navigation: Partial<Record<DemoNavigationId, DemoNavigationTarget>> = {};
    for (const route of controller.routes) navigation[destinations[route]] = {
      selected: state.route === route,
      onActivate: () => { void controller.navigate(route); },
    };
    return <DemoFrame navigation={navigation} breadcrumb={state.route ? breadcrumbs[state.route] : []} topbarActions={<AuthenticationAccountMenu />}
      notice={state.notice === 'cannot-leave' ? <p className="iw-inline-state" role="alert">当前页面有未保存输入或尚未确认的操作，请先处理当前页面后再离开。</p> : null}>
      {routeContent}
    </DemoFrame>;
  };
}
