import { SourceDocumentDialog } from '../components/standard-overlay.tsx';
import { DemoNavigationMenu } from './navigation-menu.tsx';
import { StandardBreadcrumb, type BreadcrumbSegment } from '../components/standard-breadcrumb.tsx';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DocumentNavigationContext, DocumentLeaveContext, type DocumentLeaveBinding, type DocumentNavigationBinding } from './document-navigation.tsx';

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
  /** Existing application route entry only. The mounted native document
   * binding remains the sole create/dirty/capability gate. */
  readonly enterDocumentRoute?: Readonly<Partial<Record<'sales' | 'transfer', () => Promise<boolean>>>>;
}
export function DemoFrame(props: DemoFrameProps) {
  const [documentNavigation, setDocumentNavigation] = useState<DocumentNavigationBinding | null>(null);
  const [navigationBlocked, setNavigationBlocked] = useState(false);
  const [leave, setLeave] = useState<DocumentLeaveBinding | null>(null);
  const [pendingLeave, setPendingLeave] = useState<{ owner: DocumentLeaveBinding; resume: () => void } | null>(null);
  useEffect(() => { if (!leave) setPendingLeave(null); }, [leave]);
  const entrySequence = useRef(0);
  const [pendingEntry, setPendingEntry] = useState<{ kind: 'sales' | 'transfer'; sequence: number } | null>(null);
  useEffect(() => () => { entrySequence.current++; }, []);
  useEffect(() => {
    if (!pendingEntry || pendingEntry.sequence !== entrySequence.current || documentNavigation?.kind !== pendingEntry.kind) return;
    setPendingEntry(null);
    setNavigationBlocked(!documentNavigation.canCreate || !documentNavigation.openCreate());
  }, [pendingEntry, documentNavigation]);
  useEffect(() => { setNavigationBlocked(false); }, [documentNavigation?.kind, documentNavigation?.view]);
  const documentName = documentNavigation?.kind === 'transfer' ? '调拨' : '销货';
  const documentBreadcrumb = documentNavigation && documentNavigation.view !== 'list'
    ? [{ id: 'document-category', label: documentNavigation.kind === 'transfer' ? '库存管理' : '销售管理' }, { id: 'document-view', label: `${documentNavigation.view === 'new' ? '新增' : ''}${documentName}单` }] : props.breadcrumb;
  const navigation: Partial<Record<DemoNavigationId, DemoNavigationTarget>> = { ...props.navigation };
  // Home/another route first enters the existing list. Only after its real
  // binding mounts can the same guarded create action run; no second session.
  for (const kind of ['sales', 'transfer'] as const) {
    const enter = props.enterDocumentRoute?.[kind];
    if (!enter || documentNavigation?.kind === kind) continue;
    navigation[`${kind}/new`] = { onActivate: () => {
      const sequence = ++entrySequence.current; setPendingEntry(null);
      void enter().then(ready => {
        if (sequence !== entrySequence.current) return;
        if (ready) setPendingEntry({ kind, sequence }); else setNavigationBlocked(true);
      }, () => { if (sequence === entrySequence.current) setNavigationBlocked(true); });
    } };
  }
  for (const id of ['sales', 'sales/new', 'transfer', 'transfer/new'] as const) {
    let target = navigation[id];
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
  for (const [id, target] of Object.entries(navigation)) {
    if (!target?.onActivate || id.endsWith('/new')) continue;
    const activate = target.onActivate;
    navigation[id as DemoNavigationId] = { ...target, onActivate: () => { entrySequence.current++; setPendingEntry(null); activate(); } };
  }
  // Retain the actual original route action, not an invented URL/session. The
  // document's own discard gate must succeed before the normal route gate runs.
  for (const [id, target] of Object.entries(navigation)) {
    if (!target?.onActivate || !leave?.dirty || target.selected) continue;
    const resume = target.onActivate;
    navigation[id as DemoNavigationId] = { ...target, onActivate: () => {
      if (!leave.canDiscard) { setNavigationBlocked(true); return; }
      setPendingLeave({ owner: leave, resume });
    } };
  }
  return <DocumentLeaveContext.Provider value={setLeave}><DocumentNavigationContext.Provider value={setDocumentNavigation}><div className={`demo-ui demo-frame${props.navigation['settings/stores']?.selected || props.navigation['product-settings']?.selected || props.navigation['settings/payments']?.selected || props.navigation['settings/staff']?.selected || props.navigation['settings/accounts']?.selected || props.navigation.customers?.selected || props.navigation.suppliers?.selected ? ' demo-frame-viewport' : ''}`}>
    <div className="app">
      <aside className="sidebar">
        <div className="brand" aria-label="奈爵服饰"><span className="brand-mark" aria-hidden="true">奈</span><span className="brand-name">奈爵服饰</span></div>
        <div className="proto-tag" aria-hidden="true">页面结构体验 · Demo</div>
        <nav aria-label="业务导航">
          <DemoNavigationMenu navigation={navigation} />
        </nav>
      </aside>
      <div className="main"><header className="topbar"><StandardBreadcrumb segments={documentBreadcrumb} label="当前页面路径" />{props.topbarActions && <div className="demo-topbar-actions">{props.topbarActions}</div>}</header>
        {props.notice}{navigationBlocked && !props.notice && <p className="iw-inline-state" role="alert">当前有未保存输入或尚未确认的操作，请先保存、取消新增或处理原操作后再切换。</p>}
        <main className={`demo-page${props.navigation.inventory?.selected ? ' demo-page-inventory' : ''}`}>{props.children}</main>{props.footer}
      </div>
    </div>
    {pendingLeave && <SourceDocumentDialog className="source-discard-dialog" title="有未保存的修改" label="有未保存的修改" closeLabel="关闭弹窗" close={() => setPendingLeave(null)} footer={<><button type="button" className="btn" onClick={() => setPendingLeave(null)}>{pendingLeave.owner.saved ? '继续编辑' : '继续录单'}</button><button type="button" className="btn primary" onClick={() => {
      const pending = pendingLeave; setPendingLeave(null);
      if (pending.owner.discard()) { setNavigationBlocked(false); pending.resume(); }
      else setNavigationBlocked(true);
    }}>放弃修改并离开</button></>}><div className="ui-confirm-body"><p>{pendingLeave.owner.saved ? '离开将放弃本次修改，已保存单据保持原样。' : '此新单尚未保存。离开将放弃本次录入，不会产生销货单或库存变动。'}</p></div></SourceDocumentDialog>}
  </div></DocumentNavigationContext.Provider></DocumentLeaveContext.Provider>;
}
