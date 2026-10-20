import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { LatestQuery } from '../loading/latest-query.ts';
import { ReadScope } from '../loading/read-scope.ts';
import type { CandidateKind, CandidatePage, CandidateParameters, InventoryReader, Selection } from '../inventory/contracts.ts';

interface Props {
  readonly label: string;
  readonly kind: CandidateKind;
  readonly selected: readonly Selection[];
  readonly multiple?: boolean;
  readonly reader: InventoryReader;
  readonly scope: ReadScope;
  readonly categoryId: string | null;
  readonly placeholder?: string;
  readonly onChange: (items: readonly Selection[]) => void;
}

/** Reuses selection behavior, not a global candidate/catalog store. */
export function CandidateSelector(props: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div className={`iw-field ${props.kind === 'product' ? 'iw-product-field' : ''}`} ref={root}>
    <label id={`${id}-label`}>{props.label}</label>
    <button ref={trigger} type="button" className="iw-control" aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span id={`${id}-value`} className={props.selected.length ? '' : 'muted'}>{props.selected.length ? props.selected.map(item => item.label).join('、') : props.placeholder ?? `全部${props.label}`}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && <CandidatePopup {...props} id={id} close={() => { setOpen(false); trigger.current?.focus(); }} />}
  </div>;
}

function CandidatePopup(props: Props & { readonly id: string; readonly close: () => void }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const searchInput = useRef<HTMLInputElement>(null);
  const [scope] = useState(() => new ReadScope(props.scope.identity, `${props.scope.routeInstanceId}:candidate:${props.id}`, null, () => {}));
  const [query] = useState(() => new LatestQuery<CandidateParameters, CandidatePage>({ scope, execute: async read => {
    const result = await props.reader.readCandidates(read);
    if (!Number.isSafeInteger(result.exactTotal) || result.exactTotal < 0 || result.page !== read.parameters.page || result.items.length > read.parameters.pageSize || new Set(result.items.map(item => item.id)).size !== result.items.length) throw new Error('候选响应无效，请重新加载。');
    return result;
  } }));
  const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  useEffect(() => {
    const dispose = () => scope.dispose();
    props.scope.signal.addEventListener('abort', dispose, { once: true });
    if (!props.scope.active) dispose();
    searchInput.current?.focus();
    return () => { props.scope.signal.removeEventListener('abort', dispose); query.dispose(); scope.dispose(); };
  }, [props.scope, query, scope]);
  useEffect(() => {
    // Opening is the first read. Debounce only this open control's candidate search.
    const timer = setTimeout(() => { void query.run({ kind: props.kind, search: search.trim(), page, pageSize: 20, selectedIds: props.selected.map(item => item.id), categoryId: props.categoryId }); }, search ? 180 : 0);
    return () => clearTimeout(timer);
    // Selected values stay visible even when outside this response page; selecting is not a new read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page, query, props.categoryId]);
  const matchingResponse = snapshot.success?.parameters.search === search.trim() && snapshot.success.parameters.page === page && snapshot.success.parameters.categoryId === props.categoryId;
  const result = matchingResponse ? snapshot.success?.data : undefined;
  const pending = snapshot.phase === 'loading' || !matchingResponse && snapshot.phase !== 'error';
  const toggle = (item: Selection) => {
    const next = props.multiple
      ? props.selected.some(value => value.id === item.id) ? props.selected.filter(value => value.id !== item.id) : [...props.selected, { id: item.id, label: item.label }]
      : [{ id: item.id, label: item.label }];
    props.onChange(next);
    if (!props.multiple) props.close();
  };
  return <div className="iw-popover" role="dialog" aria-label={`选择${props.label}`} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); props.close(); } }}>
    <div className="iw-pop-head"><strong>选择{props.label}</strong><button type="button" className="iw-text-button" onClick={props.close} aria-label={`关闭${props.label}选择`}>×</button></div>
    <input ref={searchInput} className="iw-search" aria-label={`搜索${props.label}`} value={search} placeholder={props.kind === 'product' ? '商品款号 / 名称 / 系统货号' : `搜索${props.label}`} onChange={event => { query.cancel(); setSearch(event.target.value); setPage(1); }} />
    <button type="button" className="iw-option iw-all-option" onClick={() => props.onChange([])}><span aria-hidden="true">{props.selected.length ? '□' : '✓'}</span> 全部{props.label}</button>
    <div className="iw-option-list" aria-busy={pending}>
      {pending && <p className="iw-inline-state" role="status">正在加载候选…</p>}
      {snapshot.phase === 'error' && <div className="iw-inline-state" role="alert">候选暂不可读取，已选条件未改变。<button type="button" className="iw-link" onClick={() => { if (snapshot.request) void query.run(snapshot.request.parameters); }}>重试</button></div>}
      {snapshot.phase === 'success' && result?.items.length === 0 && <p className="iw-inline-state">无匹配候选</p>}
      {snapshot.phase === 'success' && result?.items.map(item => <label key={item.id} className={`iw-option ${item.disabled ? 'muted' : ''}`} style={item.depth === 1 ? { paddingLeft: 28 } : undefined}>
        <input type={props.multiple ? 'checkbox' : 'radio'} name={props.id} checked={props.selected.some(value => value.id === item.id)} disabled={item.disabled} onChange={() => toggle(item)} />
        <span>{item.parentLabel && <small className="muted">{item.parentLabel} / </small>}{item.label}{item.disabled && '（不可新选）'}</span>
      </label>)}
    </div>
    <footer><span>{result && snapshot.phase === 'success' ? `共 ${result.exactTotal} 项` : '候选按需读取'}</span><div className="iw-actions"><button type="button" className="iw-text-button" disabled={page <= 1 || pending} onClick={() => setPage(value => value - 1)}>上一页</button><button type="button" className="iw-text-button" disabled={!result || page * 20 >= result.exactTotal || pending} onClick={() => setPage(value => value + 1)}>下一页</button><button type="button" className="iw-button" onClick={props.close}>完成</button></div></footer>
  </div>;
}
