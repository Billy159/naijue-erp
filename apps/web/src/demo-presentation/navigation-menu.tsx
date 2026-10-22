import { Menu } from '@arco-design/web-react';
import { useState, type KeyboardEvent } from 'react';
import type { DemoNavigationId, DemoNavigationTarget } from './demo-frame.tsx';

interface Props { readonly navigation: Readonly<Partial<Record<DemoNavigationId, DemoNavigationTarget>>>; }

/** Presentation only: selection comes from executed route/document state. */
export function DemoNavigationMenu({ navigation }: Props) {
  const [openKeys, setOpenKeys] = useState<string[]>(['transfer-documents', 'sales-documents']);
  const selectedKeys = Object.entries(navigation).filter(([, target]) => target?.selected).map(([id]) => id);
  const item = (id: DemoNavigationId, label: string) => {
    const target = navigation[id];
    const enabled = !!(target?.href || target?.onActivate);
    return <Menu.Item key={id} wrapper={enabled ? 'a' : 'div'}
      {...(enabled ? { href: target?.href ?? '#' } : {})}
      data-nav-id={id} data-nav-handler={target?.onActivate ? 'true' : 'false'}
      className={'nav child' + (target?.selected ? ' selected' : '')}
      disabled={!enabled} aria-disabled={!enabled}
      aria-current={target?.selected ? 'page' : undefined}
      title={enabled ? undefined : '此功能尚未接入'}
      onClick={event => { if (target?.onActivate) { event.preventDefault(); target.onActivate(); } }}>
      {label}
    </Menu.Item>;
  };
  // Arco2.66 inline Menu implements Enter. Shared extra keys move focus without
  // synthesizing activation or treating a requested route as already selected.
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[role="menuitem"],[aria-expanded][tabindex]');
    if (!target || !event.currentTarget.contains(target)) return;
    if (event.key === 'Enter') {
      // Arco invokes Item.onClick for Enter; avoid an additional native anchor
      // click for callback targets. href-only links retain browser navigation.
      if (target.dataset.navHandler === 'true') event.preventDefault();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
    const owner = target.closest<HTMLElement>('[data-nav-group]');
    const group = owner?.dataset.navGroup;
    const header = owner?.querySelector<HTMLElement>('[aria-expanded][tabindex]');
    const isHeader = target.hasAttribute('aria-expanded');
    const change = (open: boolean) => {
      if (group) setOpenKeys(current => open ? [...new Set([...current, group])] : current.filter(key => key !== group));
    };
    if (event.key === 'ArrowRight') { if (!isHeader) return; change(true); }
    else if (event.key === 'ArrowLeft' || event.key === 'Escape') {
      if (!group) return;
      change(false); header?.focus();
    } else {
      const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"],[aria-expanded][tabindex]')).filter(node => {
        if (node.getAttribute('aria-disabled') === 'true') return false;
        const group = node.closest<HTMLElement>('[data-nav-group]')?.dataset.navGroup;
        return node.hasAttribute('aria-expanded') || !group || openKeys.includes(group);
      });
      const index = nodes.indexOf(target);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? nodes.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + nodes.length) % nodes.length;
      nodes[next]?.focus();
    }
    event.preventDefault(); event.stopPropagation();
  };
  return <Menu className="demo-navigation-menu" aria-label="业务菜单" mode="vertical" levelIndent={14}
    selectedKeys={selectedKeys} openKeys={openKeys} autoScrollIntoView={false}
    onClickSubMenu={(_key, keys) => setOpenKeys(keys)} onKeyDownCapture={keyboard}>
    <Menu.ItemGroup key="inventory-group" title="库存管理">
      {item('inventory', '库存状况表')}
      <Menu.SubMenu key="transfer-documents" data-nav-group="transfer-documents" title="调拨单">
        {item('transfer', '调拨单列表')}{item('transfer/new', '新增调拨单')}
      </Menu.SubMenu>
    </Menu.ItemGroup>
    <Menu.ItemGroup key="sales-group" title="销售管理">
      <Menu.SubMenu key="sales-documents" data-nav-group="sales-documents" title="销货单">
        {item('sales', '销货单列表')}{item('sales/new', '新增销货单')}
      </Menu.SubMenu>
    </Menu.ItemGroup>
    <Menu.ItemGroup key="products-group" title="商品管理">
      {item('products', '商品信息')}{item('product-categories', '商品分类')}{item('product-settings', '商品设置')}{item('barcode-schemes', '条码方案')}
    </Menu.ItemGroup>
    <Menu.ItemGroup key="settings-group" title="基础设置">
      {item('settings/stores', '营业厅与仓库')}{item('customers', '客户')}{item('suppliers', '供应商')}{item('settings/staff', '员工与账号')}{item('settings/payments', '收款配置')}
    </Menu.ItemGroup>
  </Menu>;
}

