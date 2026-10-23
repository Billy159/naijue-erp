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

/** Frozen sales-current.js leave(fn): the mounted document owns discard, while
 * the existing frame retains the exact requested navigation until confirmation. */
export interface DocumentLeaveBinding {
  readonly dirty: boolean; readonly canDiscard: boolean; readonly saved: boolean;
  readonly discard: () => boolean;
}
export const DocumentLeaveContext = createContext<((binding: DocumentLeaveBinding | null) => void) | null>(null);
export function useDocumentLeave(binding: DocumentLeaveBinding): void {
  const register = useContext(DocumentLeaveContext), current = useRef(binding); current.current = binding;
  useEffect(() => {
    if (!register) return;
    register({ dirty: binding.dirty, canDiscard: binding.canDiscard, saved: binding.saved,
      discard: () => current.current.canDiscard && current.current.discard() });
    return () => register(null);
  }, [register, binding.dirty, binding.canDiscard, binding.saved]);
}
