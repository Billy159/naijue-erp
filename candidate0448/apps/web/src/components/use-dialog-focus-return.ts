import { useLayoutEffect, useRef } from 'react';
import type { ReadScope } from '../loading/read-scope.ts';

/** Capture the real click target before native dialog auto-focus. Restore only after
 * the close commit, and never steal a newer navigation/dialog/control's focus. */
export function useDialogFocusReturn(scope: ReadScope, open: boolean) {
  const trigger = useRef<HTMLElement | null>(null), pending = useRef<{ readonly trigger: HTMLElement; readonly generation: number } | null>(null);
  const generation = useRef(0), attached = useRef(false);
  useLayoutEffect(() => {
    attached.current = true; trigger.current = null; pending.current = null; generation.current++;
    const abort = () => { pending.current = null; trigger.current = null; generation.current++; };
    scope.signal.addEventListener('abort', abort, { once: true });
    return () => { attached.current = false; scope.signal.removeEventListener('abort', abort); abort(); };
  }, [scope]);
  useLayoutEffect(() => {
    if (open || !pending.current) return;
    const ticket = pending.current;
    queueMicrotask(() => {
      if (pending.current !== ticket || generation.current !== ticket.generation || !attached.current || !scope.active) return;
      pending.current = null;
      const element = ticket.trigger, document = element.ownerDocument;
      if (!element.isConnected || element.matches(':disabled') || element.closest('[hidden],[inert]') || document.querySelector('dialog[open],.erp-overlay')) return;
      const active = document.activeElement;
      if (active && active !== document.body && active !== element && active.isConnected) return;
      const style = document.defaultView?.getComputedStyle(element);
      if (style?.display === 'none' || style?.visibility === 'hidden') return;
      element.focus({ preventScroll: true });
    });
  }, [scope, open]);
  return {
    capture(element: HTMLElement) { generation.current++; pending.current = null; trigger.current = element; },
    request() { if (attached.current && scope.active && trigger.current) pending.current = { trigger: trigger.current, generation: generation.current }; },
  };
}

/** Native dialog teardown may restore its remembered opener even after a host has
 * already focused a newer route/control. Preserve that explicit outside focus. */
export function closeNativeDialog(dialog: HTMLDialogElement | null): void {
  if (!dialog?.open) return;
  const document = dialog.ownerDocument, focused = document.activeElement;
  const outside = focused instanceof HTMLElement && focused !== document.body && !dialog.contains(focused) ? focused : null;
  if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
  if (outside?.isConnected && !outside.matches(':disabled') && !outside.closest('[hidden],[inert]')) outside.focus({ preventScroll: true });
}
