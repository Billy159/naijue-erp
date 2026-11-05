import { useEffect, useRef, useState } from 'react';
import type { ReadScope } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import type { InventoryFilter, InventoryOutputCapability } from './contracts.ts';
import type { InventoryDisplaySettings } from './inventory-matrix.tsx';
import { createInventoryPrintHtmlAsync, inventoryWorkbookRowsAsync } from './output-adapter.ts';

export interface InventoryOutputContentProps {
  readonly scope: ReadScope;
  readonly capability: InventoryOutputCapability;
  readonly filter: InventoryFilter;
  readonly settings: InventoryDisplaySettings;
  readonly kind: 'export' | 'print';
  readonly titleId: string;
  readonly close: () => void;
}
/** Open-only leaf. Frozen source exportTemplate()/print() markup; existing
 * route/session scope owns authorization, request cancellation and late results. */
export function InventoryOutputContent(props: InventoryOutputContentProps) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(false), [ready, setReady] = useState(false);
  const [preview, setPreview] = useState<{ html: string; sequence: number } | null>(null);
  const operation = useRef<{ controller: AbortController; sequence: number } | null>(null);
  const sequence = useRef(0), attached = useRef(false), frame = useRef<HTMLIFrameElement>(null);
  const cancel = () => { sequence.current++; operation.current?.controller.abort(); operation.current = null; };
  const run = async () => {
    if (!attached.current || !props.scope.active || operation.current) return;
    const own = { controller: new AbortController(), sequence: ++sequence.current };
    operation.current = own; setBusy(true); setError(false); setPreview(null); setReady(false);
    const signal = AbortSignal.any([props.scope.signal, own.controller.signal]);
    const current = () => attached.current && props.scope.active && !signal.aborted && sequence.current === own.sequence;
    try {
      const data = await props.capability.reader.readOutput({ parameters: props.filter, signal, identity: props.scope.identity, routeInstanceId: props.scope.routeInstanceId, entityId: null });
      if (!current()) return;
      if (props.kind === 'print') { const html=await createInventoryPrintHtmlAsync(data,props.filter,props.settings,signal);if(current())setPreview({html,sequence:own.sequence}); }
      else {
        const { createWorkbookRowsAsync } = await import('../components/document-output.tsx');
        if (!current()) return;
        const bytes = await createWorkbookRowsAsync(inventoryWorkbookRowsAsync(data, props.filter, props.settings,signal),{signal});
        if (!current()) return;
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        const link = document.createElement('a'); link.href = url; link.download = '库存状况.xlsx'; link.hidden = true; document.body.append(link);
        try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
        props.close();
      }
    } catch (failure) {
      if (!current()) return;
      setPreview(null); setReady(false);
      if (failure instanceof HttpQueryError && (failure.kind === 'unauthenticated' || failure.kind === 'forbidden')) {
        // The route owner must observe the current active scope before release.
        try { props.capability.onAccessFailure(failure); }
        finally { props.scope.dispose(); }
        return;
      }
      setError(true);
    } finally {
      if (operation.current === own) operation.current = null;
      if (current()) setBusy(false);
    }
  };
  useEffect(() => {
    attached.current = true; let mounted = true;
    const abort = () => { cancel(); setPreview(null); setReady(false); };
    props.scope.signal.addEventListener('abort', abort, { once: true });
    if (props.kind === 'print') queueMicrotask(() => { if (mounted && props.scope.active) void run(); });
    return () => { mounted = false; attached.current = false; props.scope.signal.removeEventListener('abort', abort); cancel(); };
    // Each mounted leaf receives one frozen executed filter/settings snapshot.
  }, [props.scope, props.kind, props.filter, props.settings, props.capability]);
  useEffect(() => {
    if (!ready || !preview) return;
    const doc = frame.current?.contentDocument;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); props.close(); } };
    doc?.addEventListener('keydown', escape);
    return () => doc?.removeEventListener('keydown', escape);
  }, [ready, preview, props.close]);
  if (props.kind === 'export') return <form onSubmit={event => { event.preventDefault(); void run(); }}>
    <header><h2 id={props.titleId}>导出库存</h2><button type="button" className="btn ghost" onClick={props.close} aria-label="关闭导出窗口" title="关闭">×</button></header>
    <div className="iw-export-body"><fieldset disabled={busy}><legend>选择导出模板</legend>
      <label className="iw-export-option"><input type="radio" name="template" value="default" defaultChecked autoFocus/><span><strong>默认库存明细</strong><small>按仓库分别展示，尺码横向排列。</small></span></label>
      <label className="iw-export-option" title="条码、系统货号与零售价尚未接入"><input type="radio" name="template" value="yintai" disabled/><span><strong>银泰库存模板</strong><small>按颜色、尺码合并所选仓库，保留各版型条码。</small><small>条码、系统货号与零售价尚未接入。</small></span></label>
    </fieldset><p className="iw-export-scope">导出当前查询的全部结果，不受分页影响。不包含小计、合计。</p><p className="iw-export-error" role="alert" hidden={!error}>导出失败，请重试。</p></div>
    <footer><button type="button" className="btn" onClick={props.close}>取消</button><button type="submit" className="btn primary" disabled={busy}>{busy ? '导出中…' : error ? '重新导出' : '导出'}</button></footer>
  </form>;
  return <><header><strong id={props.titleId}>库存打印预览</strong><span>已执行查询的全部结果</span><button type="button" className="btn" disabled={!ready || busy} onClick={() => {
    if (!props.scope.active || !ready || !frame.current?.contentWindow) return;
    try { frame.current.contentWindow.focus(); frame.current.contentWindow.print(); } catch { setError(true); }
  }}>打印</button><button type="button" className="btn" onClick={props.close}>关闭</button></header>
    {preview ? <iframe key={preview.sequence} ref={frame} title="库存分区全量打印预览" sandbox="allow-same-origin allow-modals" srcDoc={preview.html} onLoad={() => { if (attached.current && props.scope.active && sequence.current === preview.sequence) setReady(true); }}/>
      : <div className="iw-output-state" role={error ? 'alert' : 'status'}>{error ? '库存打印内容读取失败。' : '正在读取完整查询结果…'}{error && <button type="button" className="btn" onClick={() => void run()}>重试</button>}</div>}
    {preview && error && <p className="iw-export-error" role="alert">打印未完成，请重试。</p>}
  </>;
}
