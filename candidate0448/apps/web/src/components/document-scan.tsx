import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StandardOverlay } from './standard-overlay.tsx';
import { UIButton, UIInput } from './standard-controls.tsx';
import type { DocumentScanController } from './document-scan-controller.ts';
import type { DocumentScanRow } from './document-scan-contracts.ts';
import './document-scan.css';

export function DocumentScan({ controller, title, rows, close, update, remove, queueContext }: {
  readonly controller: DocumentScanController; readonly title: string; readonly rows: readonly DocumentScanRow[];
  /** Normal sales opt-in. Existing standard consumers retain single-read semantics. */
  readonly queueContext?: { readonly getDraft: () => object; readonly busy: boolean; readonly onPendingChange: (count: number) => void };
  readonly close: () => void; readonly update: (key: string, quantity: string) => void; readonly remove: (key: string) => void;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [raw, setRaw] = useState(''), composing = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const latest=useRef({controller,queueContext}),rawRef=useRef(''),epoch=useRef(0),pending=useRef(0),queue=useRef<Promise<void>>(Promise.resolve()),expectedDraft=useRef<object|null>(null),paused=useRef(false);
  latest.current={controller,queueContext};
  const [pendingCount,setPendingCount]=useState(0),[failure,setFailure]=useState<{code:string;message:string}|null>(null);
  const changeRaw=(value:string)=>{rawRef.current=value;setRaw(value);};
  const clearPending=()=>{pending.current=0;expectedDraft.current=null;latest.current.queueContext?.onPendingChange(0);if(attached.current)setPendingCount(0);};
  const pause=(code:string,message:string)=>{epoch.current++;paused.current=true;clearPending();changeRaw('');setFailure({code,message});};
  const restore=(keepCode:boolean)=>{epoch.current++;paused.current=false;setFailure(null);expectedDraft.current=latest.current.queueContext?.getDraft()??null;changeRaw(keepCode?failure?.code??'':'');requestAnimationFrame(()=>{if(attached.current){const input=form.current?.querySelector('input');input?.focus({preventScroll:true});if(keepCode)input?.select();}});};

  const attached = useRef<DocumentScanController | null>(null);
  useLayoutEffect(() => {
    attached.current = controller;
    return () => { attached.current = null;epoch.current++;if(latest.current.queueContext)clearPending(); queueMicrotask(() => { if (attached.current !== controller) controller.dispose(); }); };
  }, [controller]);
  useEffect(()=>{if(queueContext&&state.phase==='disposed')close();},[state.phase,!!queueContext]);
  useLayoutEffect(()=>{if(failure)form.current?.parentElement?.querySelector<HTMLButtonElement>('.document-scan-feedback button')?.focus({preventScroll:true});},[failure]);
  const submitQueued=()=>{
    const context=latest.current.queueContext;if(!context||context.busy||paused.current||composing.current)return;
    const code=rawRef.current.trim();if(!code)return;const run=epoch.current,hadFocus=document.activeElement===form.current?.querySelector('input');
    if(pending.current===0)expectedDraft.current=context.getDraft();changeRaw('');pending.current++;context.onPendingChange(pending.current);setPendingCount(pending.current);
    queue.current=queue.current.catch(()=>{}).then(async()=>{
      if(!attached.current||run!==epoch.current)return;
      const current=latest.current,context=current.queueContext;
      if(!context||context.busy||context.getDraft()!==expectedDraft.current){pause(code,'当前单据输入或目标已改变，请核对后重新扫描。');return;}
      const ok=await current.controller.scan(code);
      if(!attached.current||run!==epoch.current||current.controller.getSnapshot().phase==='disposed')return;
      if(ok){expectedDraft.current=context.getDraft();if(hadFocus)requestAnimationFrame(()=>{const input=form.current?.querySelector('input');if(attached.current&&run===epoch.current&&!paused.current&&(document.activeElement===input||document.activeElement===document.body))input?.focus({preventScroll:true});});}
      else pause(code,current.controller.getSnapshot().message);
    }).catch(()=>{if(attached.current&&run===epoch.current)pause(code,'本次扫码未完成，未自动重试，请核对后重新扫描。');}).finally(()=>{if(attached.current&&run===epoch.current){pending.current=Math.max(0,pending.current-1);setPendingCount(pending.current);latest.current.queueContext?.onPendingChange(pending.current);if(!pending.current)expectedDraft.current=null;}});
  };
  if (state.phase === 'disposed') return null;
  const dismiss = () => {epoch.current++;if(queueContext)clearPending();controller.dispose();close();};
  return <StandardOverlay kind="drawer" nonModal title={title} label={title} closeLabel="关闭扫码抽屉" close={dismiss}
    className="document-scan-drawer" width="min(660px, 100vw)" initialFocus=".document-scan-input input">
    <div className="document-scan-feedback" data-state={failure?'error':state.phase} role={failure?'alert':'status'} aria-live={failure?'assertive':'polite'}>{failure?<><strong>扫码失败 · 已暂停</strong><p>{failure.code}</p><p>{failure.message}</p><UIButton type="button" onClick={()=>restore(true)}>重新扫码</UIButton><UIButton type="button" onClick={()=>restore(false)}>忽略并继续</UIButton></>:<>{state.message}{queueContext&&pendingCount>1&&<p>已接收 {pendingCount} 次扫码，正在按顺序核对。</p>}</>}</div>
    <form ref={form} className="document-scan-input" onSubmit={event => {
      event.preventDefault();if(queueContext){submitQueued();return;} if (composing.current || state.phase === 'loading') return;
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
        value={raw} disabled={queueContext?queueContext.busy||!!failure:state.phase === 'loading'} onChange={queueContext?changeRaw:setRaw} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} /></label>
      <p>扫描后自动清空，可连续扫描下一件</p><UIButton type="submit" disabled={queueContext?queueContext.busy||!!failure:state.phase === 'loading'}>录入条码</UIButton>
    </form>
    <div className="document-scan-list-title"><h3>录入明细</h3><span>{rows.length} 条明细</span></div>
    <div className="document-scan-grid" role="table" aria-label="扫码实际明细"><div className="document-scan-row document-scan-grid-head" role="row">{['款号／商品名称', '颜色', '版型', '尺码', '数量', '操作'].map(label => <span role="columnheader" key={label}>{label}</span>)}</div>
      {rows.map(row => <div className="document-scan-row" role="row" key={row.key}>
        <span className="document-scan-product" role="cell"><strong>{row.sku.productCode}</strong><span>{row.sku.productName}</span></span>
        <span role="cell">{row.sku.colorName}</span><span role="cell">{row.sku.fitName}</span><span role="cell">{row.sku.sizeName}</span>
        <span role="cell"><UIInput aria-label={`扫码 ${row.sku.skuCode} 数量`} inputMode="numeric" disabled={!!queueContext?.busy} value={row.quantity} onChange={value => update(row.key, value)} /></span>
        <span role="cell"><UIButton type="button" className="iw-link" aria-label={`扫码删除 ${row.sku.skuCode}`} disabled={!!queueContext?.busy} onClick={() => remove(row.key)}>删除</UIButton></span>
      </div>)}
      {!rows.length && <p>尚无录入明细</p>}
    </div>
  </StandardOverlay>;
}
