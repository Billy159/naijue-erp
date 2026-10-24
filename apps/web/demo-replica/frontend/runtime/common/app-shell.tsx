import type { ReactNode } from 'react';
import { AccountMenuView, type ReplicaAccountEmployee } from './account-menu.tsx';
import { ReplicaBrand } from './brand.tsx';

function routeLink(label: string, route: string) {
  return <a className="nav child" href={`#${route}`} data-route={route}>{label}</a>;
}

/** Original Demo shell markup; page and authentication behavior are injected by the host. */
export function ReplicaAppShell({ breadcrumb, page, employee, onChangePassword, onLogout, login }: {
  readonly breadcrumb: string;
  readonly page: ReactNode;
  readonly employee?: ReplicaAccountEmployee | null;
  readonly onChangePassword: () => void;
  readonly onLogout: () => void;
  readonly login?: ReactNode;
}) {
  return <>
    <div className="app">
      <aside className="sidebar">
        <ReplicaBrand />
        <div className="proto-tag">页面结构体验 · Demo</div>
        <nav aria-label="业务导航">
          <div className="nav parent">库存管理</div>
          {routeLink('库存状况表', 'inventory')}
          <details className="tc-nav-group" open>
            <summary className="nav child">调拨单</summary>
            <div className="tc-nav-children">{routeLink('调拨单列表', 'transfer')}{routeLink('新增调拨单', 'transfer/new')}</div>
          </details>
          <div className="nav parent">销售管理</div>
          <details className="tc-nav-group sale-nav-group" open>
            <summary className="nav child">销货单</summary>
            <div className="tc-nav-children">{routeLink('销货单列表', 'sales')}{routeLink('新增销货单', 'sales/new')}</div>
          </details>
          <div className="nav parent">商品管理</div>
          {routeLink('商品信息', 'products')}
          {routeLink('商品分类', 'product-categories')}
          {routeLink('商品设置', 'product-settings')}
          {routeLink('条码方案', 'barcode-schemes')}
          <div className="nav parent">基础设置</div>
          {routeLink('营业厅与仓库', 'settings/stores')}
          {routeLink('往来单位', 'settings/parties')}
          {routeLink('员工与账号', 'settings/staff')}
          {routeLink('收款配置', 'settings/payments')}
        </nav>
        <div className="sidebar-note">商品为演示数据<br />历史尺码为原始样本<br />未接入真实业务<br />数据保存在本机浏览器</div>
      </aside>
      <div className="main">
        <header className="topbar"><span id="breadcrumb">{breadcrumb}</span><div className="basic-account">{employee ? <AccountMenuView employee={employee} onChangePassword={onChangePassword} onLogout={onLogout} /> : null}</div></header>
        {page}
      </div>
    </div>
    {login}
  </>;
}
