import {createPortal} from 'react-dom';
import {useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {DocumentScanController} from '../../../../src/components/document-scan-controller.ts';
import type {TransferProposalSession} from '../../../../src/current-form/transfer-proposal.ts';
import {transferProposalLineIdentity} from '../../../../src/current-form/transfer-proposal.ts';

/** Original nonmodal transfer-scan-drawer structure. Exact lookup and draft
 * mutation remain exclusively in the existing DocumentScanController/session. */
export default function TransferScanner(p:{controller:DocumentScanController;session:TransferProposalSession;anchor:HTMLElement;number?:string;busy:boolean;close:()=>void}){
 const state=useSyncExternalStore(p.controller.subscribe,p.controller.getSnapshot,p.controller.getSnapshot),proposal=useSyncExternalStore(p.session.subscribe,p.session.getSnapshot,p.session.getSnapshot);
 const [raw,setRaw]=useState(''),[feedback,setFeedback]=useState<'idle'|'success'|'error'>('idle'),[success,setSuccess]=useState<{key:string;before:string|null;after:string;code:string;name:string;color:string;fit:string;size:string}|null>(null),[failedCode,setFailedCode]=useState(''),[failedReason,setFailedReason]=useState(''),[pendingCount,setPendingCount]=useState(0);
 const input=useRef<HTMLInputElement>(null),list=useRef<HTMLDivElement>(null),composing=useRef(false),attached=useRef(false),retry=useRef<HTMLButtonElement>(null);
 const rawRef=useRef(''),paused=useRef(false),epoch=useRef(0),pending=useRef(0),queue=useRef<Promise<void>>(Promise.resolve()),expectedDraft=useRef<typeof proposal.draft|null>(null),latest=useRef(p);latest.current=p;
 const changeRaw=(value:string)=>{rawRef.current=value;setRaw(value);};
 const pause=(code:string,reason:string)=>{epoch.current++;paused.current=true;setFailedCode(code);setFailedReason(reason);changeRaw('');setFeedback('error');};
 useLayoutEffect(()=>{attached.current=true;document.body.classList.add('transfer-scan-open');input.current?.focus({preventScroll:true});return()=>{attached.current=false;epoch.current++;p.controller.dispose();document.body.classList.remove('transfer-scan-open');if(p.anchor.isConnected)p.anchor.focus({preventScroll:true});};},[p.controller,p.anchor]);
 useEffect(()=>{if(state.phase==='disposed')p.close();},[state.phase]);
 useEffect(()=>{if(feedback!=='success')return;const timer=window.setTimeout(()=>setFeedback('idle'),2700);return()=>window.clearTimeout(timer);},[feedback,success]);
 useLayoutEffect(()=>{if(feedback==='error')retry.current?.focus({preventScroll:true});if(feedback==='success'&&success){const node=Array.from(list.current?.querySelectorAll<HTMLElement>('[data-transfer-sku]')??[]).find(row=>row.dataset.transferSku===success.key);if(node&&list.current){const bounds=node.getBoundingClientRect(),viewport=list.current.getBoundingClientRect();if(bounds.top<viewport.top)list.current.scrollTop+=bounds.top-viewport.top;else if(bounds.bottom>viewport.bottom)list.current.scrollTop+=bounds.bottom-viewport.bottom;}}},[feedback,success]);
 const dismiss=()=>{epoch.current++;p.controller.dispose();p.close();};
 const resume=(restore:boolean)=>{epoch.current++;paused.current=false;expectedDraft.current=p.session.getSnapshot().draft;setFeedback('idle');changeRaw(restore?failedCode:'');requestAnimationFrame(()=>{if(attached.current){input.current?.focus({preventScroll:true});if(restore)input.current?.select();}});};
 const scan=()=>{
  if(composing.current||p.busy||paused.current||!p.session.canScan)return;
  const submitted=rawRef.current.trim();if(!submitted)return;
  const run=epoch.current,hadInputFocus=document.activeElement===input.current;
  if(pending.current===0)expectedDraft.current=p.session.getSnapshot().draft;
  changeRaw('');pending.current++;setPendingCount(pending.current);
  queue.current=queue.current.catch(()=>{}).then(async()=>{
   if(!attached.current||run!==epoch.current)return;
   const owner=latest.current,draft=owner.session.getSnapshot().draft;
   if(owner.busy||!owner.session.canScan||draft!==expectedDraft.current){pause(submitted,'当前单据输入或目标已改变，请核对后重新扫描。');return;}
   const before=new Map(draft.lines.flatMap(line=>line.sku?[[line.sku.id,line.quantity] as const]:[]));setFeedback('idle');
   const ok=await owner.controller.scan(submitted);
   if(!attached.current||run!==epoch.current||owner.controller.getSnapshot().phase==='disposed')return;
   if(ok){
    const after=owner.session.getSnapshot().draft;expectedDraft.current=after;
    const changed=after.lines.find(line=>line.sku&&before.get(line.sku.id)!==line.quantity);
    if(changed?.sku){const identity=transferProposalLineIdentity(changed),labels=changed.sourceSnapshot;setSuccess({key:changed.sku.id,before:before.get(changed.sku.id)??null,after:changed.quantity,code:labels?.productCode??identity.productCode,name:labels?.productName??identity.productName,color:labels?.colorName??identity.colorName,fit:labels?.fitName??identity.fitName,size:labels?.sizeName??identity.sizeName});setFeedback('success');}
    requestAnimationFrame(()=>{if(attached.current&&hadInputFocus&&!paused.current&&(document.activeElement===input.current||document.activeElement===document.body))input.current?.focus({preventScroll:true});});
   }else pause(submitted,owner.controller.getSnapshot().message);
  }).catch(()=>{if(attached.current&&run===epoch.current)pause(submitted,'本次扫码未完成，未自动重试，请核对后重新扫描。');}).finally(()=>{pending.current=Math.max(0,pending.current-1);if(attached.current)setPendingCount(pending.current);if(pending.current===0)expectedDraft.current=null;});
 };
 const rows=proposal.draft.lines.flatMap(line=>line.sku?[line]:[]),locked=p.busy,failed=feedback==='error';
 if(state.phase==='disposed')return null;
 return createPortal(<aside id="transfer-scan-drawer" role="dialog" aria-modal="false" aria-label="调拨扫码录入" onKeyDown={event=>{if(event.key==='Escape'&&!event.nativeEvent.isComposing){event.preventDefault();event.stopPropagation();dismiss();}}}>
  <header className="tsd-header"><h2>扫码录入</h2><span className="tsd-doc" data-transfer-doc>{p.number??'新增调拨单（未保存）'}</span><button type="button" className="tsd-close" aria-label="关闭扫码抽屉" onClick={dismiss}>×</button></header>
  <section className="tsd-feedback" data-transfer-scan-feedback data-state={failed?'error':feedback} role={failed?'alert':'status'} aria-live={failed?'assertive':'polite'}>{failed?<><div className="tsd-feedback-top"><strong>扫码失败 · 已暂停</strong><span className="tsd-feedback-code" title={failedCode}>{failedCode}</span></div><p className="tsd-feedback-reason">{failedReason}</p><div className="tsd-feedback-actions"><button type="button" className="btn" ref={retry} onClick={()=>resume(true)}>重新扫码</button><button type="button" className="btn" onClick={()=>resume(false)}>忽略并继续</button></div></>:feedback==='success'&&success?<><div className="tsd-feedback-top"><strong><span aria-hidden>✓</span> {success.before===null?'新增成功':'数量 +1'}</strong><b>{success.before===null?'当前 '+success.after+' 件':success.before+' → '+success.after}</b></div><p className="tsd-feedback-product"><b>{success.code}</b> {success.name}</p><p className="tsd-feedback-spec">{success.color} / {success.fit} / {success.size}</p></>:<><div className="tsd-feedback-top"><strong>{state.phase==='loading'?'正在核对条码…':pendingCount>0?'已接收条码，等待核对…':'待扫码'}</strong></div><p>{p.busy?'正在提交，请稍候':pendingCount>1?'已接收 '+pendingCount+' 次扫码，正在按顺序核对':'扫描条码并回车，等待下一件商品'}</p></>}</section>
  <div className="tsd-scan-control"><label htmlFor="transfer-scan-input">条码</label><input id="transfer-scan-input" ref={input} type="text" autoComplete="off" spellCheck={false} placeholder={failed?'扫码已暂停，请先处理失败结果':'扫描条码，回车自动录入'} aria-describedby="tsd-scan-hint" value={raw} disabled={locked||failed} onChange={event=>changeRaw(event.target.value)} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();if(!event.nativeEvent.isComposing&&event.keyCode!==229)void scan();}}}/><p id="tsd-scan-hint">{p.session.canScan?'扫描后自动清空，可连续扫描下一件':'可先输入条码；请选择调出和调入仓库后回车核对。'}</p></div>
  <div className="tsd-list-title"><h3>录入明细</h3><span data-transfer-count>{rows.length} 条明细</span></div><div className="tsd-grid-head" aria-hidden>{['款号／商品名称','颜色','版型','尺码','数量','操作'].map(label=><span key={label}>{label}</span>)}</div><div className="tsd-list" data-transfer-list ref={list}>{rows.map(line=>{const sku=line.sku!,identity=transferProposalLineIdentity(line),labels=line.sourceSnapshot,code=labels?.productCode??identity.productCode,name=labels?.productName??identity.productName,color=labels?.colorName??identity.colorName,fit=labels?.fitName??identity.fitName,size=labels?.sizeName??identity.sizeName;return <div className={'tsd-row'+(success?.key===sku.id?' tsd-row-current':'')} data-transfer-sku={sku.id} key={sku.id} title={[code,name,color,fit,size].join(' / ')}><span className="tsd-product"><strong>{code}</strong><span>{name}</span></span><span className="tsd-short">{color}</span><span className="tsd-short">{fit}</span><span className="tsd-size">{size}</span><input data-transfer-qty inputMode="numeric" aria-label={[code,color,size,'数量'].join(' ')} className={/^(?:0|[1-9]\d{0,18})$/.test(line.quantity)?'':'invalid'} value={line.quantity} disabled={locked} onChange={event=>p.session.setQuantity(sku.id,event.target.value)} onBlur={event=>{if(event.currentTarget.value==='0')p.session.removeLine(sku.id);}} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();event.currentTarget.blur();input.current?.focus({preventScroll:true});}}}/><button type="button" className="tsd-delete" aria-label={'删除 '+[code,color,size].join(' ')} disabled={locked} onClick={()=>p.session.removeLine(sku.id)}>删除</button></div>;})}{!rows.length&&<div className="tsd-empty">暂无录入明细。扫码后会出现在这里。</div>}</div>
 </aside>,document.body);
}
