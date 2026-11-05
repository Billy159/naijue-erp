/** Test observer only. Never clicks, changes routes, mutates business DOM or grants capability. */
export function resolveObservedAction({root,button,kind,documentId,documentNumber,hash,mode}){
  if(!root?.contains(button)||button.disabled||!['sales','transfer'].includes(kind))return null;
  const text=button.textContent?.trim(),route=kind==='sales'?'sales':'transfer';
  if(mode==='WARM_MODIFY'){
    if(text!=='修改'||hash!==`#${route}/view/${encodeURIComponent(documentId)}`||root.querySelector('h1')?.textContent!==(kind==='sales'?'查看销货单':'查看调拨单')||!root.textContent.includes(documentNumber))return null;
    return {mode,action:'MODIFY',kind,documentId,documentNumber,fromHash:hash};
  }
  if(mode!=='FIRST_LIST_OPEN'||hash!==`#${route}`||root.querySelector('h1')?.textContent!==(kind==='sales'?'销货单列表':'调拨单列表'))return null;
  const row=button.closest('tbody tr'),list=button.closest('section.tc-list');if(!row||!list||!root.contains(list))return null;
  const number=row.querySelector('td:nth-child(2) button');if(number?.textContent?.trim()!==documentNumber)return null;
  if(button!==number&&(text!=='查看'||!button.closest('td.ui-action-cell')))return null;
  return {mode,action:button===number?'DOCUMENT_NUMBER':'VIEW',kind,documentId,documentNumber,fromHash:hash};
}
export function isObservedTargetRoute(kind,documentId,hash){const id=encodeURIComponent(documentId);return ['sales','transfer'].includes(kind)&&[`#${kind}/edit/${id}`,`#${kind}/view/${id}`].includes(hash);}
/** Single current observation ticket; repeated/stale arms or cancelled clicks cannot start timing. */
export function createObservationGate(){
  let phase='idle',current=null,sequence=0;
  return Object.freeze({
    phase:()=>phase,
    begin(mode){if(!['FIRST_LIST_OPEN','WARM_MODIFY'].includes(mode)||['arming','armed','running','cancelling'].includes(phase))return null;current={sequence:++sequence,mode,cancelled:false,receipt:null};phase='arming';return current;},
    confirm(ticket,receipt){if(ticket!==current)return false;ticket.receipt=receipt;if(ticket.cancelled)return false;phase='armed';return true;},
    consume(action){if(phase!=='armed'||!action||action.mode!==current.mode)return null;phase='running';return current;},
    cancel(){if(!['arming','armed','running'].includes(phase))return null;current.cancelled=true;phase='cancelling';return current;},
    complete(ticket){if(ticket!==current)return false;phase='terminal';return true;},
  });
}
/** Raw timing windows from observed streamed HTTP completion, not DB timing. */
export function summarizeReadPhases(calls,started,ready,kind){
  if(!Number.isFinite(started)||!Number.isFinite(ready)||ready<started||calls.some(call=>call.phase!=='completed'||call.status!==200||!Number.isFinite(call.completed)||call.completed>ready||call.started<started))throw new TypeError('Only fully completed successful observed calls can have READY timing');
  const detailEndpoint=kind==='sales'?'/sales/detail/query':'/transfers/detail/query';
  const detail=calls.filter(call=>call.endpoint===detailEndpoint&&call.phase==='completed');
  const lastDetailBodyCompletedAt=detail.length?Math.max(...detail.map(call=>call.completed)):null;
  const afterDetail=lastDetailBodyCompletedAt===null?[]:calls.filter(call=>call.endpoint!==detailEndpoint&&call.started>=lastDetailBodyCompletedAt);
  return {totalClickToReadyMs:ready-started,detailRequestCount:detail.length,lastDetailBodyCompletedAt,afterLastDetailBodyToReadyMs:lastDetailBodyCompletedAt===null?null:ready-lastDetailBodyCompletedAt,afterDetailApiRequestCount:afterDetail.length,afterDetailServerRequestIds:afterDetail.map(call=>call.serverRequestId),allRequiredApiRequestCount:calls.length,clock:'browser performance.now; detail completion means streamed body completed, not DB/decoder/paint duration'};
}
