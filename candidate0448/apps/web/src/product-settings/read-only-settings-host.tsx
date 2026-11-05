import { UIButton } from '../components/standard-controls.tsx';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { SizeGroupsPage } from './size-groups/size-groups-page.tsx';
import { SeasonsPage } from './seasons/seasons-page.tsx';
import type { DictionaryBrowserReader, ProductSettingTab } from './size-groups/contracts.ts';
import type { CatalogueEntryPageProps, CatalogueSettingsBrowserReader, CatalogueMaintenanceCapability } from './colors/contracts.ts';
import { ReadScope } from '../loading/read-scope.ts';
import { AsyncLeafRegistry } from '../loading/async-leaf-registry.ts';
import type { ReadOnlyProductSettingTab } from '../application/contracts.ts';

const catalogueLeaves = new AsyncLeafRegistry({
  colors: { load: () => import('./colors/colors-page.tsx') },
  fits: { load: () => import('./fits/fits-page.tsx') },
}, { maxRetainedEntries: 2 });
let attachmentSequence = 0;
/** One source menu with only explicitly available read-only tabs. No tab callback
 * supplies catalogue enumeration, writes or independent category product counts. */
export function ReadOnlyProductSettingsHost(props: { readonly scope: ReadScope; readonly reader: DictionaryBrowserReader;
  readonly catalogueReader?: CatalogueSettingsBrowserReader; readonly allowedTabs: readonly ReadOnlyProductSettingTab[]; readonly initialTab: ReadOnlyProductSettingTab;
  readonly maintenance?: Readonly<Partial<Record<'colors'|'fits',CatalogueMaintenanceCapability>>>;
  readonly onCanLeaveChange?: (guard:(()=>boolean)|null)=>void;
  readonly onAccessFailure: (kind: 'unauthenticated'|'forbidden') => void }) {
  const [tab, setTab] = useState(props.initialTab);
  const leaveGuard=useRef<(()=>boolean)|null>(null),[notice,setNotice]=useState('');
  const receiveGuard=useCallback((guard:(()=>boolean)|null)=>{leaveGuard.current=guard;props.onCanLeaveChange?.(guard);},[props.onCanLeaveChange]);
  const tabFocus = useRef(false);
  const onSettingTab = useCallback((next: ProductSettingTab) => {
    if(leaveGuard.current&&!leaveGuard.current()){setNotice('请先保存或取消当前编辑。');return;}
    setNotice('');
    if (props.scope.active && props.allowedTabs.includes(next)) { tabFocus.current = true; setTab(next); }
  }, [props.scope, props.allowedTabs]);
  const fields = { focusSettingTab: tabFocus.current, scope: props.scope, onAccessFailure: props.onAccessFailure, onSettingTab, allowedSettingTabs: props.allowedTabs };
  if (tab === 'groups') return <SizeGroupsPage key="groups" {...fields} reader={props.reader} />;
  if (tab === 'seasons') return <SeasonsPage key="seasons" {...fields} reader={props.reader} />;
  if (!props.catalogueReader) return <p role="alert">此目录只读能力未配置。</p>;
  const maintenance=props.maintenance?.[tab];
  return <>{notice&&<p role="status">{notice}</p>}<CatalogueSettingLeaf key={tab} {...fields} reader={props.catalogueReader} kind={tab} {...(maintenance&&props.onCanLeaveChange?{maintenance,onCanLeaveChange:receiveGuard}:{})}/></>;
}
/** The colors/fits UI code and facts activate only on an explicit enabled tab.
 * Discarded imports have their own scope and cannot remount an older tab/identity. */
function CatalogueSettingLeaf(props: CatalogueEntryPageProps & { readonly kind: 'colors'|'fits' }) {
  const [attempt, setAttempt] = useState(0);
  const [leaf, setLeaf] = useState<{ readonly parent: ReadScope; readonly scope: ReadScope; readonly kind: 'colors'|'fits'; readonly View: ComponentType<CatalogueEntryPageProps> | null; readonly error: boolean } | null>(null);
  useEffect(() => {
    const scope = new ReadScope(props.scope.identity, `${props.scope.routeInstanceId}:catalogue-tab:${props.kind}:${++attachmentSequence}`, null, () => {});
    let attached = true;
    const abort = () => { scope.dispose(); if (attached) setLeaf(null); };
    props.scope.signal.addEventListener('abort', abort, { once: true });
    if (!props.scope.active) abort();
    const initial = { parent: props.scope, scope, kind: props.kind, View: null, error: false };
    if (scope.active) setLeaf(initial);
    void catalogueLeaves.load(props.kind, scope).then(module => {
      if (attached && scope.active) setLeaf({ ...initial, View: 'ColorsPage' in module ? module.ColorsPage : module.FitsPage });
    }, () => { if (attached && scope.active) setLeaf({ ...initial, error: true }); });
    return () => { attached = false; props.scope.signal.removeEventListener('abort', abort); scope.dispose(); };
  }, [props.scope, props.kind, attempt]);
  const current = leaf?.parent === props.scope && leaf.kind === props.kind && leaf.scope.active ? leaf : null;
  if (!props.scope.active) return <p role="status">旧身份目录资料已清除。</p>;
  if (current?.View) return <current.View {...props} scope={current.scope} />;
  return current?.error ? <p role="alert">目录组件未加载。<UIButton type="button" onClick={() => setAttempt(value => value + 1)}>重试加载</UIButton></p> : <p role="status">正在准备只读目录…</p>;
}
