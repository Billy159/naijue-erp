export { act, createElement, StrictMode } from 'react';
export { createRoot } from 'react-dom/client';
export { ProductDrawerHost } from '../apps/web/src/inventory/product-drawer-host.tsx';
export { ReadContext, ReadScope } from '../apps/web/src/loading/read-scope.ts';
export { LatestQuery } from '../apps/web/src/loading/latest-query.ts';
import type { ReadScope } from '../apps/web/src/loading/read-scope.ts';
import type { QueryRead } from '../apps/web/src/loading/latest-query.ts';
import type { ProductParameters } from '../apps/web/src/inventory/product-contracts.ts';
import { useProductRead } from '../apps/web/src/inventory/product-tab-state.tsx';
interface Fact { readonly productId: string; readonly label: string }
export function ScopeProbe(props: { readonly scope: ReadScope; readonly execute: (read: QueryRead<ProductParameters>) => Promise<Fact> }) {
  const { snapshot, read, cancel, cancelled } = useProductRead(props.scope, props.execute, (fact, parameters) => {
    if (fact.productId !== parameters.productId) throw new Error('Independent probe target mismatch');
  });
  return <section data-probe-phase={snapshot.phase}><span>{snapshot.success?.data.label ?? 'NO FACT'}</span><button onClick={read}>Probe read</button><button onClick={cancel}>Probe cancel</button><span>{cancelled ? 'CANCELLED' : 'NOT CANCELLED'}</span></section>;
}
