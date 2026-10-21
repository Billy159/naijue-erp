import ArcoSelect from '@arco-design/web-react/es/Select/index.js';
import type { SelectHandle } from '@arco-design/web-react/es/Select/select.js';
import { useEffect, useRef, useReducer, useState } from 'react';
import type { InventoryPageSizeActionProps } from './inventory-page-size.tsx';
import './inventory-page-size.css';

// NodeNext treats this package's ESM subpath as a CJS namespace in types only.
// Runtime keeps the exact component subpath, while the type-only barrel emits no JS.
const Select = ArcoSelect as unknown as typeof import('@arco-design/web-react').Select;
let stylesheet: Promise<void> | null = null;
export function loadStyles(): Promise<void> {
  if (document.querySelector('[data-inventory-inline],link[data-inventory-page-size-ready]')) return Promise.resolve();
  if (stylesheet) return stylesheet;
  stylesheet = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = new URL('./inventory-page-size.css', import.meta.url).href;
    link.onload = () => { link.dataset.inventoryPageSizeReady = ''; stylesheet = null; resolve(); };
    link.onerror = () => { link.remove(); stylesheet = null; reject(new Error('每页数量样式未加载。')); };
    document.head.append(link);
  });
  return stylesheet;
}

/** Frozen unified-single-select.jsx Choice/nativeData: real Select, tl/150.
 * No global native-select bridge, source data, all-library index or stylesheet. */
export function InventoryPageSizeAction(props: InventoryPageSizeActionProps) {
  const host = useRef<HTMLDivElement>(null);
  const select = useRef<SelectHandle | null>(null);
  useEffect(() => { if (props.focusOnMount && !props.disabled) select.current?.focus(); }, []);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [, refreshPortal] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    // Arco's Portal clears its container ref in React19 StrictMode's effect
    // replay. One post-commit render lets it reattach, without opening a
    // cancelled/disabled control or retaining an off-route popup.
    if (!mounted || !props.open || props.disabled) return;
    let active = true;
    queueMicrotask(() => { if (active) refreshPortal(); });
    return () => { active = false; };
  }, [mounted, props.open, props.disabled]);
  return <div ref={host} className="ui-single-host iw-page-size-arco"><Select ref={select} className="ui-page-size-select" value={String(props.value)} options={[100, 200, 500].map(size => ({ value: String(size), label: `${size}款/页` }))} aria-label="每页商品款数" showSearch={false} allowClear={false} disabled={props.disabled} popupVisible={mounted && props.open && !props.disabled} unmountOnExit getPopupContainer={() => host.current ?? document.body} triggerProps={{ position: 'tl', autoAlignPopupWidth: false, popupStyle: { width: 150 } }} renderFormat={() => <span className="ui-single-tag">{props.value}款/页</span>} onVisibleChange={props.onOpenChange} onChange={(value: string) => { if (value === '100' || value === '200' || value === '500') props.onChange(Number(value) as InventoryPageSizeActionProps['value']); }} /></div>;
}
