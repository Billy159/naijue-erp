import { ReadScope } from '../loading/read-scope.ts';

/** One bounded activation, linked to the parent without owning its lifetime. */
export function childTransferScope(parent: ReadScope, name: string, entityId: string | null = null): ReadScope {
  let scope: ReadScope;
  const abort = () => scope.dispose();
  scope = new ReadScope(parent.identity, `${parent.routeInstanceId}:${name}`, entityId,
    () => parent.signal.removeEventListener('abort', abort));
  parent.signal.addEventListener('abort', abort, { once: true });
  if (!parent.active) scope.dispose();
  return scope;
}
