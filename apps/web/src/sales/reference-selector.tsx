import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PopupOwnership } from '../demo-controls/popup-ownership.ts';
import { LatestQuery } from '../loading/latest-query.ts';
import { ReadScope } from '../loading/read-scope.ts';
import type { SalesReference, SalesReferenceKind, SalesReferenceReader, SalesReferenceParameters, SalesReferencePage } from './contracts.ts';
import { salesReferencesResponse } from './response-validation.ts';
import { salesCount } from './model.ts';
import type { SalesReferencePopupHost } from './reference-popup-host.ts';

interface ReferenceActivation { readonly scope: ReadScope; readonly ownership: PopupOwnership }

export function SalesReferenceSelector(props: { readonly popupHost: SalesReferencePopupHost | null; readonly parentScope: ReadScope; readonly reader: SalesReferenceReader; readonly kind: SalesReferenceKind;
  readonly label: string; readonly active?: boolean; readonly value: SalesReference | null; readonly onChange: (value: SalesReference | null) => void }) {
  const [activation, setActivation] = useState<ReferenceActivation | null>(null);
  const owned = useRef<ReferenceActivation | null>(null); const host = useRef<HTMLDivElement>(null); const trigger = useRef<HTMLButtonElement>(null);
  const instance = useId(); const sequence = useRef(0);
  const active = props.active !== false && props.parentScope.active && !!props.popupHost && !props.popupHost.controller.disposed;
  const activeNow = useRef(active); activeNow.current = active;
  useLayoutEffect(() => () => { owned.current?.ownership.dispose(); }, [props.popupHost, props.parentScope, props.reader, props.kind]);
  // Entering a document detaches the candidate child immediately. Clear its UI
  // state without moving focus back into the newly hidden list.
  useLayoutEffect(() => { if (!active) owned.current?.ownership.dispose(); }, [active]);
  const toggle = () => {
    if (!active || !props.popupHost || !host.current) return;
    if (owned.current?.ownership.active) { owned.current.ownership.close(); return; }
    const scope = new ReadScope(props.parentScope.identity, `${props.parentScope.routeInstanceId}:sales-reference:${instance}:${++sequence.current}`, null, () => {});
    let detach = () => {};
    const ownership = props.popupHost.controller.open({ signal: props.parentScope.signal, onClose: reason => {
      const restoreFocus = (reason === 'close' || reason === 'escape') && !!host.current?.contains(document.activeElement);
      // Abort immediately, before a newer selector starts its own transport.
      scope.dispose(); detach();
      if (owned.current?.scope !== scope) return;
      owned.current = null; setActivation(null);
      if (restoreFocus && activeNow.current && props.parentScope.active && trigger.current?.isConnected
        && !trigger.current.matches(':disabled') && !trigger.current.closest('[hidden]')) trigger.current.focus({ preventScroll: true });
    } });
    if (!ownership) { scope.dispose(); return; }
    detach = props.popupHost.attach(ownership, host.current);
    const next = { scope, ownership }; owned.current = next; setActivation(next);
  };
  const open = active && !!activation?.ownership.active && activation.scope.active;
  return <div ref={host} className="iw-field sales-reference"><label>{props.label}</label><button ref={trigger} type="button" className="iw-control" aria-label={props.label} aria-expanded={open} disabled={!active} title={props.value?.label ?? `全部${props.kind === 'warehouse' ? '仓库' : props.label}`} onClick={toggle}><span>{props.value?.label ?? `全部${props.kind === 'warehouse' ? '仓库' : props.label}`}</span><span aria-hidden="true">⌄</span></button>
    {open && activation && <ReferenceRead {...props} key={activation.scope.routeInstanceId} scope={activation.scope} close={() => { activation.ownership.close(); }} onChange={value => { if (activation.ownership.active && activation.scope.active) props.onChange(value); }} />}
  </div>;
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
