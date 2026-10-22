import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StandardOverlay } from './standard-overlay.tsx';
import { UIButton, UIInput } from './standard-controls.tsx';
import type { DocumentScanController } from './document-scan-controller.ts';
import type { DocumentScanRow } from './document-scan-contracts.ts';
import './document-scan.css';

export function DocumentScan({ controller, title, rows, close, update, remove }: {
  readonly controller: DocumentScanController; readonly title: string; readonly rows: readonly DocumentScanRow[];
  readonly close: () => void; readonly update: (key: string, quantity: string) => void; readonly remove: (key: string) => void;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [raw, setRaw] = useState(''), composing = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const attached = useRef<DocumentScanController | null>(null);
  useLayoutEffect(() => {
    attached.current = controller;
    return () => { attached.current = null; queueMicrotask(() => { if (attached.current !== controller) controller.dispose(); }); };
  }, [controller]);
  if (state.phase === 'disposed') return null;
  const dismiss = () => { controller.dispose(); close(); };
  return <StandardOverlay kind="drawer" nonModal title={title} label={title} closeLabel="关闭扫码抽屉" close={dismiss}
    className="document-scan-drawer" width="min(660px, 100vw)" initialFocus=".document-scan-input input">
    <div className="document-scan-feedback" data-state={state.phase} role="status" aria-live="polite">{state.message}</div>
    <form ref={form} className="document-scan-input" onSubmit={event => {
      event.preventDefault(); if (composing.current || state.phase === 'loading') return;
      const submitted = raw;
      const input = form.current?.querySelector('input'), hadInputFocus = input === input?.ownerDocument.activeElement;
      void controller.scan(submitted).then(ok => {
        if (ok && attached.current === controller) setRaw(value => value === submitted ? '' : value);
        if (!hadInputFocus) return;
        requestAnimationFrame(() => {
          if (attached.current !== controller || controller.getSnapshot().phase === 'disposed' || !input?.isConnected) return;
          const active = input.ownerDocument.activeElement;
          if (active === input || active === input.ownerDocument.body) input.focus({ preventScroll: true });
        });
      });
    }}>
      <label>条码<UIInput aria-label="扫码原条码" autoComplete="off" spellCheck={false} placeholder="扫描条码，回车自动录入"
        value={raw} disabled={state.phase === 'loading'} onChange={setRaw} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} /></label>
      <p>扫描后自动清空，可连续扫描下一件</p><UIButton type="submit" disabled={state.phase === 'loading'}>录入条码</UIButton>
    </form>
    <div className="document-scan-list-title"><h3>录入明细</h3><span>{rows.length} 条明细</span></div>
    <div className="document-scan-grid" role="table" aria-label="扫码实际明细"><div className="document-scan-row document-scan-grid-head" role="row">{['款号／商品名称', '颜色', '版型', '尺码', '数量', '操作'].map(label => <span role="columnheader" key={label}>{label}</span>)}</div>
      {rows.map(row => <div className="document-scan-row" role="row" key={row.key}>
        <span className="document-scan-product" role="cell"><strong>{row.sku.productCode}</strong><span>{row.sku.productName}</span></span>
        <span role="cell">{row.sku.colorName}</span><span role="cell">{row.sku.fitName}</span><span role="cell">{row.sku.sizeName}</span>
        <span role="cell"><UIInput aria-label={`扫码 ${row.sku.skuCode} 数量`} inputMode="numeric" value={row.quantity} onChange={value => update(row.key, value)} /></span>
        <span role="cell"><UIButton type="button" className="iw-link" aria-label={`扫码删除 ${row.sku.skuCode}`} onClick={() => remove(row.key)}>删除</UIButton></span>
      </div>)}
      {!rows.length && <p>尚无录入明细</p>}
    </div>
  </StandardOverlay>;
}
