import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { LatestQuery, QueryRead, QuerySnapshot } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { createProductQuery } from './product-model.ts';
import type { ProductParameters } from './product-contracts.ts';

const idleSnapshot: QuerySnapshot<ProductParameters, never> = Object.freeze({ phase: 'idle', request: null, success: null, error: null });
const emptySnapshot = () => idleSnapshot;
const noSubscription = () => () => {};

export function useProductRead<T>(scope: ReadScope, execute: (read: QueryRead<ProductParameters>) => Promise<T>, validate: (data: T, parameters: Readonly<ProductParameters>) => void) {
  const [cancelled, setCancelled] = useState(false);
  const [attachment, setAttachment] = useState<{ readonly scope: ReadScope; readonly query: LatestQuery<ProductParameters, T> } | null>(null);
  const query = attachment?.scope === scope && scope.active ? attachment.query : null;
  const snapshot = useSyncExternalStore<QuerySnapshot<ProductParameters, T>>(query?.subscribe ?? noSubscription, query?.getSnapshot ?? emptySnapshot, query?.getSnapshot ?? emptySnapshot);
  const read = () => { setCancelled(false); if (scope.entityId) void query?.run({ productId: scope.entityId }); };
  useEffect(() => {
    // Queries, like their scopes, belong to one effect attachment. StrictMode
    // cleanup must not leave the next setup reading through a disposed query.
    const next = createProductQuery(scope, execute, validate);
    setAttachment({ scope, query: next });
    setCancelled(false);
    if (scope.entityId) void next.run({ productId: scope.entityId });
    return () => next.dispose();
  }, [scope]);
  return { snapshot, read, cancelled, cancel: () => { setCancelled(true); query?.cancel(); } };
}
export function ProductReadState(props: { readonly phase: string; readonly retry: () => void; readonly cancel: () => void; readonly empty: boolean; readonly cancelled: boolean; readonly children: ReactNode }) {
  if (props.phase === 'loading') return <p className="iw-inline-state" role="status">正在读取当前页签… <button type="button" className="iw-link" onClick={props.cancel}>取消读取</button></p>;
  if (props.phase === 'error') return <div className="iw-inline-state" role="alert">当前页签暂不可读取，未显示其他商品资料。<button type="button" className="iw-link" onClick={props.retry}>重试</button></div>;
  if (props.phase === 'disposed') return null;
  if (props.phase !== 'success') return props.cancelled ? <p className="iw-inline-state" role="status">读取已取消。<button type="button" className="iw-link" onClick={props.retry}>重新读取</button></p> : <p className="iw-inline-state" role="status">正在准备读取当前页签…</p>;
  if (props.empty) return <p className="iw-inline-state">当前商品暂无该页签资料。</p>;
  return <>{props.children}</>;
}
