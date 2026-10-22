import { DemoNavigationMenu } from './navigation-menu.tsx';
import { StandardBreadcrumb, type BreadcrumbSegment } from '../components/standard-breadcrumb.tsx';
import { useEffect, useState, type ReactNode } from 'react';
import { DocumentNavigationContext, type DocumentNavigationBinding } from './document-navigation.tsx';

/** Frozen frontend/index.html hierarchy, with the explicitly approved separate customer/supplier departure. */
export type DemoNavigationId = 'inventory' | 'transfer' | 'transfer/new' | 'sales' | 'sales/new' | 'products' | 'product-categories' | 'product-settings' | 'barcode-schemes' | 'settings/stores' | 'customers' | 'suppliers' | 'settings/staff' | 'settings/payments' | 'settings/accounts';
export interface DemoNavigationTarget {
  readonly href?: string;
  readonly onActivate?: () => void;
  readonly selected?: boolean;
}
export interface DemoFrameProps {
  readonly children: ReactNode;
  readonly breadcrumb: readonly BreadcrumbSegment[];
  /** Only actual implemented, authorized navigation gets a target. */
  readonly navigation: Readonly<Partial<Record<DemoNavigationId, DemoNavigationTarget>>>;
  readonly topbarActions?: ReactNode;
  /** Synthetic preview notice or host status, outside the source business page. */
  readonly notice?: ReactNode;
  readonly footer?: ReactNode;
}
export function DemoFrame(props: DemoFrameProps) {
  const [documentNavigation, setDocumentNavigation] = useState<DocumentNavigationBinding | null>(null);
  const [navigationBlocked, setNavigationBlocked] = useState(false);
  useEffect(() => { setNavigationBlocked(false); }, [documentNavigation?.kind, documentNavigation?.view]);
  const documentName = documentNavigation?.kind === 'transfer' ? '调拨' : '销货';
  const documentBreadcrumb = documentNavigation && documentNavigation.view !== 'list'
    ? [{ id: 'document-category', label: documentNavigation.kind === 'transfer' ? '库存管理' : '销售管理' }, { id: 'document-view', label: `${documentNavigation.view === 'new' ? '新增' : ''}${documentName}单` }] : props.breadcrumb;
  const navigation: Partial<Record<DemoNavigationId, DemoNavigationTarget>> = { ...props.navigation };
  for (const id of ['sales', 'sales/new', 'transfer', 'transfer/new'] as const) {
    let target = props.navigation[id];
    if (documentNavigation && id === documentNavigation.kind) target = {
      selected: documentNavigation.view === 'list',
      onActivate: () => { setNavigationBlocked(!documentNavigation.showList()); },
    };
    if (documentNavigation && id === `${documentNavigation.kind}/new`) target = documentNavigation.canCreate ? {
      selected: documentNavigation.view === 'new',
      onActivate: () => { setNavigationBlocked(!documentNavigation.openCreate()); },
    } : undefined;
    if (target) navigation[id] = target; else delete navigation[id];
  }
  return <DocumentNavigationContext.Provider value={setDocumentNavigation}><div className={`demo-ui demo-frame${props.navigation['settings/stores']?.selected || props.navigation['product-settings']?.selected || props.navigation['settings/payments']?.selected || props.navigation['settings/staff']?.selected || props.navigation['settings/accounts']?.selected ? ' demo-frame-viewport' : ''}`}>
    <div className="app">
      <aside className="sidebar">
        <div className="brand" aria-label="奈爵服饰"><span className="brand-mark" aria-hidden="true">奈</span><span className="brand-name">奈爵服饰</span></div>
        <div className="proto-tag" aria-hidden="true">页面结构体验 · Demo</div>
        <nav aria-label="业务导航">
          <DemoNavigationMenu navigation={navigation} />
        </nav>
      </aside>
      <div className="main"><header className="topbar"><StandardBreadcrumb segments={documentBreadcrumb} label="当前页面路径" />{props.topbarActions && <div className="demo-topbar-actions">{props.topbarActions}</div>}</header>
        {props.notice}{navigationBlocked && <p className="iw-inline-state" role="alert">当前有未保存输入或尚未确认的操作，请先保存、取消新增或处理原操作后再切换。</p>}
        <main className={`demo-page${props.navigation.inventory?.selected ? ' demo-page-inventory' : ''}`}>{props.children}</main>{props.footer}
      </div>
    </div>
  </div></DocumentNavigationContext.Provider>;
}
