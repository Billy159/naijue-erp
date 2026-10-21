import { useLayoutEffect, useRef, useState } from 'react';
import { ExclusivePopupController, type PopupOwnership } from '../demo-controls/popup-ownership.ts';
import { useAnchoredPopover } from '../demo-presentation/anchored-popover.ts';
import type { ReadScope } from '../loading/read-scope.ts';

/** Settings-only DOM adapter for the existing pure popup lifecycle. No reads,
 * global singleton, portal or presentation changes. Inventory candidates still
 * have their own host; cross-control arbitration belongs to that shared host. */
export function useInventorySettingsPopup(scope: ReadScope) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const current = useRef<PopupOwnership | null>(null);
  const position = useAnchoredPopover(open, trigger);
  useLayoutEffect(() => {
    if (!open) return;
    if (!scope.active) { setOpen(false); return; }
    // Each activation owns its controller, including setup/cleanup replay. A
    // permanently disposed instance is never retained by the next activation.
    const controller = new ExclusivePopupController();
    let attached = true;
    const ownership = controller.open({ signal: scope.signal, onClose: reason => {
      if (!attached) return;
      setOpen(false);
      if ((reason === 'close' || reason === 'escape') && trigger.current?.isConnected) trigger.current.focus();
    } });
    current.current = ownership;
    const outside = (event: Event) => {
      const path = event.composedPath();
      const inside = [trigger.current, panel.current].some(element => element &&
        (path.includes(element) || event.target instanceof Node && element.contains(event.target)));
      controller.outside(inside ? ownership : null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && controller.escape()) { event.preventDefault(); event.stopPropagation(); }
    };
    const detach = () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('click', outside, true);
      document.removeEventListener('keydown', escape, true);
    };
    // Pointerdown dismisses before another control takes focus. Click also
    // supports keyboard/assistive activation that has no preceding pointerdown.
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('click', outside, true);
    document.addEventListener('keydown', escape, true);
    scope.signal.addEventListener('abort', detach, { once: true });
    // The initial anchored render is deliberately hidden until positioned.
    // Browsers cannot focus its checkbox until the visible placement commits.
    if (position.visibility !== 'hidden') panel.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();
    return () => {
      attached = false;
      scope.signal.removeEventListener('abort', detach);
      detach(); controller.dispose();
      if (current.current === ownership) current.current = null;
    };
  }, [open, scope, position.visibility]);
  return { open, trigger, panel, position, toggle: () => {
    if (current.current?.active) current.current.close();
    else if (scope.active) setOpen(value => !value);
  }, close: () => { current.current?.close(); } };
}
