import { UIButton } from '../components/standard-controls.tsx';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { DemoMultiSelect } from '../demo-controls/multi-select.tsx';
import type { DemoMultiOption } from '../demo-controls/multi-select-contract.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import type { SalesBusinessTypeGroup, SalesFilterDraft, SalesReference, SalesReferenceKind, SalesReferenceReader } from './contracts.ts';
import { salesCount, salesStatusLabels, salesTypeGroupLabels } from './model.ts';
import type { SalesReferencePopupHost } from './reference-popup-host.ts';
import { SalesReferenceCandidates, SALES_REFERENCE_CANDIDATE_LIMIT, type SalesReferenceCandidateSnapshot } from './reference-candidates.ts';

interface CommonProps { readonly scope: ReadScope; readonly popupHost: SalesReferencePopupHost | null; readonly active: boolean }
const statusTerms = { DRAFT: ['weishenhe', 'wsh'], APPROVED: ['yishenhe', 'ysh'], VOID: ['yizuofei', 'yzf'] };
const typeTerms = { SALE: ['xiaoshou', 'xs'], RETURN_EXCHANGE: ['tuihuohuanhuo', 'thhh'] };
export function SalesStatusSelect(props: CommonProps & { readonly value: SalesFilterDraft['statuses']; readonly onChange: (value: SalesFilterDraft['statuses']) => void }) {
  return <DemoMultiSelect {...props} label="状态" allLabel="全部状态" completeUniverse
    options={Object.entries(salesStatusLabels).map(([id, name]) => ({ id, name, searchTerms: statusTerms[id as keyof typeof statusTerms] }))}
    onChange={ids => {
      if (!ids.every((id): id is SalesFilterDraft['statuses'][number] => Object.hasOwn(salesStatusLabels, id))) return;
      props.onChange(ids);
    }} />;
}
export function SalesBusinessTypeSelect(props: CommonProps & { readonly value: SalesFilterDraft['businessTypes']; readonly onChange: (value: SalesFilterDraft['businessTypes']) => void }) {
  return <DemoMultiSelect {...props} label="业务类型" allLabel="全部业务类型" completeUniverse
    options={Object.entries(salesTypeGroupLabels).map(([id, name]) => ({ id, name, searchTerms: typeTerms[id as keyof typeof typeTerms] }))}
    onChange={ids => {
      if (!ids.every((id): id is SalesBusinessTypeGroup => Object.hasOwn(salesTypeGroupLabels, id))) return;
      props.onChange(ids);
    }} />;
}
export function SalesReferenceMultiSelect(props: CommonProps & { readonly reader: SalesReferenceReader; readonly kind: SalesReferenceKind; readonly label: string;
  readonly value: readonly SalesReference[]; readonly onChange: (value: readonly SalesReference[]) => void }) {
  const [search, setSearch] = useState(''); const [state, setState] = useState<SalesReferenceCandidateSnapshot | null>(null);
  const ownerKey = useMemo(() => ({ reader: props.reader, kind: props.kind }), [props.reader, props.kind]);
  const [notice, setNotice] = useState(''); const [explicit, setExplicit] = useState<SalesReference | null>(null);
  const loadMore = useRef<(() => void) | null>(null);
  const current = state?.search === search.trim() ? state : null; const candidates = current?.items ?? [];
  const options = new Map([...props.value, ...candidates].map(item => [item.id, item]));
  const clearNotice = () => { setNotice(''); setExplicit(null); };
  const incomplete = (option: DemoMultiOption) => {
    const selected = options.get(option.id); if (!selected) return;
    setExplicit(selected);
    setNotice(search.trim() ? `搜索匹配结果不代表全部${props.label}，不能据此从全部范围排除单项。`
      : `候选尚未完整确认，当前接口不能从全部${props.label}排除单项。`);
  };
  return <DemoMultiSelect scope={props.scope} popupHost={props.popupHost} active={props.active} ownerKey={ownerKey} label={props.label}
    allLabel={`全部${props.kind === 'warehouse' ? '仓库' : props.label}`} value={props.value.map(item => item.id)}
    options={candidates.map(item => ({ id: item.id, name: item.label }))} selectedOptions={props.value.map(item => ({ id: item.id, name: item.label }))}
    completeUniverse={current?.completeUniverse ?? false} onIncompleteSelection={incomplete}
    onChange={ids => {
      if (ids.length > 1000) { setNotice('最多可明确选择 1000 项，请减少选择。'); return; }
      const values = ids.map(id => options.get(id));
      if (values.some(value => value === undefined)) { setNotice('选择候选已变化，请重新打开后选择。'); return; }
      clearNotice(); props.onChange(values.filter((value): value is SalesReference => value !== undefined));
    }}
    search={search} onSearch={value => { setSearch(value); clearNotice(); }} menuItemLimit={SALES_REFERENCE_CANDIDATE_LIMIT + 2}
    onMenuScroll={event => { const element = event.currentTarget; if (element.scrollHeight > element.clientHeight && element.scrollTop + element.clientHeight >= element.scrollHeight - 8) loadMore.current?.(); }}
    onPopupClose={() => { setSearch(''); setState(null); clearNotice(); loadMore.current = null; }}
    renderMenu={(menu, scope) => <ReferenceRead scope={scope} reader={props.reader} kind={props.kind} label={props.label} search={search}
      setState={setState} loadMore={loadMore} selectedCount={props.value.length} notice={notice} explicit={explicit}
      chooseExplicit={() => { if (scope.active && explicit) { props.onChange([explicit]); clearNotice(); setSearch(''); } }} menu={menu} />} />;
}
function ReferenceRead(props: { readonly scope: ReadScope; readonly reader: SalesReferenceReader; readonly kind: SalesReferenceKind; readonly label: string; readonly search: string;
  readonly setState: (state: SalesReferenceCandidateSnapshot) => void; readonly loadMore: { current: (() => void) | null }; readonly selectedCount: number;
  readonly notice: string; readonly explicit: SalesReference | null; readonly chooseExplicit: () => void; readonly menu: ReactNode }) {
  const [query] = useState(() => new SalesReferenceCandidates(props.scope, props.reader, props.kind));
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
  const data = snapshot.search === search ? snapshot : null; const busy = !data || data.phase === 'idle' || data.phase === 'loading';
  const selected = props.selectedCount ? `已选 ${salesCount(String(props.selectedCount))} 项`
    : data?.unfilteredTotal !== null && data?.unfilteredTotal !== undefined ? `已选 ${salesCount(data.unfilteredTotal)} 项` : `已选全部${props.label}`;
  return <div className="sales-reference-menu"><div className="inv-filter-tools">{data?.exactTotal !== null && data?.exactTotal !== undefined ? `匹配 ${salesCount(data.exactTotal)} 项` : `正在匹配${props.label}`} · {selected}</div>
    {props.notice && <p className="sales-filter-notice" role="status">{props.notice}{props.explicit && <> 如需明确只选“{props.explicit.label}”，请<UIButton type="button" className="iw-link" onClick={props.chooseExplicit}>仅选择该项</UIButton>。</>}</p>}
    {data?.exactTotal !== null && data?.exactTotal !== undefined && props.menu}
    {busy && <p className="iw-inline-state" role="status">正在读取候选…</p>}
    {data?.phase === 'error' && <p className="iw-inline-state" role="alert">候选读取失败或已变化。<UIButton type="button" className="iw-link" onClick={() => { query.reset(search); void query.loadNext(); }}>重试候选</UIButton></p>}
    {data?.phase === 'success' && data.items.length === 0 && <p className="iw-inline-state">没有匹配候选</p>}
    {data?.limitReached && <p className="sales-filter-notice" role="status">已加载 {SALES_REFERENCE_CANDIDATE_LIMIT} 项，尚有更多匹配候选，请输入名称缩小范围。匹配总数未截断。</p>}
  </div>;
}
