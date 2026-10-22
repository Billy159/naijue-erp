import { createContext, useContext, useEffect, useRef } from 'react';

export interface DocumentNavigationBinding {
  readonly kind: 'transfer' | 'sales';
  readonly view: 'list' | 'new' | 'document';
  readonly canCreate: boolean;
  /** These delegate to existing route gates; false preserves the current view. */
  readonly openCreate: () => boolean;
  readonly showList: () => boolean;
}
export const DocumentNavigationContext = createContext<((binding: DocumentNavigationBinding | null) => void) | null>(null);
/** Optional source-frame binding, not a router or an authorization capability.
 * Preview/custom hosts without this provider keep their original behavior. */
export function useDocumentNavigation(binding: DocumentNavigationBinding): void {
  const register = useContext(DocumentNavigationContext);
  const current = useRef(binding); current.current = binding;
  useEffect(() => {
    if (!register) return;
    register({ kind: binding.kind, view: binding.view, canCreate: binding.canCreate,
      openCreate: () => current.current.openCreate(), showList: () => current.current.showList() });
    return () => register(null);
  }, [register, binding.kind, binding.view, binding.canCreate]);
}
