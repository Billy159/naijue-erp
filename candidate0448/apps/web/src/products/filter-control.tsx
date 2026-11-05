import { UIButton } from '../components/standard-controls.tsx';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { DemoMultiSelect, type DemoMultiSelectPopupHost } from '../demo-controls/multi-select.tsx';
import type { DemoMultiOption } from '../demo-controls/multi-select-contract.ts';
import type { Selection } from '../inventory/contracts.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { ProductCandidateWindow, type ProductCandidateSnapshot } from './candidate-window.ts';
import type { ProductManagementCandidateKind, ProductManagementReader } from './contracts.ts';

const idle: ProductCandidateSnapshot = Object.freeze({ search: '', phase: 'idle', items: [], exactTotal: null, page: 0, hasMore: false, limitReached: false, completeUniverse: false });
const empty = () => idle, none = () => () => {};
export function ProductFilterControl(props: { readonly scope: ReadScope; readonly reader: ProductManagementReader; readonly kind: ProductManagementCandidateKind; readonly label: string;
  readonly selected: readonly Selection[]; readonly popupHost: DemoMultiSelectPopupHost | null; readonly onChange: (selected: readonly Selection[]) => void;
  readonly sourceHost?: { readonly id: string; readonly className: string; readonly ariaLabel: string } }) {
  const [search, setSearch] = useState(''), [state, setState] = useState<ProductCandidateSnapshot>(idle), [notice, setNotice] = useState('');
  const loadMore = useRef<(() => void) | null>(null), explicit = useRef<Selection | null>(null);
  const owner = useMemo(() => ({ reader: props.reader, kind: props.kind }), [props.reader, props.kind]);
  const current = state.search === search.trim() ? state : idle;
  const options = new Map([...props.selected, ...current.items].map(item => [item.id, item]));
  const option = (item: Selection & { readonly parentId?: string | null; readonly parentLabel?: string }): DemoMultiOption => ({ id: item.id,
    name: item.parentId && !options.has(item.parentId) && item.parentLabel ? `${item.parentLabel} / ${item.label}` : item.label,
    ...(item.parentId === undefined ? {} : { parentId: item.parentId }) });
  return <div id={props.sourceHost?.id} className={props.sourceHost?.className??'iw-field pm-filter-field'} aria-label={props.sourceHost?.ariaLabel}>{!props.sourceHost&&<label>{props.label}</label>}<DemoMultiSelect scope={props.scope} popupHost={props.popupHost} ownerKey={owner}
    label={props.label} allLabel={props.kind === 'category' ? '全部分类' : `全部${props.label}`} {...(props.kind === 'category' ? { hierarchy: 'category-branches' as const } : {})}
    options={current.items.map(option)} selectedOptions={props.selected.map(option)} value={props.selected.map(item => item.id)} completeUniverse={current.completeUniverse}
    onIncompleteSelection={(item, reason) => { explicit.current = options.get(item.id) ?? null; setNotice(reason === 'branch-exclusion' ? '不支持从已选整个分类分支中排除子项。' : '当前候选不是已完整核实的全部范围，不能从全部范围排除单项。'); }}
    onChange={ids => { if (!props.scope.active) return; const selected = ids.map(id => options.get(id));
      if (ids.length > 100 || selected.some(item => !item)) { setNotice('候选已变化或超过100项，请重新选择。'); return; }
      explicit.current = null; setNotice(''); props.onChange(selected.filter((item): item is Selection => !!item)); }}
    search={search} onSearch={value => { setSearch(value); setNotice(''); explicit.current = null; }} menuItemLimit={202}
    onMenuScroll={event => { const el = event.currentTarget; if (el.scrollHeight > el.clientHeight && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) loadMore.current?.(); }}
    onPopupClose={() => { setSearch(''); setState(idle); setNotice(''); explicit.current = null; loadMore.current = null; }}
    renderMenu={(menu, scope) => <ProductCandidateMenu scope={scope} reader={props.reader} kind={props.kind} search={search} selected={props.selected} setState={setState} loadMore={loadMore} menu={menu}
      notice={notice} explicit={explicit.current} chooseExplicit={() => { const item = explicit.current; if (!scope.active || !item) return; props.onChange([item]); explicit.current = null; setNotice(''); }} />} /></div>;
}
function ProductCandidateMenu(props: { readonly scope: ReadScope; readonly reader: ProductManagementReader; readonly kind: ProductManagementCandidateKind; readonly search: string;
  readonly selected: readonly Selection[]; readonly setState: (state: ProductCandidateSnapshot) => void; readonly loadMore: { current: (() => void) | null }; readonly menu: ReactNode;
  readonly notice: string; readonly explicit: Selection|null; readonly chooseExplicit: () => void }) {
  const [owner, setOwner] = useState<{ scope: ReadScope; reader: ProductManagementReader; kind: ProductManagementCandidateKind; query: ProductCandidateWindow } | null>(null);
  useEffect(() => { const query = new ProductCandidateWindow(props.scope, props.reader, props.kind);
    setOwner({ scope: props.scope, reader: props.reader, kind: props.kind, query }); return () => query.dispose(); }, [props.scope, props.reader, props.kind]);
  const query = owner?.scope === props.scope && owner.reader === props.reader && owner.kind === props.kind && props.scope.active ? owner.query : null;
  const snapshot = useSyncExternalStore(query?.subscribe ?? none, query?.getSnapshot ?? empty, query?.getSnapshot ?? empty), search = props.search.trim();
  useEffect(() => { if (!query) return; query.reset(search); const timer = setTimeout(() => { void query.loadNext(); }, search ? 180 : 0);
    return () => { clearTimeout(timer); query.reset(search); }; }, [query, search]);
  useEffect(() => { props.setState(snapshot); }, [snapshot, props.setState]);
  useEffect(() => { const load = () => { if (query?.getSnapshot().phase === 'success') void query.loadNext(); }; props.loadMore.current = load;
    return () => { if (props.loadMore.current === load) props.loadMore.current = null; }; }, [query, props.loadMore]);
  if (!props.scope.active) return null;
  const current = snapshot.search === search ? snapshot : idle;
  return <div className="inventory-reference-menu"><div className="inv-filter-tools">{current.exactTotal === null ? '正在读取候选' : `匹配 ${current.exactTotal} 项`} · {props.selected.length ? `已选 ${props.selected.length} 项` : '已选全部'}</div>
    {props.notice && <p className="iw-filter-notice" role="status">{props.notice}{props.explicit && <UIButton type="button" className="iw-link" onClick={props.chooseExplicit}>仅选择该项</UIButton>}</p>}
    {current.exactTotal !== null && props.menu}
    {(current.phase === 'idle' || current.phase === 'loading') && <p className="iw-inline-state" role="status">正在读取候选…</p>}
    {current.phase === 'error' && <p className="iw-inline-state" role="alert">候选读取失败或范围已变化。<UIButton type="button" className="iw-link" onClick={() => { query?.reset(search); void query?.loadNext(); }}>重试候选</UIButton></p>}
    {current.phase === 'success' && !current.items.length && <p className="iw-inline-state">暂无匹配候选</p>}
    {current.phase === 'success' && current.hasMore && !current.limitReached && <UIButton type="button" className="iw-link pm-load-more" onClick={() => { void query?.loadNext(); }}>继续读取候选</UIButton>}
    {current.limitReached && <p className="iw-inline-state">已达到候选窗口上限，请输入更具体的搜索条件；未读取部分不视为已选范围。</p>}
  </div>;
}
