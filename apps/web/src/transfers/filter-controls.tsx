import { DatePicker } from '@arco-design/web-react';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import type { ReadScope } from '../loading/read-scope.ts';
import type { TransferFilterDraft, TransferWarehouse, TransferWarehouseReader } from './contracts.ts';
import { transferStatusLabels } from './model.ts';
import { useTransferOwnedScope } from './owned-scope.ts';
import { transferCount } from './format.ts';
import { WarehouseCandidates, WAREHOUSE_CANDIDATE_LIMIT, type WarehouseCandidateSnapshot } from './warehouse-candidates.ts';
import { DemoMultiSelectAction } from '../demo-controls/multi-select-action.tsx';
import '../demo-controls/multi-select.css';
import './filter-controls.css';

export function TransferDate(props: { readonly label: string; readonly value: string; readonly onChange: (value: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  return <div className="transfer-date-control" ref={host}><DatePicker value={props.value} format="YYYY-MM-DD" placeholder={props.label} aria-label={props.label} allowClear getPopupContainer={() => host.current ?? document.body} onChange={value => props.onChange(value || '')} /></div>;
}
export function TransferStatusSelect(props: { readonly value: TransferFilterDraft['statuses']; readonly onChange: (value: TransferFilterDraft['statuses']) => void }) {
  const terms = { DRAFT: ['weishenhe', 'wsh'], APPROVED: ['yishenhe', 'ysh'], VOID: ['yizuofei', 'yzf'] };
  return <div className="transfer-multi-control"><DemoMultiSelectAction label="状态" allLabel="全部状态" options={Object.entries(transferStatusLabels).map(([id, name]) => ({ id, name, searchTerms: terms[id as keyof typeof terms] }))} value={props.value} completeUniverse
    onChange={ids => props.onChange(ids as TransferFilterDraft['statuses'])} /></div>;
}

export function TransferWarehouseSelect(props: { readonly scope: ReadScope; readonly reader: TransferWarehouseReader; readonly label: string;
  readonly value: readonly TransferWarehouse[]; readonly onChange: (value: readonly TransferWarehouse[]) => void }) {
  const [open, setOpen] = useState(false); const [search, setSearch] = useState(''); const [state, setState] = useState<WarehouseCandidateSnapshot | null>(null);
  const [selectionNotice, setSelectionNotice] = useState(''); const loadMore = useRef<(() => void) | null>(null);
  const current = open && state?.search === search.trim() ? state : null; const candidates = current?.items ?? [];
  const options = new Map([...props.value, ...candidates].map(item => [item.id, item]));
  return <div className="transfer-multi-control"><DemoMultiSelectAction label={props.label} allLabel="全部仓库" options={candidates.map(item => ({ id: item.id, name: item.name }))}
    selectedOptions={props.value.map(item => ({ id: item.id, name: item.name }))} completeUniverse={current?.completeUniverse ?? false}
    onIncompleteSelection={() => setSelectionNotice(search.trim()
      ? '搜索匹配结果不代表全部仓库，不能据此从全部仓库排除单项。请清空搜索后读取完整候选。'
      : current?.hasMore && !current.limitReached
        ? '候选尚未加载完整，不能从全部仓库排除单项。请继续加载；当前接口尚不支持直接切换为明确子集。'
        : '当前接口无法确认跨页候选的完整一致集合，不能从全部仓库排除单项；也尚不支持直接切换为明确子集。')}
    value={props.value.map(item => item.id)} onChange={ids => { setSelectionNotice(''); props.onChange(ids.flatMap(id => { const item = options.get(id as TransferWarehouse['id']); return item ? [item] : []; })); }}
    open={open} onOpen={next => { setOpen(next); if (!next) { setState(null); setSearch(''); setSelectionNotice(''); loadMore.current = null; } }}
    menuItemLimit={WAREHOUSE_CANDIDATE_LIMIT + 2} search={search} onSearch={value => { setSearch(value); setSelectionNotice(''); }} onMenuScroll={event => {
      const element = event.currentTarget;
      if (element.scrollHeight > element.clientHeight && element.scrollTop + element.clientHeight >= element.scrollHeight - 8) loadMore.current?.();
    }}
    renderMenu={menu => open ? <WarehouseOptions parent={props.scope} reader={props.reader} search={search} setState={setState} loadMore={loadMore}
      selectedCount={props.value.length} selectionNotice={selectionNotice} menu={menu} /> : null} /></div>;
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
