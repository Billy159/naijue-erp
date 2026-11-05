/** One action stylesheet owner, never a document/global URL cache. */
export interface DemoMultiSelectStyles {
  load(): Promise<void>;
  dispose(): void;
}

/** Called only after first control focus/action. The emitted action is in chunks/. */
export function createDemoMultiSelectStyles(document: Document, href?: string): DemoMultiSelectStyles {
  let link: HTMLLinkElement | null = null;
  let pending: Promise<void> | null = null;
  let rejectPending: ((reason: Error) => void) | null = null;
  let disposed = false;
  return {
    load() {
      if (disposed) return Promise.reject(new Error('The multi-select style owner is disposed.'));
      // Only portable TEST ONLY builders set this after actually inlining this CSS.
      if (document.querySelector('style[data-demo-multi-select-inline]')) return Promise.resolve();
      if (pending) return pending;
      pending = new Promise<void>((resolve, reject) => {
        rejectPending = reject;
        const element = document.createElement('link'); link = element;
        element.rel = 'stylesheet'; element.href = href ?? new URL('./multi-select.css', import.meta.url).href; element.dataset.demoMultiSelectStyles = '';
        element.onload = () => { element.onload = null; element.onerror = null; rejectPending = null; resolve(); };
        element.onerror = () => {
          element.onload = null; element.onerror = null; element.remove(); link = null; pending = null; rejectPending = null;
          reject(new Error('多选样式未加载。'));
        };
        document.head.append(element);
      });
      return pending;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (link) { link.onload = null; link.onerror = null; link.remove(); link = null; }
      rejectPending?.(new Error('The multi-select style owner is disposed.'));
      rejectPending = null; pending = null;
    },
  };
}
