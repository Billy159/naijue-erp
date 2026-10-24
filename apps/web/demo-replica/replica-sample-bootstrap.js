/* Phase-one local Demo samples only. Not production authentication or business evidence. */
(() => {
  const M = window.MASTER_DATA;
  if (!M || window.REAL_DATA_MODE) throw Error('Replica requires isolated Demo sample mode');
  const sampleId = 'demo-replica-phase1-admin';
  const data = structuredClone(M.data);
  if (!data.staff.some(row => row.id === sampleId)) {
    data.staff.push({id:sampleId,code:'DEMO-REPLICA',name:'副本样例管理员',role:'管理员',storeId:'',enabled:true,employmentStatus:'在职',loginEnabled:true,loginName:'replica-sample',authVersion:1});
    localStorage.setItem(M.key, JSON.stringify(data));
  }
  // This new localhost origin contains only copied Demo samples; no credential is created.
  if (!new URLSearchParams(location.search).has('sample-login')) {
    localStorage.setItem(M.authKey, JSON.stringify({id:sampleId,version:1,expires:Date.now()+8*3600000}));
  } else {
    localStorage.removeItem(M.authKey);
  }
  addEventListener('DOMContentLoaded', () => {
    const mark = document.createElement('div');
    mark.textContent = '冻结 Demo 副本 · 本机样例 · 未接正式业务';
    mark.style.cssText = 'position:fixed;right:8px;bottom:6px;z-index:99999;font:11px Arial;background:#fff4de;color:#64420b;border:1px solid #bc9449;padding:3px 6px;pointer-events:none';
    document.body.append(mark);
  }, {once:true});
})();
