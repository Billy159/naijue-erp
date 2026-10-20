import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LatestQuery } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import type { SalesReference, SalesReferenceKind, SalesReferenceReader, SalesReferenceParameters, SalesReferencePage } from './contracts.ts';
import { salesReferencesResponse } from './response-validation.ts';
import { salesCount } from './model.ts';
import { useSalesOwnedScope } from './owned-scope.ts';

export function SalesReferenceSelector(props: { readonly parentScope: ReadScope; readonly reader: SalesReferenceReader; readonly kind: SalesReferenceKind;
  readonly label: string; readonly value: SalesReference | null; readonly onChange: (value: SalesReference | null) => void }) {
  const [open, setOpen] = useState(false); const trigger = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <div className="iw-field sales-reference"><label>{props.label}</label><button ref={trigger} type="button" className="iw-control" aria-label={props.label} aria-expanded={open} onClick={() => setOpen(value => !value)}><span>{props.value?.label ?? '全部'}</span><span aria-hidden="true">⌄</span></button>
    {open && <ReferenceOptions {...props} close={close} />}
  </div>;
}
function ReferenceOptions(props: { readonly parentScope: ReadScope; readonly reader: SalesReferenceReader; readonly kind: SalesReferenceKind;
  readonly label: string; readonly onChange: (value: SalesReference | null) => void; readonly close: () => void }) {
  const scope = useSalesOwnedScope(props.parentScope, 'sales-reference', null);
  return scope ? <ReferenceRead {...props} scope={scope} /> : null;
}
function ReferenceRead(props: { readonly parentScope: ReadScope; readonly scope: ReadScope; readonly reader: SalesReferenceReader; readonly kind: SalesReferenceKind;
  readonly label: string; readonly onChange: (value: SalesReference | null) => void; readonly close: () => void }) {
  const { scope } = props;
  const [query] = useState(() => new LatestQuery<SalesReferenceParameters, SalesReferencePage>({ scope, execute: async read => salesReferencesResponse(await props.reader.readReferences(read), read.parameters) }));
  const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  const [search, setSearch] = useState(''); const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let attached = true;
    queueMicrotask(() => { if (attached && scope.active) void query.run({ kind: props.kind, search: '', page: 1, pageSize: 20 }); }); input.current?.focus();
    return () => { attached = false; query.cancel(); };
  }, [props.parentScope, props.kind, scope, query]);
  const close = () => { scope.dispose(); props.close(); };
  const data = snapshot.success?.data; const busy = snapshot.phase === 'loading';
  if (!scope.active) return null;
  return <div className="iw-popover sales-reference-options" role="dialog" aria-label={`选择${props.label}`} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <div className="iw-pop-head"><strong>选择{props.label}</strong><button type="button" className="iw-text-button" aria-label={`关闭${props.label}选择`} onClick={close}>×</button></div>
    <div className="sales-reference-search"><input ref={input} className="iw-search" aria-label={`搜索${props.label}`} value={search} maxLength={200} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void query.run({ kind: props.kind, search: search.trim(), page: 1, pageSize: 20 }); } }} /><button type="button" className="iw-button" onClick={() => { void query.run({ kind: props.kind, search: search.trim(), page: 1, pageSize: 20 }); }}>搜索</button></div>
    {busy ? <p className="iw-inline-state" role="status">正在读取候选…</p> : snapshot.phase === 'error' ? <p className="iw-inline-state" role="alert">候选读取失败。<button type="button" className="iw-link" onClick={() => { if (snapshot.request) void query.run(snapshot.request.parameters); }}>重试候选</button></p> : null}
    <div className="iw-option-list"><button type="button" className="iw-option iw-all-option" onClick={() => { props.onChange(null); close(); }}>全部</button>
      {!busy && snapshot.phase !== 'error' && data?.items.map(item => <button type="button" className="iw-option" key={item.id} onClick={() => { props.onChange(item); close(); }}>{item.label}</button>)}
      {!busy && snapshot.phase === 'success' && data?.items.length === 0 && <p className="iw-inline-state">没有匹配候选</p>}
    </div>
    {data && snapshot.phase === 'success' && <footer><span>共 {salesCount(data.exactTotal)} 项 · 第 {data.page} 页</span><span><button type="button" className="iw-text-button" disabled={busy || data.page <= 1} onClick={() => { if (snapshot.success) void query.run({ ...snapshot.success.parameters, page: data.page - 1 }); }}>上一页</button><button type="button" className="iw-text-button" disabled={busy || BigInt(data.page) * 20n >= BigInt(data.exactTotal) || !Number.isSafeInteger((data.page + 1) * 20)} onClick={() => { if (snapshot.success) void query.run({ ...snapshot.success.parameters, page: data.page + 1 }); }}>下一页</button></span></footer>}
  </div>;
}
