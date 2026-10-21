export function createInventoryProductSelectStyles(document: Document) {
  let link: HTMLLinkElement | null = null; let rejectPending: ((error: Error) => void) | null = null;
  let pending: Promise<void> | null = null; let disposed = false;
  return { load(): Promise<void> {
    if (disposed) return Promise.reject(new Error('The product search style owner is disposed.'));
    if (document.querySelector('style[data-inventory-product-select-inline]')) return Promise.resolve();
    if (pending) return pending;
    pending = new Promise<void>((resolve, reject) => {
      rejectPending = reject; const element = document.createElement('link'); link = element;
      element.rel = 'stylesheet'; element.href = new URL('./product-candidate-action.css', import.meta.url).href;
      element.dataset.inventoryProductSelectStyles = '';
      element.onload = () => { element.onload = null; element.onerror = null; rejectPending = null; resolve(); };
      element.onerror = () => { element.onload = null; element.onerror = null; element.remove(); link = null; pending = null; rejectPending = null; reject(new Error('商品搜索样式未加载。')); };
      document.head.append(element);
    }); return pending;
  }, dispose() {
    if (disposed) return; disposed = true;
    if (link) { link.onload = null; link.onerror = null; link.remove(); link = null; }
    rejectPending?.(new Error('The product search style owner is disposed.')); rejectPending = null; pending = null;
  } };
}
