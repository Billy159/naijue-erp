import { useEffect, useId, useState } from 'react';
import { ReadScope } from '../loading/read-scope.ts';
import { childTransferScope } from './scope.ts';

/** A child owns only its current activation. StrictMode cleanup never reuses a
 * disposed scope, and parent identity/session/permission replacement clears it. */
export function useTransferOwnedScope(parent: ReadScope, name: string, entityId: string | null): ReadScope | null {
  const instance = useId();
  const [owner, setOwner] = useState<{ parent: ReadScope; entityId: string | null; scope: ReadScope } | null>(null);
  useEffect(() => {
    const scope = childTransferScope(parent, `${name}:${instance}`, entityId);
    const clear = () => setOwner(null);
    scope.signal.addEventListener('abort', clear, { once: true });
    if (scope.active) setOwner({ parent, entityId, scope });
    return () => { scope.signal.removeEventListener('abort', clear); scope.dispose(); };
  }, [parent, name, entityId, instance]);
  return owner?.parent === parent && owner.entityId === entityId && owner.scope.active ? owner.scope : null;
}
