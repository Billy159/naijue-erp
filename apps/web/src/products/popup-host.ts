import { useMemo } from 'react';
import { useInventoryFilterPopupHost } from '../components/inventory-filter-popup-host.ts';
import type { DemoMultiSelectPopupHost } from '../demo-controls/multi-select.tsx';
import type { PopupOwnership } from '../demo-controls/popup-ownership.ts';
import type { ReadScope } from '../loading/read-scope.ts';

export function productPopupPosition(anchor: Pick<DOMRect,'left'|'top'|'bottom'|'width'>, popup: { readonly width: number; readonly height: number }, viewport: { readonly width: number; readonly height: number }) {
  const width = Math.max(1, Math.min(Math.max(anchor.width, popup.width, 300), viewport.width - 24));
  const maxHeight = Math.max(1, viewport.height - 24), height = Math.min(popup.height || 320, maxHeight);
  const below = viewport.height - anchor.bottom - 12, above = anchor.top - 12;
  const top = below >= height || below >= above ? Math.min(anchor.bottom + 4, viewport.height - height - 12) : anchor.top - height - 4;
  return { width, maxHeight, left: Math.max(12, Math.min(anchor.left, viewport.width - width - 12)), top: Math.max(12, top) };
}
/** The frozen filter row scrolls horizontally. Its local Arco portals would otherwise
 * be clipped by overflow:auto. Keep those portals inside their owning control/identity,
 * but position their actual trigger in viewport space; never reparent facts to body. */
export function attachProductPopupViewport(element: HTMLElement, ownership: PopupOwnership, signal: AbortSignal): () => void {
  let frame: number | null = null, disposed = false; const touched = new Set<HTMLElement>();
  const update = () => {
    frame = null; if (disposed || signal.aborted || !ownership.active || !element.isConnected) return;
    const anchor = element.querySelector<HTMLElement>('.arco-select,.arco-tree-select') ?? element;
    const rect = anchor.getBoundingClientRect();
    for (const popup of Array.from(element.querySelectorAll<HTMLElement>('.arco-trigger'))) {
      const bounds = popup.getBoundingClientRect();
      const position = productPopupPosition(rect, bounds, { width: window.innerWidth, height: window.innerHeight });
      popup.dataset.productViewportPopup = ''; touched.add(popup);
      for (const [key, value] of Object.entries(position)) {
        const name = `--pm-popup-${key}`, text = `${value}px`;
        if (popup.style.getPropertyValue(name) !== text) popup.style.setProperty(name, text);
      }
    }
  };
  const schedule = () => { if (!disposed && frame === null) frame = window.requestAnimationFrame(update); };
  const observer = new MutationObserver(schedule); observer.observe(element, { childList: true, subtree: true });
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule); resize?.observe(element);
  document.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule); window.visualViewport?.addEventListener('resize', schedule); window.visualViewport?.addEventListener('scroll', schedule);
  const dispose = () => {
    if (disposed) return; disposed = true; observer.disconnect(); resize?.disconnect(); if (frame !== null) window.cancelAnimationFrame(frame);
    document.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule); signal.removeEventListener('abort', dispose);
    for (const popup of touched) { delete popup.dataset.productViewportPopup; for (const key of ['width','maxHeight','left','top']) popup.style.removeProperty(`--pm-popup-${key}`); } touched.clear();
  };
  signal.addEventListener('abort', dispose, { once: true }); if (signal.aborted) dispose(); else schedule();
  return dispose;
}
export function useProductsFilterPopupHost(scope: ReadScope, enabled = true): DemoMultiSelectPopupHost | null {
  const host = useInventoryFilterPopupHost(scope, enabled);
  return useMemo(() => host ? { controller: host.controller, attach(ownership: PopupOwnership, element: HTMLElement) {
    const detach = host.attach(ownership, element), detachViewport = attachProductPopupViewport(element, ownership, scope.signal);
    return () => { detachViewport(); detach(); };
  } } : null, [host, scope]);
}
