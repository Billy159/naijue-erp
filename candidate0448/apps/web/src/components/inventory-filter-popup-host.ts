import { useLayoutEffect, useState } from 'react';
import { ExclusivePopupController, type PopupOwnership } from '../demo-controls/popup-ownership.ts';
import type { DemoMultiSelectPopupHost } from '../demo-controls/multi-select.tsx';
import type { ReadScope } from '../loading/read-scope.ts';

/** Page-owned arbitration shared by product search and every reference filter. */
export function useInventoryFilterPopupHost(scope: ReadScope, enabled = true): DemoMultiSelectPopupHost | null {
  const [owned, setOwned] = useState<{ scope: ReadScope; host: DemoMultiSelectPopupHost } | null>(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    const controller = new ExclusivePopupController();
    let current: { ownership: PopupOwnership; element: HTMLElement } | null = null;
    const host: DemoMultiSelectPopupHost = { controller, attach: (ownership, element) => {
      if (!ownership.active) return () => {};
      current = { ownership, element };
      return () => { if (current?.ownership === ownership) current = null; };
    } };
    const outside = (event: Event) => {
      const inside = current && (event.composedPath().includes(current.element) || event.target instanceof Node && current.element.contains(event.target));
      controller.outside(inside ? current?.ownership ?? null : null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && controller.escape()) { event.preventDefault(); event.stopPropagation(); } };
    const detach = () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('click', outside, true); document.removeEventListener('keydown', escape, true); };
    const abort = () => { detach(); controller.dispose(); current = null; setOwned(null); };
    scope.signal.addEventListener('abort', abort, { once: true });
    if (scope.active) { document.addEventListener('pointerdown', outside, true); document.addEventListener('click', outside, true); document.addEventListener('keydown', escape, true); setOwned({ scope, host }); }
    else abort();
    return () => { scope.signal.removeEventListener('abort', abort); detach(); controller.dispose(); current = null; };
  }, [scope, enabled]);
  return enabled && owned?.scope === scope && !owned.host.controller.disposed ? owned.host : null;
}
