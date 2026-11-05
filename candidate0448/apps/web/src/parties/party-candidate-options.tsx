import { UIButton, UIInput } from '../components/standard-controls.tsx';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { LatestQuery } from '../loading/latest-query.ts';
import { ReadScope } from '../loading/read-scope.ts';
import { PartyClientError, partyLabels, type PartyCandidate, type PartyCandidateSearch, type PartyPage } from './contracts.ts';
import type { PartyCandidateSelectorProps } from './party-candidate-selector.tsx';
import { validateCandidates } from './response-validation.ts';

export function PartyCandidateOptions(props: PartyCandidateSelectorProps & { readonly close: () => void }) {
  const instance = useId(); const [owned, setOwned] = useState<{ parent: ReadScope; kind: string; scope: ReadScope } | null>(null);
  useEffect(() => {
    const scope = new ReadScope(props.scope.identity, `${props.scope.routeInstanceId}:party-candidate:${instance}`, null, () => {});
    const abort = () => { scope.dispose(); setOwned(null); };
    props.scope.signal.addEventListener('abort', abort, { once: true });
    if (props.scope.active) setOwned({ parent: props.scope, kind: props.kind, scope }); else abort();
    return () => { props.scope.signal.removeEventListener('abort', abort); scope.dispose(); };
  }, [props.scope, props.kind, instance]);
  return owned?.parent === props.scope && owned.kind === props.kind && owned.scope.active ? <CandidateRead key={owned.scope.routeInstanceId} {...props} child={owned.scope} /> : null;
}
function CandidateRead(props: PartyCandidateSelectorProps & { readonly child: ReadScope; readonly close: () => void }) {
  const { child } = props; const label = partyLabels[props.kind];
  const [query] = useState(() => new LatestQuery<PartyCandidateSearch, PartyPage<PartyCandidate>>({ scope: child, execute: async read => {
    try { return validateCandidates(await props.client.candidates(props.kind, read.parameters, read.signal), read.parameters); }
    catch (error) {
      if (!read.signal.aborted && child.active && props.scope.active && error instanceof PartyClientError && ['unauthenticated', 'forbidden'].includes(error.kind)) { props.scope.dispose(); try { props.onAccessFailure(error); } catch { /* Parent invalidation already ran. */ } }
      throw error;
    }
  } }));
  const state = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot); const [search, setSearch] = useState(''); const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let attached = true; queueMicrotask(() => { if (attached && child.active) void query.run({ search: '', page: 1, pageSize: 20 }); }); input.current?.focus();
    return () => { attached = false; query.cancel(); };
  }, [child, query]);
  if (!child.active) return null;
  const close = () => { child.dispose(); props.close(); }; const data = state.success?.data; const busy = state.phase === 'loading';
  return <div className="iw-popover" role="dialog" aria-label={`选择${label}候选`} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}><div className="iw-pop-head"><strong>选择{label}</strong><UIButton type="button" className="iw-text-button" aria-label={`关闭${label}选择`} onClick={close}>×</UIButton></div>
    <form className="party-candidate-search" onSubmit={event => { event.preventDefault(); void query.run({ search, page: 1, pageSize: 20 }); }}><UIInput ref={input} className="iw-search" aria-label={`搜索${label}候选`} maxLength={200} value={search} onChange={nextValue => setSearch(nextValue)} /><UIButton type="submit" className="iw-button" disabled={busy}>搜索</UIButton></form>
    {busy && <p className="iw-inline-state" role="status">正在读取候选…</p>}
    {state.phase === 'error' && <p className="iw-inline-state" role="alert">候选暂不可读取，已选值未改变。<UIButton type="button" className="iw-link" onClick={() => { if (state.request) void query.run(state.request.parameters); }}>重试候选</UIButton></p>}
    <div className="iw-option-list"><UIButton type="button" className="iw-option iw-all-option" onClick={() => { props.onChange(null); close(); }}>清空选择</UIButton>{state.phase === 'success' && data?.items.map(item => <UIButton type="button" className="iw-option" key={item.id} onClick={() => { props.onChange(item); close(); }}><span>{item.name}</span><span className="party-candidate-code">{item.code}</span></UIButton>)}{state.phase === 'success' && data?.items.length === 0 && <p className="iw-inline-state">没有匹配的启用{label}</p>}</div>
    {state.phase === 'success' && data && <footer><span>共 {data.total} 项 · 第 {data.page} 页</span><div className="iw-actions"><UIButton type="button" className="iw-text-button" disabled={data.page <= 1 || busy} onClick={() => { if (state.success) void query.run({ ...state.success.parameters, page: data.page - 1 }); }}>上一页</UIButton><UIButton type="button" className="iw-text-button" disabled={data.page * data.pageSize >= data.total || busy} onClick={() => { if (state.success) void query.run({ ...state.success.parameters, page: data.page + 1 }); }}>下一页</UIButton></div></footer>}
  </div>;
}
