export function createReferenceImportController(client) {
  const state={visible:false,busy:false,batch:null,preview:null,result:null,error:'',pendingId:'',selected:[],queryBatchId:''};
  const listeners=new Set(),emit=()=>listeners.forEach(fn=>fn({...state}));
  const change=values=>{Object.assign(state,values);emit();};
  async function run(work){if(state.busy)return;change({busy:true,error:''});try{return await work();}catch(error){change({error:error.message||'操作未完成'});if(error.code==='PENDING_VERIFICATION')change({pendingId:error.requestId||state.pendingId});throw error;}finally{change({busy:false});}}
  return {state,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},open(){change({visible:true});},close(){if(!state.busy)change({visible:false});},
    load(batch){if(state.busy||state.pendingId)throw new Error('请先查询原请求结果');if(!batch||typeof batch!=='object'||!Array.isArray(batch.rows))throw new Error('请选择资料导入 JSON 文件');change({batch,preview:null,result:null,selected:[],queryBatchId:batch.batchId||'',error:''});},
    select(keys){if(!state.busy&&!state.pendingId)change({selected:keys});},
    preflight(){return run(async()=>{if(state.pendingId)throw new Error('请先查询原请求结果');const preview=await client.request('/imports/references/preflight',state.batch,{mode:'query'});change({preview,result:null,selected:preview.rows.filter(r=>r.status!=='FAILED').map(r=>r.rowKey)});return preview;});},
    confirm(){return run(async()=>{if(state.pendingId)throw new Error('请先查询原请求结果');if(!state.preview||!state.selected.length)throw new Error('请预检并选择通过的行');
      const requestKey=crypto.randomUUID();change({pendingId:requestKey});
      try{const result=await client.request('/imports/references/commit',{...state.batch,preflightHash:state.preview.preflightHash,selectedRowKeys:state.selected,confirmed:true,requestKey},{operationId:'imports.referenceCommit',objectId:state.batch.batchId});
        change({result,pendingId:''});return result;
      }catch(error){if(error.code!=='PENDING_VERIFICATION')change({pendingId:''});if(['PREFLIGHT_CHANGED','REVISION'].includes(error.code))change({preview:null,selected:[]});throw error;}});},
    recover(){return run(async()=>{const requestId=state.pendingId;if(!requestId)throw new Error('没有待核实的请求');const resolution=await client.result(requestId,'imports.referenceCommit');
      if(resolution.resolution==='COMMITTED'){change({result:resolution.originalResponse,pendingId:''});client.complete(requestId);}
      else if(resolution.resolution==='ROLLED_BACK'){client.complete(requestId);change({pendingId:'',preview:null,selected:[],error:'原请求未提交，请重新预检并确认'});}
      else change({error:'原请求仍待核实，请稍后查询'});return resolution;});},
    lookup(batchId){return run(async()=>{const result=await client.request('/imports/references/result?'+new URLSearchParams({batchId}),undefined,{mode:'query'});change({result,queryBatchId:batchId});return result;});},
    restorePending(){const pending=client.pending().find(r=>r.operationId==='imports.referenceCommit');if(pending)change({pendingId:pending.requestId,queryBatchId:pending.objectId||''});}
  };
}
