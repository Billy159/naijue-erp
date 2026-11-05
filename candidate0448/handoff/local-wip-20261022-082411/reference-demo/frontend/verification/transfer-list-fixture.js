/* Isolated acceptance data only; never loaded by the normal app. */
(function(){const space=new URLSearchParams(location.search).get('tr-space');if(space!=='list-acceptance-20260915')throw Error('列表夹具仅允许隔离空间');const key='erp-transfer-mock-v1:'+space;if(localStorage.getItem(key))return;
let state=TRANSFER_MOCK_CORE.seed([],ERP_DEMO.products);const sessionId='list-fixture',base=Date.parse('2026-09-01T08:00:00+08:00');
function run(c,now){const next=structuredClone(state),r=TRANSFER_MOCK_CORE.reduce(next,{...c,sessionId},now);if(!r.ok)throw Error(r.error);state=next;return r}
for(let i=1;i<=47;i++){const now=base+((i*7)%15)*86400000+i*1000;run({type:'login',account:i%2?'A':'B'},now);const id='fixture-'+i,lease=run({type:'acquire',docId:id,newToken:id},now).lease;
const q=i%3===0?{'M26001|0|1':3,'M26002|1|9':1}:i%3===1?{'M26001|0|1':2,'M26001|1|2':0}:{'M26002|0|0':2,'M26002|1|2':3,'M26002|1|9':0};
const draft={date:'2026-09-'+String(1+((i*7)%15)).padStart(2,'0'),from:i%4===0?'wenzhou':'main',to:i%4===0?'reserve':'outlet',q,items:[...new Set(Object.keys(q).map(k=>k.split('|')[0]))],hiddenColors:[],scans:[]};
let saved=run({type:'write',kind:'save',docId:id,token:lease.token,baseRevision:0,requestId:id,draft},now).doc;
if([5,10,15,20].includes(i)){saved=run({type:'write',kind:'audit',docId:saved.id,token:lease.token,baseRevision:saved.revision,requestId:id+'audit',draft:saved},now+100).doc;if([10,20].includes(i))saved=run({type:'write',kind:'reverse',docId:saved.id,token:lease.token,baseRevision:saved.revision,requestId:id+'reverse',draft:saved},now+200).doc;}
run({type:'release',docId:saved.id,token:lease.token},now+300);
}
// Explicit imported-source samples; retain their raw historical responsibility value.
state.docs[0].creator='历史导入／未知';state.docs[0].creatorActor=null;state.docs[1].creator='';state.docs[1].creatorActor=null;
localStorage.setItem(key,JSON.stringify(state));})();
