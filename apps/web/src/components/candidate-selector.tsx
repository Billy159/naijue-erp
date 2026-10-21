import { useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { ReadScope } from '../loading/read-scope.ts';
import type { PopupOwnership } from '../demo-controls/popup-ownership.ts';
import { DemoMultiSelect } from '../demo-controls/multi-select.tsx';
import type { DemoMultiOption } from '../demo-controls/multi-select-contract.ts';
import type { Selection } from '../inventory/contracts.ts';
import type { CandidateSelectorProps, ProductCandidateActionProps, ProductCandidateActionModule } from './candidate-selector-contract.ts';
import { useInventoryFilterPopupHost } from './inventory-filter-popup-host.ts';
import { InventoryCandidateMenu } from './inventory-candidate-menu.tsx';
import { inventoryMultiOption, type InventoryCandidateSnapshot } from './inventory-candidates.ts';

const noCategoryRestriction: readonly string[] = Object.freeze([]);
export function CandidateSelector(props: CandidateSelectorProps) {
  const localHost = useInventoryFilterPopupHost(props.scope, props.popupHost === undefined);
  const fields = { ...props, categoryIds: props.kind === 'category' || props.kind === 'warehouse' ? noCategoryRestriction : props.categoryIds, popupHost: props.popupHost === undefined ? localHost : props.popupHost };
  return props.kind === 'product' ? <ProductSelector {...fields} /> : <ReferenceSelector {...fields} />;
}
function ReferenceSelector(props: CandidateSelectorProps) {
  const [search, setSearch] = useState(''); const [state, setState] = useState<InventoryCandidateSnapshot | null>(null);
  const [notice, setNotice] = useState(''); const [explicit, setExplicit] = useState<Selection | null>(null);
  const loadMore = useRef<(() => void) | null>(null);
  const ownerKey = useMemo(() => ({ reader: props.reader, kind: props.kind, categories: props.categoryIds.join('\0') }), [props.reader, props.kind, props.categoryIds.join('\0')]);
  const current = state?.search === search.trim() ? state : null; const candidates = current?.items ?? [];
  const currentIds = props.kind === 'category' ? new Set(candidates.map(item => item.id)) : undefined;
  const options = new Map([...props.selected, ...candidates].map(item => [item.id, item]));
  const clearNotice = () => { setNotice(''); setExplicit(null); };
  const incomplete = (option: DemoMultiOption, reason?: 'branch-exclusion') => {
    const item = options.get(option.id); if (!item || 'disabled' in item && item.disabled) return;
    setExplicit(item); setNotice(reason === 'branch-exclusion' ? '已选择整个分类分支，当前查询不支持只排除其中一个子分类。' : props.kind === 'category' ? '全部分类范围可能包含未分类商品，不能从全部范围排除单项。' : search.trim() ? '搜索结果不代表全部范围，不能据此排除单项。' : '候选尚未完整确认，不能从全部范围排除单项。');
  };
  return <div className="iw-field"><label>{props.label}</label><DemoMultiSelect scope={props.scope} popupHost={props.popupHost ?? null}
    ownerKey={ownerKey} label={props.label} allLabel={props.kind === 'category' ? '全部分类' : `全部${props.label}`}
    {...(props.kind === 'category' ? { hierarchy: 'category-branches' as const } : {})}
    options={candidates.map(item => inventoryMultiOption(item, currentIds))}
    selectedOptions={props.selected.map(item => inventoryMultiOption(item, currentIds))} value={props.selected.map(item => item.id)}
    completeUniverse={current?.completeUniverse ?? false} onIncompleteSelection={incomplete}
    onChange={ids => {
      if (ids.length > 100) { setNotice('最多可明确选择 100 项，请减少选择。'); return; }
      const selected = ids.map(id => options.get(id));
      if (selected.some(item => !item)) { setNotice('候选已变化，请重新打开后选择。'); return; }
      if (selected.some(item => item && 'disabled' in item && item.disabled && !props.selected.some(value => value.id === item.id))) { setNotice('该候选不可新选，已选条件未改变。'); return; }
      clearNotice(); props.onChange(selected.filter((item): item is Selection => !!item));
    }} search={search} onSearch={value => { setSearch(value); clearNotice(); }} menuItemLimit={202}
    onMenuScroll={event => { const element = event.currentTarget; if (element.scrollHeight > element.clientHeight && element.scrollTop + element.clientHeight >= element.scrollHeight - 8) loadMore.current?.(); }}
    onPopupClose={() => { setSearch(''); setState(null); clearNotice(); loadMore.current = null; }}
    renderMenu={(menu, scope) => <InventoryCandidateMenu scope={scope} reader={props.reader} kind={props.kind} label={props.label}
      categoryIds={props.categoryIds} selected={props.selected} search={search} setState={setState} loadMore={loadMore} menu={menu}
      notice={notice} explicit={explicit} chooseExplicit={() => { if (scope.active && explicit && !('disabled' in explicit && explicit.disabled)) { props.onChange([explicit]); setSearch(''); clearNotice(); } }} />} />
  </div>;
}

function ProductSelector(props: CandidateSelectorProps) {
  const host = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null);
  const suppressOpen = useRef(false); const attached = useRef(false); const generation = useRef(0); const sequence = useRef(0);
  const pending = useRef<Promise<void> | null>(null); const styles = useRef<ReturnType<ProductCandidateActionModule['createInventoryProductSelectStyles']> | null>(null);
  const owned = useRef<{ scope: ReadScope; ownership: PopupOwnership } | null>(null);
  const live = useRef(props); live.current = props;
  const [activation, setActivation] = useState<ReadScope | null>(null); const [search, setSearch] = useState('');
  const [View, setView] = useState<ComponentType<ProductCandidateActionProps> | null>(null);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'error'>('idle');
  const clearPending = () => { generation.current++; pending.current = null; styles.current?.dispose(); styles.current = null; setPhase('idle'); };
  const available = () => attached.current && live.current.scope.active && !!live.current.popupHost && !live.current.popupHost.controller.disposed;
  useLayoutEffect(() => {
    attached.current = true; suppressOpen.current = false; setSearch(''); setView(null); clearPending();
    const abort = () => { owned.current?.ownership.dispose(); clearPending(); setActivation(null); setSearch(''); setView(null); };
    props.scope.signal.addEventListener('abort', abort, { once: true });
    return () => { attached.current = false; props.scope.signal.removeEventListener('abort', abort); owned.current?.ownership.dispose(); clearPending(); };
  }, [props.scope, props.reader, props.productReader, props.popupHost]);
  const open = () => {
    if (suppressOpen.current || !available() || !host.current || !live.current.popupHost || owned.current?.ownership.active) return;
    const parent = live.current.scope; const scope = new ReadScope(parent.identity, `${parent.routeInstanceId}:product-search:${++sequence.current}`, null, () => {});
    let detach = () => {};
    const ownership = live.current.popupHost.controller.open({ signal: parent.signal, onClose: reason => {
      scope.dispose(); detach(); if (owned.current?.scope !== scope) return;
      const restore = (reason === 'escape' || reason === 'close') && !!host.current?.contains(document.activeElement);
      owned.current = null; setActivation(null); setSearch('');
      if (pending.current) { clearPending(); setView(null); }
      if (restore) queueMicrotask(() => { if (attached.current && live.current.scope === parent && parent.active && !owned.current) {
        suppressOpen.current = true; const element = host.current?.querySelector<HTMLInputElement>('input:not([type="hidden"])'); element?.focus({ preventScroll: true }); queueMicrotask(() => { suppressOpen.current = false; });
      } });
    } });
    if (!ownership) { scope.dispose(); return; }
    detach = live.current.popupHost.attach(ownership, host.current); owned.current = { scope, ownership }; setActivation(scope);
  };
  const prepare = () => {
    if (suppressOpen.current || !available()) return; open();
    if (View || pending.current) return;
    const current = ++generation.current; const parent = props.scope; setPhase('loading');
    const owns = () => available() && live.current.scope === parent && generation.current === current;
    pending.current = import('./product-candidate-action.tsx').then(async module => {
      if (!owns() || !host.current) return;
      const lease = module.createInventoryProductSelectStyles(host.current.ownerDocument); styles.current = lease; await lease.load();
      if (owns()) { setView(() => module.ProductCandidateAction); setPhase('idle'); }
    }).catch(() => { if (owns()) { pending.current = null; clearPending(); setPhase('error'); owned.current?.ownership.close(); } })
      .finally(() => { if (generation.current === current) pending.current = null; });
    void pending.current;
  };
  const enabled = props.scope.active && !!props.popupHost && !props.popupHost.controller.disposed;
  return <div ref={host} className="iw-field iw-product-field inventory-product-control" onBlur={event => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    const ticket = generation.current; queueMicrotask(() => { if (attached.current && generation.current === ticket && !host.current?.contains(document.activeElement)) owned.current?.ownership.close(); });
  }}>
    <label>{props.label}</label>
    {View ? <View {...props} search={search} onSearch={setSearch} open={!!activation?.active} activationScope={activation}
      focusOnMount={!!host.current?.contains(document.activeElement)} onOpen={next => { if (next) open(); else owned.current?.ownership.close(); }} />
      : <div className="iw-product-search-shell"><input ref={input} className="iw-product-input" role="combobox" aria-label="商品搜索，多选" aria-expanded={!!activation?.active} aria-autocomplete="list"
        disabled={!enabled} value={search} placeholder={props.placeholder ?? '商品款号 / 名称 / 系统货号'}
        onFocus={prepare} onClick={prepare} onChange={event => { setSearch(event.target.value); prepare(); }}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); prepare(); } }} /><SearchIcon /></div>}
    {phase === 'loading' && <span className="iw-filter-load-state" role="status">正在加载商品搜索…</span>}
    {phase === 'error' && <span className="iw-filter-load-state" role="alert">商品搜索未加载。<button type="button" className="iw-link" onClick={prepare}>重试加载</button></span>}
  </div>;
}
function SearchIcon() { return <svg className="iw-search-icon" aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="4"><circle cx="21" cy="21" r="13"/><path d="m31 31 10 10"/></svg>; }
