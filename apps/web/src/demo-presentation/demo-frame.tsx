import type { ReactNode } from 'react';

/** Frozen frontend/index.html hierarchy, with the explicitly approved separate customer/supplier departure. */
export type DemoNavigationId = 'inventory' | 'transfer' | 'transfer/new' | 'sales' | 'sales/new' | 'products' | 'product-categories' | 'product-settings' | 'barcode-schemes' | 'settings/stores' | 'customers' | 'suppliers' | 'settings/staff' | 'settings/payments';
export interface DemoNavigationTarget {
  readonly href?: string;
  readonly onActivate?: () => void;
  readonly selected?: boolean;
}
export interface DemoFrameProps {
  readonly children: ReactNode;
  readonly breadcrumb: ReactNode;
  /** Only actual implemented, authorized navigation gets a target. */
  readonly navigation: Readonly<Partial<Record<DemoNavigationId, DemoNavigationTarget>>>;
  readonly topbarActions?: ReactNode;
  /** Synthetic preview notice or host status, outside the source business page. */
  readonly notice?: ReactNode;
  readonly footer?: ReactNode;
}
export function DemoFrame(props: DemoFrameProps) {
  const item = (id: DemoNavigationId, label: string) => {
    const target = props.navigation[id];
    const className = `nav child${target?.selected ? ' selected' : ''}`;
    if (!target || !target.href && !target.onActivate) return <button key={id} type="button" className={className} disabled title="此功能尚未接入">{label}</button>;
    return <a key={id} className={className} href={target.href ?? '#'} aria-current={target.selected ? 'page' : undefined} onClick={event => { if (target.onActivate) { event.preventDefault(); target.onActivate(); } }}>{label}</a>;
  };
  return <div className="demo-ui demo-frame">
    <div className="app">
      <aside className="sidebar">
        <div className="brand" aria-label="奈爵服饰"><span className="brand-mark" aria-hidden="true">奈</span><span className="brand-name">奈爵服饰</span></div>
        <div className="proto-tag" aria-hidden="true">页面结构体验 · Demo</div>
        <nav aria-label="业务导航">
          <div className="nav parent">库存管理</div>{item('inventory', '库存状况表')}
          <details className="tc-nav-group" open><summary className="nav child">调拨单</summary><div className="tc-nav-children">{item('transfer', '调拨单列表')}{item('transfer/new', '新增调拨单')}</div></details>
          <div className="nav parent">销售管理</div><details className="tc-nav-group sale-nav-group" open><summary className="nav child">销货单</summary><div className="tc-nav-children">{item('sales', '销货单列表')}{item('sales/new', '新增销货单')}</div></details>
          <div className="nav parent">商品管理</div>{item('products', '商品信息')}{item('product-categories', '商品分类')}{item('product-settings', '商品设置')}{item('barcode-schemes', '条码方案')}
          <div className="nav parent">基础设置</div>{item('settings/stores', '营业厅与仓库')}{item('customers', '客户')}{item('suppliers', '供应商')}{item('settings/staff', '员工与账号')}{item('settings/payments', '收款配置')}
        </nav>
      </aside>
      <div className="main"><header className="topbar"><span className="breadcrumb">{props.breadcrumb}</span>{props.topbarActions && <div className="demo-topbar-actions">{props.topbarActions}</div>}</header>
        {props.notice}
        <main className="demo-page">{props.children}</main>{props.footer}
      </div>
    </div>
  </div>;
}
