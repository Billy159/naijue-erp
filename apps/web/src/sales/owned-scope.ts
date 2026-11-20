import { useEffect, useId, useState } from 'react';
import { ReadScope } from '../loading/read-scope.ts';

/** Effect-owned children survive StrictMode setup/cleanup replay. A disposed
 * child is never reused, including same-target reopening and same-account revocation. */
export function useSalesOwnedScope(parent: ReadScope, kind: string, entityId: string | null): ReadScope | null {
  const instance = useId();
  const [owned, setOwned] = useState<{ parent: ReadScope; entityId: string | null; scope: ReadScope } | null>(null);
  useEffect(() => {
    const scope = new ReadScope(parent.identity, `${parent.routeInstanceId}:${kind}:${instance}`, entityId, () => {});
    const abort = () => { scope.dispose(); setOwned(null); };
    parent.signal.addEventListener('abort', abort, { once: true });
    if (parent.active) setOwned({ parent, entityId, scope }); else abort();
    return () => { parent.signal.removeEventListener('abort', abort); scope.dispose(); };
  }, [parent, kind, entityId, instance]);
  return owned?.parent === parent && owned.entityId === entityId && owned.scope.active ? owned.scope : null;
}
