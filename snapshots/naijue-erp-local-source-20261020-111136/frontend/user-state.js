/* Personal display preferences and unsaved inputs; neither is a business record. */
(function(root){
  'use strict';
  const defaults = {category:true,supplierId:false,fitId:false,groupId:false,season:false,subtotal:false,total:true,sizeDescription:false};
  function createUserState({api, storage, actor, announce = () => {}}) {
    let owner = '', binding = '', generation = 0, version = null, settings = {...defaults}, desired = null, saving = false, blocked = false, message = '', inputWarning = '';
    const listeners = new Set();
    const live = () => owner && owner === actor() && binding && binding === api.stateScope;
    const prefix = () => 'erp-user-input-v1:' + encodeURIComponent(binding) + ':' + encodeURIComponent(owner) + ':';
    const key = name => live() ? prefix() + encodeURIComponent(name) : null;
    const snapshot = () => ({owner, version, settings:{...settings}, saving, blocked, message, inputWarning, ready:version !== null});
    const publish = () => {for (const fn of listeners) try{fn(snapshot());}catch{/* display observers cannot alter a save result */}};
    const scrub = (name,value) => ['password','passwordHash','passwordSalt','password_hash','password_salt','csrfToken','token','accessToken'].includes(name) ? undefined : value;
    function saveDraft(name, value) {
      const target = key(name); if (!target) return false;
      try {storage.setItem(target,JSON.stringify({owner,binding,value},scrub));if(inputWarning){inputWarning='';publish();} return true;}
      catch {inputWarning = '浏览器未能保存输入，请保留当前页面并恢复存储'; publish(); return false;}
    }
    function readDraft(name) {
      const target = key(name); if (!target) return null;
      try {const row=JSON.parse(storage.getItem(target)||'null'); return row?.owner===owner && row?.binding===binding ? row.value : null;} catch {return null;}
    }
    function removeDraft(name) {const target=key(name); if(target)try{storage.removeItem(target);}catch{/* leave inaccessible namespaced input */}}
    async function loadPreference() {
      if (!live()) return false;
      const epoch=generation;
      try {
        const value=await api.request('/preferences?viewId=inventory.columns');
        if(epoch!==generation||!live())return false;
        if(value?.viewId!=='inventory.columns'||!Number.isSafeInteger(value.version)||value.version<0||Object.keys(defaults).some(k=>typeof value.settings?.[k]!=='boolean'))throw Error('列偏好响应无效');
        version=value.version;settings=Object.fromEntries(Object.keys(defaults).map(k=>[k,value.settings[k]]));desired=null;
        blocked=api.pending().some(row=>row.operationId==='preferences.save');message=blocked?'列偏好原请求待核实，请查询原请求':'列偏好已读取';publish();return true;
      } catch(error) {if(epoch===generation){message='列偏好读取未完成：'+error.message;publish();}return false;}
    }
    async function savePreference(next) {
      if (!live() || version===null || blocked) {message='列偏好尚未读取或原结果待核实，请先读取或查询原请求';publish();return false;}
      desired=Object.fromEntries(Object.keys(defaults).map(k=>[k,!!next[k]]));settings={...desired};
      if(saving){publish();return false;}
      saving=true;const epoch=generation, submitted=desired;desired=null;publish();
      try {
        const value=await api.request('/preferences',{viewId:'inventory.columns',settings:submitted,expectedVersion:version},{operationId:'preferences.save',objectId:'inventory.columns',readback:true});
        if(epoch!==generation||!live())return false;
        if(value?.version!==version+1||value?.viewId!=='inventory.columns'||Object.keys(defaults).some(k=>value.settings?.[k]!==submitted[k]))throw new api.ServiceError('偏好结果无法核对，请查询原请求',{code:'PENDING_VERIFICATION'});
        version=value.version;const row=api.pending().find(x=>x.operationId==='preferences.save');if(row)api.complete(row.requestId);message='列偏好已保存';saving=false;publish();
        if(desired)return savePreference(desired);
        return true;
      } catch(error) {if(epoch===generation){saving=false;blocked=true;message=error.code==='REVISION'?'其他设备已更新列偏好，当前选择仍保留；请重新读取后选择':error.message;publish();}return false;}
    }
    async function recoverPreference(requestId) {
      const epoch=generation,value=await api.result(requestId,'preferences.save');
      if(epoch!==generation||!live())return {ok:false,code:'AUTH',error:'登录身份已变化'};
      if(value.resolution==='ROLLED_BACK'){blocked=false;message='原偏好请求已明确回滚，请重新读取后选择';publish();return {ok:false,code:'ROLLED_BACK',error:message};}
      if(value.resolution!=='COMMITTED')return {ok:false,code:'PENDING_VERIFICATION',error:'原偏好请求结果仍未知，请稍后查询'};
      if(!await loadPreference())return {ok:false,code:'PENDING_VERIFICATION',error:'原偏好请求已提交，最新偏好尚未读回'};
      if(epoch!==generation||!live())return {ok:false,code:'AUTH',error:'登录身份已变化'};
      api.complete(requestId);blocked=false;message='原偏好请求已提交，已读取最新列偏好';publish();return {ok:true,requestId};
    }
    function activate(employee, stateScope) {
      generation++;owner=employee?.id||'';binding=stateScope||'';version=null;settings={...defaults};desired=null;saving=false;blocked=false;message='';inputWarning='';
      api.configure({stateScope:binding});announce('erp-user-activated',{owner,binding});publish();return loadPreference();
    }
    function deactivate(discard=false) {
      // Stash while the old trusted identity is still active, then clear every visible editor.
      announce('erp-user-leaving',{owner});
      if(discard&&live())try{const names=Array.from({length:storage.length},(_,i)=>storage.key(i)).filter(k=>k?.startsWith(prefix()));for(const name of names)storage.removeItem(name);}catch{/* storage remains scoped and cannot be restored by another actor */}
      generation++;owner='';binding='';version=null;settings={...defaults};desired=null;saving=false;blocked=false;message='';inputWarning='';api.configure({stateScope:''});announce('erp-user-cleared',{});publish();
    }
    return {activate,deactivate,saveDraft,readDraft,removeDraft,key,loadPreference,savePreference,recoverPreference,snapshot,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
  }
  let storage;try{storage=root.sessionStorage;}catch{storage=null;}
  root.ERP_USER_STATE=Object.assign(createUserState({api:root.ERP_API,storage,actor:()=>root.MASTER_DATA?.current()?.id||'',
    announce:(name,detail)=>root.dispatchEvent(new CustomEvent(name,{detail}))}),{createUserState,defaults});
})(globalThis);
