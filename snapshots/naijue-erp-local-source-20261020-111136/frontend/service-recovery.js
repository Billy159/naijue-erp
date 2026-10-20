/* Query original results without resubmitting writes or interrupting an input. */
(function () {
  'use strict';
  const panel = document.createElement('aside');
  panel.className = 'service-recovery'; panel.hidden = true; panel.setAttribute('aria-label', '待核实操作');
  document.body.append(panel);
  const statuses = new Map();
  let signature = '', querying = false, generation = 0;
  function paint() {
    if (querying) return;
    const rows = ERP_API.pending().filter(row => row.phase !== 'SUBMITTING');
    const preference = window.ERP_USER_STATE?.snapshot();
    const prefIssue = preference?.owner && preference.message && (preference.blocked || !preference.ready);
    const next = JSON.stringify([rows, [...statuses],prefIssue && preference.message,preference?.inputWarning]);
    if (next === signature) return;
    signature = next; panel.replaceChildren(); panel.hidden = !rows.length && !prefIssue && !preference?.inputWarning;
    if(preference?.inputWarning){const text=document.createElement('p');text.textContent=preference.inputWarning;text.setAttribute('role','alert');panel.append(text);}
    if(prefIssue){const item=document.createElement('div'),text=document.createElement('p'),button=document.createElement('button');text.textContent=preference.message;button.type='button';button.className='btn';button.textContent='重新读取列偏好';button.dataset.reloadPreference='true';item.append(text,button);panel.append(item);}
    for (const row of rows) {
      const item = document.createElement('div'), text = document.createElement('p'), id = document.createElement('small'), button = document.createElement('button');
      text.textContent = statuses.get(row.requestId) || (row.phase==='READBACK_PENDING'?'原请求已提交，最新资料尚未回读':'操作结果未知，输入已保留');
      id.textContent = '请求 ID：' + row.requestId;
      button.type = 'button'; button.className = 'btn'; button.textContent = '查询原请求'; button.dataset.requestResult = row.requestId;
      item.append(text, id, button); panel.append(item);
    }
  }
  async function recoverImport(requestId){const result=await ERP_API.result(requestId,'imports.referenceCommit');if(result.resolution==='COMMITTED'){ERP_API.complete(requestId);window.REFERENCE_IMPORT?.restorePending();return {ok:true,requestId};}return {ok:false,code:result.resolution==='ROLLED_BACK'?'ROLLED_BACK':'PENDING_VERIFICATION',error:result.resolution==='ROLLED_BACK'?'原请求已明确回滚，输入保留':'原资料导入请求结果仍未知，请稍后查询'};}
  panel.addEventListener('click', async event => {
    if(event.target.closest('[data-reload-preference]')){await window.ERP_USER_STATE?.loadPreference();return;}
    const epoch=generation;
    const button = event.target.closest('[data-request-result]'); if (!button || querying || ERP_API.busy || window.SALES_UI?.state.busy || window.TRANSFER_UI?.state.busy) return;
    const requestId = button.dataset.requestResult;
    querying = true; button.disabled = true; button.textContent = '正在查询…';
    try {
      const row = ERP_API.pending().find(item => item.requestId === requestId);
      if(row?.operationId==='correction.confirm')await window.ERP_PAGE_COMPONENTS?.load('correction');
      if(row?.operationId==='imports.referenceCommit')await window.ERP_PAGE_COMPONENTS?.load('imports');
      const result = row?.operationId === 'preferences.save'
        ? await window.ERP_USER_STATE.recoverPreference(requestId)
        : row?.operationId === 'imports.referenceCommit'
          ? await recoverImport(requestId)
        : row?.operationId === 'correction.confirm'
        ? await window.INVENTORY_CORRECTION.recoverRequest(requestId)
        : await window.LEGACY_REAL.recoverRequest(requestId);
      if(epoch!==generation)return;
      statuses.set(requestId, result.ok ? '原请求已提交，已回读最新单据' : result.error);
      window.dispatchEvent(new CustomEvent('erp-request-recovered', { detail: result }));
      if (result.ok || result.code === 'ROLLED_BACK') window.toast?.(result.ok ? '原请求已提交，已回读最新结果' : result.error);
    } catch (error) { if(epoch===generation)statuses.set(requestId, '查询未完成：' + error.message); }
    finally { if(epoch===generation){querying = false; signature = ''; paint();} }
  });
  ERP_API.subscribe(paint);
  window.ERP_USER_STATE?.subscribe(paint);
  window.addEventListener('erp-user-cleared',()=>{generation++;querying=false;statuses.clear();signature='';panel.replaceChildren();panel.hidden=true;});
  window.addEventListener('erp-request-state', paint);
  paint();
})();
