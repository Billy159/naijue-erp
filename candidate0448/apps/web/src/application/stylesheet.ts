import type { RouteStylesheet } from './contracts.ts';

/** Explicit same-origin asset; construction performs no DOM insertion or network activity. */
export function createRouteStylesheet(options: { readonly document: Document; readonly origin: string; readonly href: string }): RouteStylesheet {
  let origin: URL, url: URL;
  try { origin = new URL(options.origin); url = new URL(options.href, options.origin); }
  catch { throw new TypeError('Explicit same-origin stylesheet configuration is required.'); }
  if (origin.protocol !== 'https:' || origin.origin !== options.origin || url.origin !== origin.origin
    || url.username || url.password || url.hash || url.search || !url.pathname.endsWith('.css') || !options.document?.head) {
    throw new TypeError('An explicit trusted HTTPS stylesheet asset is required.');
  }
  let element: HTMLLinkElement | null = null, pending: Promise<void> | null = null, disposed = false;
  let rejectPending: ((error: Error) => void) | null = null;
  return Object.freeze({
    load(): Promise<void> {
      if (disposed) return Promise.reject(new Error('Stylesheet owner is disposed.'));
      if (pending) return pending;
      pending = new Promise<void>((resolve, reject) => {
        rejectPending = reject;
        const link = options.document.createElement('link'); element = link;
        link.rel = 'stylesheet'; link.href = url.href;
        link.onload = () => { link.onload = null; link.onerror = null; rejectPending = null; resolve(); };
        link.onerror = () => {
          link.onload = null; link.onerror = null; link.remove(); element = null; pending = null; rejectPending = null;
          reject(new Error('Required route stylesheet did not load.'));
        };
        options.document.head.append(link);
      });
      return pending;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (element) { element.onload = null; element.onerror = null; element.remove(); element = null; }
      rejectPending?.(new Error('Stylesheet owner is disposed.'));
      rejectPending = null; pending = null;
    },
  });
}
