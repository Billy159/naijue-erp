/** UI state only. Quantity, authorization, balance versions and posting remain server facts. */
export function correctionChoices(identities, warehouses) {
  const products=new Map((identities.products||[]).filter(p=>p.enabled!==false).map(p=>[p.productId,p]));
  return {warehouses:(warehouses.items||[]).filter(w=>w.enabled!==false),skus:(identities.skus||[]).filter(s=>s.enabled!==false&&products.has(s.productId)).map(s=>{
    const p=products.get(s.productId),size=s.options?.SIZE,color=s.options?.COLOR;
    return {id:s.skuId,productId:p.productId,label:[p.code,p.name,color?.name,s.fitId?`${s.fitId}版`:'',size?.sourceName||size?.name,
      size?.sourceCode||size?.code,`规格 ${s.skuId.slice(-8)}`].filter(Boolean).join(' · ')};
  })};
}
export function createCorrectionController({api,actor=()=>globalThis.MASTER_DATA?.current(),storage=globalThis.sessionStorage,
  uuid=()=>globalThis.crypto.randomUUID(),onCommitted=()=>{}}={}) {
  const emptyInput=()=>({warehouseId:'',skuId:'',unit:'',actualQuantity:'',reason:''});
  const state={visible:false,busy:false,input:emptyInput(),preview:null,changed:false,error:'',
    result:null,balance:null,choices:{warehouses:[],skus:[]},availableUnits:[],unitLoading:false,pendingId:null,owner:null};
  let unitTurn=0;
  const listeners=new Set(),notify=()=>{for(const fn of listeners)fn();};
  const key=id=>'erp-inventory-correction-v1:'+encodeURIComponent(id);
  const permitted=()=>['ADMIN','WAREHOUSE','管理员','仓库人员'].includes(actor()?.role);
  function save(){if(!state.owner)return;try{storage?.setItem(key(state.owner),JSON.stringify({input:state.input,pendingId:state.pendingId}));}catch{/* memory retains the active input */}}
  function owned(){if(!state.owner||state.owner!==actor()?.id){state.visible=false;state.preview=null;throw new Error('登录身份已变化，请重新打开校正');}}
  async function busy(work){if(state.busy)return;state.busy=true;state.error='';notify();try{return await work();}catch(e){state.error=e.message;throw e;}finally{state.busy=false;save();notify();}}
  const pending=()=>api.pending().filter(row=>row.operationId==='correction.confirm');
  async function loadUnits(){
    const turn=++unitTurn,{warehouseId,skuId}=state.input;state.availableUnits=[];
    if(!warehouseId||!skuId){state.unitLoading=false;notify();return;}
    state.unitLoading=true;notify();
    try{
      const data=await api.request('/inventory?'+new URLSearchParams({warehouseId,skuId,size:200,page:1}),undefined,{mode:'query'});owned();
      if(!Array.isArray(data.items)||!Number.isSafeInteger(data.total)||data.total>data.items.length)throw new Error('该原规格的单位范围未能在单次读取中核全');
      const cells=data.items;
      if(turn!==unitTurn)return;
      state.availableUnits=[...new Set(cells.filter(cell=>cell.unit&&!cell.unitConflict&&cell.basis?.reconciled===true).map(cell=>cell.unit))];
      if(!state.availableUnits.includes(state.input.unit))state.input={...state.input,unit:state.availableUnits.length===1?state.availableUnits[0]:''};
      if(!state.availableUnits.length)state.error='此仓库、原规格和单位的库存依据尚未核实';
    }catch(error){if(turn===unitTurn){state.input={...state.input,unit:''};state.error=error.message;}}
    finally{if(turn===unitTurn){state.unitLoading=false;save();notify();}}
  }
  async function readback(id,requestId){
    const record=await api.request('/corrections/'+encodeURIComponent(id),undefined,{mode:'query'});owned();
    const cell=record.correction;
    if(!cell?.unit)throw new Error('校正记录缺少计量单位，结果仍需核实');
    const balance=await api.request('/inventory?'+new URLSearchParams({warehouseId:cell.warehouseId,skuId:cell.skuId,unit:cell.unit,size:1}),undefined,{mode:'query'});owned();
    const exact=balance.items.find(row=>row.warehouseId===cell.warehouseId&&row.skuId===cell.skuId&&row.unit===cell.unit);
    if(!exact||exact.basis?.reconciled!==true)throw new Error('校正后的原规格、单位账面无法核对，结果仍需核实');
    state.result=record;state.balance=exact;state.pendingId=null;state.preview=null;state.changed=false;
    api.complete(requestId,state.owner);save();await onCommitted(record,balance);return {ok:true,record,balance};
  }
  async function recoverRequest(requestId){
    if(state.owner!==actor()?.id){state.owner=actor()?.id;state.visible=false;state.input=emptyInput();++unitTurn;state.availableUnits=[];}
    return busy(async()=>{owned();const result=await api.result(requestId,'correction.confirm');owned();
      if(result.resolution!=='COMMITTED'){
        state.pendingId=result.resolution==='ROLLED_BACK'?null:requestId;
        state.error=result.resolution==='ROLLED_BACK'?'原请求已回滚，可重新核对后提交':'原请求结果仍待核实，输入已保留';
        return {ok:false,code:result.resolution,error:state.error};
      }
      if(!result.documentId)throw new Error('原请求缺少校正来源，仍需核实');
      return readback(result.documentId,requestId);
    });
  }
  return {state,permitted,pending,recoverRequest,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    async open(options={}){if(!permitted())return false;if(state.busy)return false;
      state.owner=actor().id;state.visible=true;state.preview=null;state.result=null;state.balance=null;state.changed=false;state.error='';
      state.input=emptyInput();state.availableUnits=[];++unitTurn;
      try{const saved=JSON.parse(storage?.getItem(key(state.owner))||'null');if(saved?.input)state.input={...state.input,...saved.input};}catch{/* no saved draft */}
      state.pendingId=pending()[0]?.requestId||null;notify();
      await busy(async()=>{
        if(options.target){
          const target=options.target;
          if(!target.warehouseId||!target.skuId||typeof options.productReader?.ensureDetails!=='function'||!Array.isArray(options.warehouses))throw new Error('校正目标身份未核实');
          const detail=await options.productReader.ensureDetails({skuIds:[target.skuId]});owned();
          state.choices=correctionChoices(detail.identities,{items:options.warehouses});
          if(!state.choices.skus.some(row=>row.id===target.skuId)||!state.choices.warehouses.some(row=>row.id===target.warehouseId))throw new Error('原仓库或规格当前不可用于校正');
          if(!state.pendingId)state.input={...emptyInput(),warehouseId:target.warehouseId,skuId:target.skuId,unit:target.unit||''};
        }else{const [identities,warehouses]=await Promise.all([api.request('/runtime/product-identity'),api.request('/reference/warehouses?size=500')]);owned();state.choices=correctionChoices(identities,warehouses);}
        await loadUnits();
      });
      return true;
    },
    close(){if(state.busy)return false;state.visible=false;save();notify();return true;},
    change(field,value){if(state.busy||state.pendingId||state.owner!==actor()?.id)return;state.input={...state.input,[field]:value,...(['warehouseId','skuId'].includes(field)?{unit:''}:{})};state.preview=null;state.result=null;state.changed=false;state.error='';save();notify();if(['warehouseId','skuId'].includes(field))return loadUnits();},
    preview(){return busy(async()=>{owned();if(state.pendingId)throw new Error('请先查询原请求');
      if(state.unitLoading||!state.input.unit)throw new Error('请选择已核实的计量单位后核对差额');
      const result=await api.request('/correction/preview?'+new URLSearchParams(state.input),undefined,{mode:'query'});owned();state.preview=result;state.changed=false;return result;
    });},
    confirm(){return busy(async()=>{owned();if(!state.preview||state.pendingId||!permitted())throw new Error('请先核对最新差额');
      const preview=state.preview,requestId=uuid(),correctionId=uuid();
      const input={warehouseId:preview.warehouseId,skuId:preview.skuId,unit:preview.unit,actualQuantity:preview.actualQuantity,reason:preview.reason,
        expectedBalanceVersion:preview.balanceVersion,expectedVersion:0,correctionId,requestKey:requestId};
      try{
        const record=await api.request('/correction/confirm',input,{operationId:'correction.confirm',objectId:[preview.warehouseId,preview.skuId,preview.unit].join(':'),readback:true});owned();
        return await readback(record.correctionId,requestId);
      }catch(e){
        if(e.code==='BALANCE_CONFLICT'&&e.latest){state.preview=e.latest;state.changed=true;state.error='账面或版本已变化，请核对最新差额后再次确认';}
        else{state.pendingId=pending().find(row=>row.requestId===requestId)?.requestId||null;if(state.pendingId)state.error='校正结果待核实，输入已保留；请查询原请求';}
        throw e;
      }
    });},
  };
}
