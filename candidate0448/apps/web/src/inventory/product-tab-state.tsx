import { UIButton } from '../components/standard-controls.tsx';
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { LatestQuery, QueryRead, QuerySnapshot } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { createProductQuery } from './product-model.ts';
import type { ProductParameters } from './product-contracts.ts';

/** Local product-panel visibility only. Defaults preserve existing drawer/route reads. */
export const ProductPanelActivity = createContext(true);
export const useProductPanelActive = () => useContext(ProductPanelActivity);
/** Retain successful pages; interrupt in-flight reads while hidden and resume only
 * that same request on return. Explicit user cancellation is never auto-retried. */
export function useProductQueryActivity<P, D>(query: LatestQuery<P, D> | null, initial: P | null, explicitCancellation?: { readonly current: boolean }) {
  const active = useProductPanelActive();
  const cancelled = explicitCancellation?.current === true;
  const owner = useRef<{ query: LatestQuery<P, D>; started: boolean; interrupted: P | null } | null>(null);
  useEffect(() => {
    if (!query) return;
    if (owner.current?.query !== query) owner.current = { query, started: false, interrupted: null };
    const value = owner.current;
    let attached = true;
    const consume = () => { value.started = true; value.interrupted = null; };
    if (cancelled) {
      consume(); query.cancel();
    } else if (!active) {
      const snapshot = query.getSnapshot();
      if (snapshot.phase === 'loading' && snapshot.request) {
        value.interrupted = snapshot.request.parameters as P;
        query.cancel();
      }
    } else queueMicrotask(() => {
      if (!attached || owner.current !== value || query.getSnapshot().phase === 'disposed') return;
      // Cancellation is synchronous intent, even before React commits its UI
      // state. It consumes both a queued first read and a hidden resume ticket.
      if (explicitCancellation?.current) { consume(); return; }
      // An explicit retry may have already started before this queued setup.
      // Do not issue a second transport for that same first attachment.
      if (!value.started && explicitCancellation && query.getSnapshot().phase !== 'idle') { consume(); return; }
      const parameters = value.interrupted ?? (!value.started ? initial : null);
      value.started = true; value.interrupted = null;
      if (parameters !== null) void query.run(parameters);
    });
    return () => { attached = false; };
  }, [query, active, cancelled, explicitCancellation]);
  return active;
}

const idleSnapshot: QuerySnapshot<ProductParameters, never> = Object.freeze({ phase: 'idle', request: null, success: null, error: null });
const emptySnapshot = () => idleSnapshot;
const noSubscription = () => () => {};

export function useProductRead<T>(scope: ReadScope, execute: (read: QueryRead<ProductParameters>) => Promise<T>, validate: (data: T, parameters: Readonly<ProductParameters>) => void) {
  const panelActive = useProductPanelActive();
  const [cancelledScope, setCancelledScope] = useState<ReadScope | null>(null);
  // Intent belongs to the rendered scope, not a passive query attachment.
  // A consumer layout effect can cancel before that attachment even exists;
  // StrictMode replay must not erase it. A genuinely new scope starts afresh.
  const cancellation = useRef({ scope, current: false });
  if (cancellation.current.scope !== scope) cancellation.current = { scope, current: false };
  const cancelledIntent = cancellation.current;
  const cancelled = cancelledScope === scope;
  type Attachment = { readonly scope: ReadScope; readonly query: LatestQuery<ProductParameters, T> };
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const activeAttachment = useRef<Attachment | null>(null);
  const query = attachment?.scope === scope && scope.active ? attachment.query : null;
  const snapshot = useSyncExternalStore<QuerySnapshot<ProductParameters, T>>(query?.subscribe ?? noSubscription, query?.getSnapshot ?? emptySnapshot, query?.getSnapshot ?? emptySnapshot);
  const current = () => activeAttachment.current?.scope === scope && scope.active ? activeAttachment.current : null;
  const read = () => { if (!panelActive || cancellation.current !== cancelledIntent || !scope.active) return; cancelledIntent.current = false; setCancelledScope(null); const value = current(); if (value && scope.entityId) { void value.query.run({ productId: scope.entityId }); } };
  useEffect(() => {
    // Queries, like their scopes, belong to one effect attachment. StrictMode
    // cleanup must not leave the next setup reading through a disposed query.
    const next = createProductQuery(scope, execute, validate);
    const value = { scope, query: next };
    activeAttachment.current = value; setAttachment(value);
    return () => { if (activeAttachment.current === value) activeAttachment.current = null; next.dispose(); };
  }, [scope]);
  useProductQueryActivity(query, scope.entityId ? { productId: scope.entityId } : null, cancelledIntent);
  return { snapshot, read, cancelled, cancel: () => { if (cancellation.current !== cancelledIntent || !scope.active) return; cancelledIntent.current = true; setCancelledScope(scope); const value = current(); if (value) { value.query.cancel(); } } };
}
export function ProductReadState(props: { readonly phase: string; readonly retry: () => void; readonly cancel: () => void; readonly empty: boolean; readonly cancelled: boolean; readonly children: ReactNode }) {
  if (props.phase === 'loading') return <p className="iw-inline-state" role="status">正在读取当前页签… <UIButton type="button" className="iw-link" onClick={props.cancel}>取消读取</UIButton></p>;
  if (props.phase === 'error') return <div className="iw-inline-state" role="alert">当前页签暂不可读取，未显示其他商品资料。<UIButton type="button" className="iw-link" onClick={props.retry}>重试</UIButton></div>;
  if (props.phase === 'disposed') return null;
  if (props.phase !== 'success') return props.cancelled ? <p className="iw-inline-state" role="status">读取已取消。<UIButton type="button" className="iw-link" onClick={props.retry}>重新读取</UIButton></p> : <p className="iw-inline-state" role="status">正在准备读取当前页签…</p>;
  if (props.empty) return <p className="iw-inline-state">当前商品暂无该页签资料。</p>;
  return <>{props.children}</>;
}
