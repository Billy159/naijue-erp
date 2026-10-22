import { useEffect, useState } from 'react';
import { LatestQuery, type QueryRead } from '../../loading/latest-query.ts';
import { ReadScope } from '../../loading/read-scope.ts';
import { HttpQueryError } from '../../transport/http-query.ts';
import type { CatalogueSettingsPageProps } from './contracts.ts';

export interface CatalogueReadOwner<P, D> {
  readonly scope: ReadScope;
  readonly query: LatestQuery<P, D>;
  readonly getAccessFailure: () => 'unauthenticated' | 'forbidden' | null;
}
let sequence = 0;
/** Every StrictMode activation and replaced identity owns a fresh child scope. No
 * caller scope is disposed by a leaf; abandoned reads cannot deliver facts or denial. */
export function useCatalogueReadOwner<P, D>(props: CatalogueSettingsPageProps, execute: (read: QueryRead<P>) => Promise<D>, initial: P): CatalogueReadOwner<P, D> | null {
  const [owner, setOwner] = useState<(CatalogueReadOwner<P, D> & { parent: ReadScope; execute: typeof execute; onAccessFailure: typeof props.onAccessFailure }) | null>(null);
  useEffect(() => {
    const abort = () => scope.dispose();
    const scope = new ReadScope(props.scope.identity, `${props.scope.routeInstanceId}:catalogue:${++sequence}`, null, () => props.scope.signal.removeEventListener('abort', abort));
    props.scope.signal.addEventListener('abort', abort, { once: true });
    if (!props.scope.active) scope.dispose();
    let accessFailure: 'unauthenticated' | 'forbidden' | null = null;
    const query = new LatestQuery<P, D>({ scope, execute: async read => {
      try { return await execute(read); } catch (error) {
        if (!read.signal.aborted && scope.active && error instanceof HttpQueryError && (error.kind === 'unauthenticated' || error.kind === 'forbidden')) {
          accessFailure = error.kind; scope.dispose();
          try { props.onAccessFailure(error.kind); } catch { /* Private facts are already cleared. */ }
        }
        throw error;
      }
    } });
    setOwner({ scope, query, getAccessFailure: () => accessFailure, parent: props.scope, execute, onAccessFailure: props.onAccessFailure });
    queueMicrotask(() => { if (scope.active) void query.run(initial); });
    return () => { scope.dispose(); query.dispose(); };
  }, [props.scope, execute, props.onAccessFailure]);
  return owner?.parent === props.scope && owner.execute === execute && owner.onAccessFailure === props.onAccessFailure ? owner : null;
}
