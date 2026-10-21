import { useLayoutEffect, useState } from 'react';
import { ExclusivePopupController, type PopupOwnership } from '../demo-controls/popup-ownership.ts';
import type { ReadScope } from '../loading/read-scope.ts';

export interface SalesReferencePopupHost {
  readonly controller: ExclusivePopupController;
  /** Associate the current lease with its existing trigger/popup DOM, not a portal. */
  readonly attach: (ownership: PopupOwnership, element: HTMLElement) => () => void;
}

/** One listener/ownership host per sales page. Replay gets a fresh controller;
 * neither an abandoned StrictMode effect nor a closed route can be reused. */
export function useSalesReferencePopupHost(scope: ReadScope): SalesReferencePopupHost | null {
  const [owned, setOwned] = useState<{ scope: ReadScope; host: SalesReferencePopupHost } | null>(null);
  useLayoutEffect(() => {
    const controller = new ExclusivePopupController();
    let current: { ownership: PopupOwnership; element: HTMLElement } | null = null;
    const host: SalesReferencePopupHost = {
      controller,
      attach: (ownership, element) => {
        if (!ownership.active) return () => {};
        current = { ownership, element };
        return () => { if (current?.ownership === ownership) current = null; };
      },
    };
    const outside = (event: PointerEvent) => {
      const inside = current && (event.composedPath().includes(current.element)
        || event.target instanceof Node && current.element.contains(event.target));
      controller.outside(inside ? current?.ownership ?? null : null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && controller.escape()) { event.preventDefault(); event.stopPropagation(); }
    };
    const detachEvents = () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
    };
    const abort = () => { detachEvents(); controller.dispose(); current = null; setOwned(null); };
    scope.signal.addEventListener('abort', abort, { once: true });
    if (scope.active) {
      document.addEventListener('pointerdown', outside, true);
      document.addEventListener('keydown', escape, true);
      setOwned({ scope, host });
    } else abort();
    return () => {
      scope.signal.removeEventListener('abort', abort);
      detachEvents();
      controller.dispose(); current = null;
    };
  }, [scope]);
  return owned?.scope === scope && !owned.host.controller.disposed ? owned.host : null;
}
