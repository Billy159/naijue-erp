import { UIButton } from './standard-controls.tsx';
import { useEffect, useRef, type ReactNode } from 'react';
import type { ReadScope } from '../loading/read-scope.ts';
import type { CandidateKind, InventoryReader, Selection } from '../inventory/contracts.ts';
import type { InventoryCandidateSnapshot } from './inventory-candidates.ts';
import { useInventoryCandidates } from './use-inventory-candidates.ts';
export function InventoryCandidateMenu(props: { readonly scope: ReadScope; readonly reader: InventoryReader; readonly kind: CandidateKind;
  readonly label: string; readonly categoryIds: readonly string[]; readonly selected: readonly Selection[]; readonly search: string;
  readonly setState: (state: InventoryCandidateSnapshot) => void; readonly loadMore: { current: (() => void) | null };
  readonly menu: ReactNode; readonly notice: string; readonly explicit: Selection | null; readonly chooseExplicit: () => void }) {
  const selected = useRef(props.selected); selected.current = props.selected;
  const { query, snapshot } = useInventoryCandidates(props.scope, props.reader, props.kind, props.categoryIds, () => selected.current.map(item => item.id)); const search = props.search.trim();
  useEffect(() => { if (!query) return; query.reset(search); const timer = setTimeout(() => { void query.loadNext(); }, search ? 180 : 0); return () => { clearTimeout(timer); query.reset(search); }; }, [query, search]);
  useEffect(() => { props.setState(snapshot); }, [snapshot, props.setState]);
  useEffect(() => { if (!query) return; const load = () => { if (query.getSnapshot().phase === 'success') void query.loadNext(); }; props.loadMore.current = load; return () => { if (props.loadMore.current === load) props.loadMore.current = null; }; }, [query, props.loadMore]);
  if (!props.scope.active) return null;
  const data = snapshot.search === search ? snapshot : null; const busy = !data || data.phase === 'idle' || data.phase === 'loading';
  const selectedLabel = props.selected.length ? `已选 ${props.selected.length} 项` : data?.unfilteredTotal !== null && data?.unfilteredTotal !== undefined ? `已选 ${data.unfilteredTotal} 项` : `已选全部${props.label}`;
  return <div className="inventory-reference-menu">{props.kind !== 'category' && <div className="inv-filter-tools">{data?.exactTotal !== null && data?.exactTotal !== undefined ? `匹配 ${data.exactTotal} 项` : `正在匹配${props.label}`} · {selectedLabel}</div>}
    {props.notice && <p className="iw-filter-notice" role="status">{props.notice}{props.explicit && <> 如需只选“{props.explicit.label}”，请<UIButton type="button" className="iw-link" onClick={props.chooseExplicit}>仅选择该项</UIButton>。</>}</p>}
    {data?.exactTotal !== null && data?.exactTotal !== undefined && props.menu}
    {busy && <p className="iw-inline-state" role="status">正在读取候选…</p>}
    {data?.phase === 'error' && <p className="iw-inline-state" role="alert">候选读取失败或范围已变化。<UIButton type="button" className="iw-link" onClick={() => { query?.reset(search); void query?.loadNext(); }}>重试候选</UIButton></p>}
    {data?.phase === 'success' && data.items.length === 0 && <p className="iw-inline-state">没有匹配候选</p>}
    {data?.limitReached && <p className="iw-filter-notice" role="status">已加载 200 项，尚有更多匹配候选，请输入名称缩小范围。匹配总数未截断。</p>}
  </div>;
}
