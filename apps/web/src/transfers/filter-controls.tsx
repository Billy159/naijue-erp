import { DatePicker, TreeSelect } from '@arco-design/web-react';
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject, type UIEvent } from 'react';
import type { ReadScope } from '../loading/read-scope.ts';
import type { TransferFilterDraft, TransferWarehouse, TransferWarehouseReader } from './contracts.ts';
import { transferStatusLabels } from './model.ts';
import { useTransferOwnedScope } from './owned-scope.ts';
import { transferCount } from './format.ts';
import { WarehouseCandidates, WAREHOUSE_CANDIDATE_LIMIT, type WarehouseCandidateSnapshot } from './warehouse-candidates.ts';
import './filter-controls.css';

const ALL = '__transfer_all__';
// The native reader already applies authorized name/hall-name matching. Mark
// remote search mode so Arco does not retain a stale local hitKeys subset while
// asynchronously replaced candidates arrive. This callback performs no read.
const remoteSearch = () => undefined;
export function TransferDate(props: { readonly label: string; readonly value: string; readonly onChange: (value: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  return <div className="transfer-date-control" ref={host}><DatePicker value={props.value} format="YYYY-MM-DD" placeholder={props.label} aria-label={props.label} allowClear getPopupContainer={() => host.current ?? document.body} onChange={value => props.onChange(value || '')} /></div>;
}
export function TransferStatusSelect(props: { readonly value: TransferFilterDraft['statuses']; readonly onChange: (value: TransferFilterDraft['statuses']) => void }) {
  const terms = { DRAFT: ['weishenhe', 'wsh'], APPROVED: ['yishenhe', 'ysh'], VOID: ['yizuofei', 'yzf'] };
  return <MultiSelect label="状态" allLabel="全部状态" options={Object.entries(transferStatusLabels).map(([id, name]) => ({ id, name, searchTerms: terms[id as keyof typeof terms] }))} value={props.value} completeUniverse
    onChange={ids => props.onChange(ids as TransferFilterDraft['statuses'])} />;
}
interface MultiOption { readonly id: string; readonly name: string; readonly searchTerms?: readonly string[] }
function matchesOption(option: MultiOption, text: string): boolean {
  const search = text.trim().toLocaleLowerCase();
  return [option.id, option.name, ...option.searchTerms ?? []].some(term => term.toLocaleLowerCase().includes(search));
}
function MultiSelect(props: { readonly label: string; readonly allLabel: string; readonly options: readonly MultiOption[]; readonly value: readonly string[];
  readonly selectedOptions?: readonly MultiOption[]; readonly completeUniverse?: boolean; readonly onIncompleteSelection?: () => void;
  readonly onChange: (ids: readonly string[]) => void; readonly open?: boolean; readonly onOpen?: (open: boolean) => void;
  readonly search?: string; readonly onSearch?: (search: string) => void; readonly onMenuScroll?: (event: UIEvent<HTMLElement>) => void;
  readonly renderMenu?: (menu: ReactNode) => ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const names = new Map([[ALL, props.allLabel], ...[...props.selectedOptions ?? [], ...props.options].map(item => [item.id, item.name] as const)]);
  const [width, setWidth] = useState(0); const [localSearch, setLocalSearch] = useState(''); const [localOpen, setLocalOpen] = useState(false);
  const popupOpen = props.open ?? localOpen; const [, refreshPortal] = useReducer((value: number) => value + 1, 0);
  const search = props.search ?? localSearch; const allSelected = props.value.length === 0;
  const found = props.onSearch ? props.options : props.options.filter(option => matchesOption(option, search));
  useEffect(() => {
    // Arco 2.66.16 Portal detaches its container during React19 StrictMode
    // effect replay. A post-open render reattaches it, without changing the
    // open state, starting another read, or reviving a dismissed popup.
    if (!popupOpen) return;
    let active = true; queueMicrotask(() => { if (active) refreshPortal(); });
    return () => { active = false; };
  }, [popupOpen]);
  useLayoutEffect(() => {
    const element = host.current; if (!element) return;
    const update = () => setWidth(element.getBoundingClientRect().width); update();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(update); observer.observe(element); return () => observer.disconnect();
  }, []);
  // Frozen inventory-filters.jsx fit calculation, not a fixed one-tag redesign.
  const visibleTagLimit = useMemo(() => {
    if (props.value.length < 2) return 3;
    const context = document.createElement('canvas').getContext('2d'); if (!context) return 1;
    context.font = '13px Arial';
    const widths = props.value.slice(0, 3).map(id => Math.min(context.measureText(names.get(id) ?? id).width + 37, width - 50));
    for (let count = Math.min(3, props.value.length); count > 1; count--) {
      const reserve = props.value.length > count ? 92 : 42;
      if (widths.slice(0, count).reduce((sum, value) => sum + value, 0) + (count - 1) * 4 + reserve <= width) return count;
    }
    return 1;
  }, [props.value, width, names]);
  return <div ref={host} className="transfer-multi-control"><TreeSelect {...(allSelected ? { className: 'inv-all-selected' } : {})}
    aria-label={`${props.label}，多选`} treeData={[{ key: ALL, value: ALL, title: props.allLabel }, ...props.options.map(item => ({ key: item.id, value: item.id, title: item.name }))]}
    value={allSelected ? [ALL, ...props.options.map(item => item.id)] : [...props.value]} multiple treeCheckable treeCheckStrictly treeCheckedStrategy={TreeSelect.SHOW_ALL}
    showSearch={{ retainInputValueWhileSelect: false }} placeholder={`搜索${props.label === '状态' ? '状态' : '仓库'}`} allowClear={false} unmountOnExit
    popupVisible={popupOpen}
    onVisibleChange={visible => { if (props.open === undefined) setLocalOpen(visible); if (!visible && !props.onSearch) setLocalSearch(''); props.onOpen?.(visible); }}
    inputValue={search} onInputValueChange={(value, reason) => { if (reason === 'manual') (props.onSearch ?? setLocalSearch)(value); }}
    {...(props.onSearch ? { onSearch: remoteSearch } : {})}
    filterTreeNode={(_text, node) => node.props.value === ALL || found.some(option => option.id === node.props.value)}
    maxTagCount={{ count: allSelected ? 1 : visibleTagLimit, render: count => allSelected ? null : <span className="inv-filter-count" title={props.value.slice(visibleTagLimit).map(id => names.get(id)).join('、')}>+{count} 更多</span>, showPopover: false }}
    renderFormat={(_option, value) => names.get(typeof value === 'string' ? value : value.value) ?? ''}
    getPopupContainer={() => host.current ?? document.body}
    triggerProps={{ position: 'bl', autoAlignPopupWidth: false, popupStyle: { width: Math.min(Math.max(width, 300), window.innerWidth - (host.current?.getBoundingClientRect().left ?? 0) - 12) } }}
    {...(props.onMenuScroll ? { treeProps: { virtualListProps: { height: 288, threshold: WAREHOUSE_CANDIDATE_LIMIT + 2, onScroll: props.onMenuScroll } } } : {})}
    dropdownRender={props.renderMenu ?? (menu => <div><div className="inv-filter-tools">匹配 {found.length} 项 · 已选 {allSelected ? props.options.length : props.value.length} 项</div>{menu}{search && !found.length && <div className="inv-filter-empty">没有匹配的{props.label}</div>}</div>)}
    onChange={(values: unknown, extra) => {
      const key = extra.trigger?._key;
      const clearSearch = () => { if (search) (props.onSearch ?? setLocalSearch)(''); };
      if (key === ALL) { clearSearch(); props.onChange([]); return; }
      if (typeof key === 'string' && names.has(key)) {
        if (allSelected && !props.completeUniverse) { props.onIncompleteSelection?.(); return; }
        const selected = new Set(allSelected ? props.options.map(item => item.id) : props.value);
        if (extra.checked) selected.add(key); else selected.delete(key);
        const complete = props.completeUniverse && props.options.length > 0 && selected.size === props.options.length && props.options.every(item => selected.has(item.id));
        clearSearch(); props.onChange(complete ? [] : [...selected]); return;
      }
      const ids = (Array.isArray(values) ? values : [values]).map((item: unknown) => typeof item === 'string' ? item : item && typeof item === 'object' && 'value' in item ? item.value : null)
        .filter((id): id is string => typeof id === 'string' && id !== ALL && names.has(id));
      clearSearch(); props.onChange(ids);
    }} /></div>;
}

export function TransferWarehouseSelect(props: { readonly scope: ReadScope; readonly reader: TransferWarehouseReader; readonly label: string;
  readonly value: readonly TransferWarehouse[]; readonly onChange: (value: readonly TransferWarehouse[]) => void }) {
  const [open, setOpen] = useState(false); const [search, setSearch] = useState(''); const [state, setState] = useState<WarehouseCandidateSnapshot | null>(null);
  const [selectionNotice, setSelectionNotice] = useState(''); const loadMore = useRef<(() => void) | null>(null);
  const current = open && state?.search === search.trim() ? state : null; const candidates = current?.items ?? [];
  const options = new Map([...props.value, ...candidates].map(item => [item.id, item]));
  return <MultiSelect label={props.label} allLabel="全部仓库" options={candidates.map(item => ({ id: item.id, name: item.name }))}
    selectedOptions={props.value.map(item => ({ id: item.id, name: item.name }))} completeUniverse={current?.completeUniverse ?? false}
    onIncompleteSelection={() => setSelectionNotice(search.trim()
      ? '搜索匹配结果不代表全部仓库，不能据此从全部仓库排除单项。请清空搜索后读取完整候选。'
      : current?.hasMore && !current.limitReached
        ? '候选尚未加载完整，不能从全部仓库排除单项。请继续加载；当前接口尚不支持直接切换为明确子集。'
        : '当前接口无法确认跨页候选的完整一致集合，不能从全部仓库排除单项；也尚不支持直接切换为明确子集。')}
    value={props.value.map(item => item.id)} onChange={ids => { setSelectionNotice(''); props.onChange(ids.flatMap(id => { const item = options.get(id as TransferWarehouse['id']); return item ? [item] : []; })); }}
    open={open} onOpen={next => { setOpen(next); if (!next) { setState(null); setSearch(''); setSelectionNotice(''); loadMore.current = null; } }}
    search={search} onSearch={value => { setSearch(value); setSelectionNotice(''); }} onMenuScroll={event => {
      const element = event.currentTarget;
      if (element.scrollHeight > element.clientHeight && element.scrollTop + element.clientHeight >= element.scrollHeight - 8) loadMore.current?.();
    }}
    renderMenu={menu => open ? <WarehouseOptions parent={props.scope} reader={props.reader} search={search} setState={setState} loadMore={loadMore}
      selectedCount={props.value.length} selectionNotice={selectionNotice} menu={menu} /> : null} />;
}
function WarehouseOptions(props: { readonly parent: ReadScope; readonly reader: TransferWarehouseReader; readonly search: string;
  readonly setState: (state: WarehouseCandidateSnapshot) => void; readonly loadMore: RefObject<(() => void) | null>;
  readonly selectedCount: number; readonly selectionNotice: string; readonly menu: ReactNode }) {
  const scope = useTransferOwnedScope(props.parent, 'warehouse-candidates', null);
  return scope ? <WarehouseRead {...props} scope={scope} /> : null;
}
function WarehouseRead(props: { readonly parent: ReadScope; readonly scope: ReadScope; readonly reader: TransferWarehouseReader; readonly search: string;
  readonly setState: (state: WarehouseCandidateSnapshot) => void; readonly loadMore: RefObject<(() => void) | null>;
  readonly selectedCount: number; readonly selectionNotice: string; readonly menu: ReactNode }) {
  const [query] = useState(() => new WarehouseCandidates(props.scope, props.parent, props.reader));
  const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot); const search = props.search.trim();
  useEffect(() => {
    query.reset(search); const timer = setTimeout(() => { void query.loadNext(); }, search ? 160 : 0);
    return () => { clearTimeout(timer); query.reset(search); };
  }, [query, search]);
  useEffect(() => { props.setState(snapshot); }, [snapshot, props.setState]);
  useEffect(() => {
    const load = () => { if (query.getSnapshot().phase === 'success') void query.loadNext(); };
    props.loadMore.current = load; return () => { if (props.loadMore.current === load) props.loadMore.current = null; };
  }, [query, props.loadMore]);
  if (!props.scope.active) return null;
  const data = snapshot.search === search ? snapshot : null; const busy = !data || data.phase === 'loading' || data.phase === 'idle';
  const selected = props.selectedCount ? `已选 ${transferCount(String(props.selectedCount))} 项` : data?.unfilteredTotal !== null && data?.unfilteredTotal !== undefined ? `已选 ${transferCount(data.unfilteredTotal)} 项` : '已选全部仓库';
  return <div className="transfer-warehouse-menu"><div className="inv-filter-tools">{data?.exactTotal !== null && data?.exactTotal !== undefined ? `匹配 ${transferCount(data.exactTotal)} 项` : '正在匹配仓库'} · {selected}</div>
    {props.selectionNotice && <p className="transfer-filter-notice" role="status">{props.selectionNotice}</p>}
    {data?.exactTotal !== null && data?.exactTotal !== undefined && props.menu}
    {busy && <p className="iw-inline-state" role="status">正在读取仓库…</p>}
    {data?.phase === 'error' && <p className="iw-inline-state" role="alert">仓库读取失败或候选已变化。<button type="button" className="iw-link" onClick={() => { query.reset(search); void query.loadNext(); }}>重新读取仓库</button></p>}
    {data?.phase === 'success' && data.items.length === 0 && <p className="iw-inline-state">没有匹配的仓库</p>}
    {data?.limitReached && <p className="transfer-filter-notice" role="status">已加载 {WAREHOUSE_CANDIDATE_LIMIT} 项，尚有更多匹配仓库，请输入名称缩小范围。匹配总数未截断。</p>}
  </div>;
}
