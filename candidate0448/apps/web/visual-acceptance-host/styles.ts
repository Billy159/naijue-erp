/** TEST APP ONLY. Deliberately separate from the production HTTPS stylesheet owner. */
export interface AcceptanceStylesheet { load(): Promise<void>; dispose(): void }
export function acceptanceStylesheet(document: Document, filename: string): AcceptanceStylesheet {
  const location = document.defaultView?.location;
  if (!location || location.protocol !== 'http:' || location.hostname !== '127.0.0.1'
    || !/^(?:[a-z-]+|chunks\/[a-z-]+)\.css$/.test(filename)) {
    throw new TypeError('The synthetic acceptance app requires an explicit loopback HTTP asset.');
  }
  const url = new URL(filename, new URL('.', location.href));
  let link: HTMLLinkElement | null = null, pending: Promise<void> | null = null;
  let rejectPending: ((error: Error) => void) | null = null, disposed = false;
  return {
    load() {
      if (disposed) return Promise.reject(new Error('The acceptance style owner is disposed.'));
      if (pending) return pending;
      pending = new Promise<void>((resolve, reject) => {
        rejectPending = reject;
        const element = document.createElement('link'); link = element;
        element.rel = 'stylesheet'; element.href = url.href;
        element.onload = () => { element.onload = null; element.onerror = null; rejectPending = null; resolve(); };
        element.onerror = () => { element.remove(); link = null; pending = null; rejectPending = null; reject(new Error('测试页面样式加载失败。')); };
        document.head.append(element);
      });
      return pending;
    },
    dispose() {
      if (disposed) return; disposed = true;
      if (link) { link.onload = null; link.onerror = null; link.remove(); link = null; }
      rejectPending?.(new Error('The acceptance style owner is disposed.')); rejectPending = null; pending = null;
    },
  };
}
