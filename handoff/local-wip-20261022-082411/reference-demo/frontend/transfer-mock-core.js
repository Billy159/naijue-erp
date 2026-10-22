/* Transfer-only mock authority. Browser adapter serializes this reducer under Web Locks.
 * No production authentication, server database, cross-device lock or inventory engine. */
(function(root){'use strict';
const copy=x=>structuredClone(x),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const actor=s=>({id:s.accountId,name:s.name}),fail=(code,error,extra={})=>({ok:false,code,error,...extra});
const accounts={A:{id:'mock-A',name:'张三'},B:{id:'mock-B',name:'李四'},V:{id:'mock-viewer',name:'只读访客'}};
function seed(docs,products){return {docs:copy(docs).map(d=>({...d,status:d.status==='已删除'?'已作废':['已审核','已作废'].includes(d.status)?d.status:'未审核',revision:1,creator:'历史导入／未知',creatorActor:null,auditor:'',history:[],scans:[],created:null,updatedBy:null})),products:copy(products),events:[],sessions:{},leases:{},requests:{},workEvents:{},seq:100,serial:0}}
function reduce(state,c,now=Date.now()){
 // Legacy drafts and previously reversed documents share the same pending state.
 for(const item of state.docs){if(item.status==='已删除')item.status='已作废';else if(!['已审核','已作废'].includes(item.status))item.status='未审核';}
 const at=new Date(now).toISOString(),s=state.sessions[c.sessionId],doc=state.docs.find(d=>d.id===c.docId);
 if(c.type==='login'){const a=accounts[c.account]||accounts.A;state.sessions[c.sessionId]={accountId:a.id,name:a.name,expires:now+8*3600000,permissions:c.account==='V'?['view']:['view','save','audit','reverse'],warehouses:c.warehouses||['main','outlet','wenzhou','reserve']};return {ok:true,session:copy(state.sessions[c.sessionId])}}
 if(c.type==='logout'){if(s)s.expires=0;for(const [k,l] of Object.entries(state.leases))if(l.sessionId===c.sessionId)delete state.leases[k];return {ok:true}}
 if(!s||s.expires<=now)return fail('SESSION','录单会话已失效，未提交内容已保留，请返回原账号处理。');
 if(c.type==='snapshot')return {ok:true,docs:copy(state.docs.filter(d=>!s.operationWarehouses||(s.warehouses.includes(d.from)&&s.warehouses.includes(d.to)))),products:copy(state.products),events:copy(state.events.filter(e=>!s.operationWarehouses||s.warehouses.includes(e.key?.split('|').at(-1)))),workRecords:copy(Object.values(state.workEvents).filter(e=>e.record&&(!s.operationWarehouses||e.actor.id===s.accountId))),session:copy(s)};
 if(doc&&s.operationWarehouses&&(!s.warehouses.includes(doc.from)||!s.warehouses.includes(doc.to)))return fail('PERMISSION','单据不在允许查看范围');
 if(!s.permissions.includes('view'))return fail('PERMISSION','当前账号没有查看权限。');
 const lease=state.leases[c.docId],validLease=lease&&lease.expires>now;
 if(c.type==='release'){if(lease?.sessionId===c.sessionId&&lease.token===c.token)delete state.leases[c.docId];return {ok:true}}
 if(c.type==='acquire'){
  if(!s.permissions.some(p=>['save','reverse'].includes(p)))return fail('PERMISSION','当前账号没有编辑权限。');
  if(validLease&&lease.sessionId!==c.sessionId)return fail('OCCUPIED',lease.actor.name+'正在编辑，当前只读。',{owner:copy(lease.actor)});
  const l=validLease?lease:{sessionId:c.sessionId,actor:actor(s),token:c.newToken,expires:0};l.token=c.newToken;l.expires=now+30000;state.leases[c.docId]=l;return {ok:true,lease:copy(l),doc:copy(doc||null)};
 }
 const identity=()=>!validLease||lease.sessionId!==c.sessionId||lease.token!==c.token?fail('LEASE','编辑资格已失效，本次操作未提交；你的未保存内容已保留。'):null;
 if(c.type==='renew'||c.type==='check'){const e=identity();if(e)return e;if(c.type==='renew')lease.expires=now+30000;return {ok:true,lease:copy(lease),session:copy(s)}}
 // Retry returns the original successful result, never replays a stock mutation.
 const requestKey=c.sessionId+'|'+c.requestId;
 if(c.type==='write'&&state.requests[requestKey]){const old=state.requests[requestKey];if(old.fingerprint!==JSON.stringify({kind:c.kind,docId:c.docId,base:c.baseRevision,draft:c.draft}))return fail('REQUEST','重复请求内容不一致，未执行。');return copy(old.result)}
 const e=identity();if(e)return e;
 if(c.type==='work'){
  if(!s.permissions.includes('save')||['已审核','已作废','已删除'].includes(doc?.status))return fail('READONLY','当前只读，未录入。');
  const key=c.sessionId+'|'+c.eventId;if(state.workEvents[key])return {ok:true,duplicate:true,event:copy(state.workEvents[key])};
  const event={id:c.eventId,type:c.action,actor:actor(s),time:at,clientTime:c.clientTime,input:c.input||'',docId:c.docId};state.workEvents[key]=event;return {ok:true,event:copy(event)};
 }
 // Work outcomes use the existing event store, separately from business revisions/history.
 if(c.type==='work-result'){
  const l=copy(c.record),ev=state.workEvents[c.sessionId+'|'+l.eventId];
  if(!s.permissions.includes('save')||['已审核','已作废','已删除'].includes(doc?.status))return fail('READONLY','当前只读，工作记录未更新。');
  const original=ev||Object.values(state.workEvents).find(e=>e.id===l.eventId&&e.docId===c.docId&&e.record);
  if(!original||original.type!=='scan'||original.docId!==c.docId)return fail('HISTORY','扫码工作记录无效。');
  if(original.record?.undoEvent&&original.record.undoEvent.id!==l.undoEvent?.id)return fail('HISTORY','已记录撤销事实不可覆盖。');
  if(original.record){for(const f of ['id','code','key','before','after','error'])if(!same(original.record[f],l[f]))return fail('HISTORY','原扫码事实不可改写。');}
  if(l.undoEvent){const ue=state.workEvents[c.sessionId+'|'+l.undoEvent.id];if(!ue||ue.type!=='undo'||ue.docId!==c.docId)return fail('HISTORY','撤销工作记录无效。');l.undoEvent.actor=copy(ue.actor);l.undoEvent.serviceTime=ue.time;}
  else if(!ev||original.record?.undoEvent)return fail('HISTORY','原工作记录不可覆盖。');
  l.actor=copy(original.actor);l.time=original.time;l.serviceTime=original.time;l.workRecorded=true;original.record=l;return {ok:true,event:copy(original)};
 }
 if(c.type!=='write')return fail('COMMAND','不支持此操作。');
 if(!['save','audit','reverse','delete'].includes(c.kind))return fail('COMMAND','不支持此写入操作。');
 if(!s.permissions.includes(c.kind==='delete'?'save':c.kind))return fail('PERMISSION','当前账号没有执行此操作的权限。');
 if((doc?.revision||0)!==c.baseRevision)return fail('REVISION','单据已被'+(doc?.updatedBy?.name||'其他账号')+'更新，本次修改未提交。你的未保存内容已保留，请核对最新内容后继续。',{latest:copy(doc)});
 if(c.kind==='delete'){
  if(!doc||doc.status!=='未审核')return fail('STATE','只有已保存的未审核单据可以作废。');
  const next=copy(doc);next.status='已作废';next.revision++;next.updated=at;next.updatedBy=actor(s);next.history.push({id:'tr-event-'+(++state.serial),documentId:next.id,time:at,actor:actor(s),user:s.name,action:'作废',changes:[{field:'status',before:'未审核',after:'已作废'}],result:'成功',version:next.version,revisionBefore:doc.revision,revisionAfter:next.revision});
  state.docs[state.docs.indexOf(doc)]=next;const result={ok:true,doc:copy(next),lease:copy(lease)};state.requests[requestKey]={fingerprint:JSON.stringify({kind:c.kind,docId:c.docId,base:c.baseRevision,draft:c.draft}),result:copy(result)};return result;
 }
 if(['已删除','已作废'].includes(doc?.status))return fail('STATE','已作废单据不能继续操作。');
 if(c.kind==='reverse'?doc?.status!=='已审核':doc?.status==='已审核')return fail('STATE','单据状态已变化，本次操作未执行。');
 const fields=['date','from','to','note','q','items','hiddenColors','scans'];
 const next=copy(doc||{id:c.docId,date:'',from:'',to:'',q:{},items:[],hiddenColors:[],scans:[],history:[],version:1,status:'未审核',revision:0});
 if(c.kind!=='reverse'){for(const f of fields)next[f]=f==='note'?String(c.draft[f]??''):copy(c.draft[f]);if(c.draft.matrixRowIds)next.matrixRowIds=copy(c.draft.matrixRowIds);}
 if(!(s.outgoingWarehouses||s.operationWarehouses||s.warehouses).includes(next.from)||!(s.operationWarehouses||s.warehouses).includes(next.to))return fail('WAREHOUSE','当前账号不能操作所选仓库。');
 if(s.operationWarehouses){next.fromName=doc?.from===next.from&&doc.fromName?doc.fromName:s.warehouseNames?.[next.from]||'';next.toName=doc?.to===next.to&&doc.toName?doc.toName:s.warehouseNames?.[next.to]||'';}
 if(next.from===next.to)return fail('VALIDATION','调出仓和调入仓不能相同。');
 if(!/^\d{4}-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d)?$/.test(next.date)||!Number.isFinite(Date.parse(next.date))||new Date(next.date.slice(0,10)).toISOString().slice(0,10)!==next.date.slice(0,10))return fail('VALIDATION','请填写有效单据日期和时间。');
 const rows=[];
 for(const [key,v] of Object.entries(next.q)){
  if(v!==''&&(!/^\d+$/.test(String(v))||Number(v)>99999))return fail('VALIDATION','数量必须为 0–99999 的整数。');
  if(!Number(v))continue;const [id,ci,si]=key.split('|'),p=state.products.find(p=>p.id===id),color=Number(ci),size=Number(si);
  if(!p||!next.items.includes(id)||!p.colorIds[color]||!p.sizeIds[size]||!Number.isFinite(p.stock[next.from]?.[color]?.[size])||!Number.isFinite(p.stock[next.to]?.[color]?.[size]))return fail('SPEC','商品规格或仓库资料不可用。');
  rows.push({p:id,c:color,s:size,n:Number(v),colorId:p.colorIds[color],sizeId:p.sizeIds[size]});
 }
 if(!rows.length)return fail('VALIDATION','请先扫码或录入数量。');
 // Persisted scan facts cannot be replaced by a client draft. New facts must have a service-issued event.
 const priorScans=new Map((doc?.scans||[]).map(x=>[x.id,x]));
 for(const l of next.scans){const old=priorScans.get(l.id);if(old){if(old.undoEvent&&(!same(old.undoEvent,l.undoEvent)||!l.undone))return fail('HISTORY','已保存撤销事实不可改写。');for(const f of ['code','before','after','actor','time','key'])if(!same(l[f],old[f]))return fail('HISTORY','已保存扫码事实不可改写。');}
  else {const ev=state.workEvents[c.sessionId+'|'+l.eventId]||Object.values(state.workEvents).find(e=>e.id===l.eventId&&e.docId===c.docId&&e.record&&same(e.record,l));if(!ev||ev.type!=='scan'||ev.docId!==c.docId)return fail('HISTORY','扫码记录不属于当前编辑会话。');l.actor=copy(ev.actor);l.serviceTime=ev.time;}
  if(l.undoEvent&&!old?.undoEvent){const ev=state.workEvents[c.sessionId+'|'+l.undoEvent.id]||Object.values(state.workEvents).find(e=>e.id===l.undoEvent.id&&e.docId===c.docId);if(!ev||ev.type!=='undo'||ev.docId!==c.docId)return fail('HISTORY','撤销记录无效。');l.undoEvent.actor=copy(ev.actor);l.undoEvent.serviceTime=ev.time;}
  l.persisted=true;
 }
 if([...priorScans.keys()].some(id=>!next.scans.some(x=>x.id===id)))return fail('HISTORY','已保存扫码记录不可删除。');
 const scope=(field,xs)=>field==='hiddenColors'?xs.map(k=>{const [id,cx]=k.split('|'),p=state.products.find(p=>p.id===id);return {productId:id,colorId:p?.colorIds[cx]||null,label:id+'／'+(p?.colors[cx]||'历史颜色')}}):copy(xs);
 const changes=[];for(const f of ['date','from','to','note'])if((doc?.[f]||'')!==(next[f]||''))changes.push({field:f,before:doc?.[f]||'',after:next[f]});
 for(const key of new Set([...Object.keys(doc?.q||{}),...Object.keys(next.q)])){const before=Number(doc?.q[key]||0),after=Number(next.q[key]||0);if(before===after)continue;const [id,cx,sx]=key.split('|'),p=state.products.find(x=>x.id===id);changes.push({field:'quantity',productId:id,colorId:p?.colorIds[cx],sizeId:p?.sizeIds[sx],label:id+'／'+p?.colors[cx]+'／'+p?.sizes[sx],before,after})}
 for(const f of ['items','hiddenColors'])if(!same(doc?.[f]||[],next[f]))changes.push({field:f,before:scope(f,doc?.[f]||[]),after:scope(f,next[f])});
  if(c.kind!=='reverse'){if(Object.hasOwn(c.draft,'creatorId')&&!c.draft.creatorId)return fail('VALIDATION','请选择创建者');const creatorId=c.draft.creatorId||doc?.creatorActor?.id||s.accountId;if(creatorId!==(doc?.creatorActor?.id||s.accountId)){if(s.role!=='管理员'||!s.creatorCandidates?.some(x=>x.id===creatorId))return fail('PERMISSION','当前账号不能选择其他创建者');}const who=creatorId===s.accountId?actor(s):s.creatorCandidates?.find(x=>x.id===creatorId)||doc?.creatorActor;if((doc?.creatorId||doc?.creatorActor?.id||'')!==creatorId)changes.push({field:'creatorId',before:doc?.creatorId||doc?.creatorActor?.id||'',after:creatorId});next.creatorId=creatorId;next.creatorActor=copy(who);next.creator=who?.name||doc?.creator||s.name;}if(!doc){next.id='DEMO-DB-'+String(++state.seq).padStart(4,'0');next.created=at;}
 const record=(action,changes)=>next.history.push({id:'tr-event-'+(++state.serial),documentId:next.id,time:at,actor:actor(s),user:s.name,action,changes:copy(changes),result:'成功',version:next.version,revisionBefore:doc?.revision||0,revisionAfter:next.revision});
 const mutated=!doc||changes.length||c.kind!=='save';
 next.revision=(doc?.revision||0)+(mutated?1:0);next.saved=true;
 if(mutated){next.updated=at;next.updatedBy=actor(s);if(c.kind!=='reverse'&&(changes.length||!doc)){next.modified=at;next.modifierActor=actor(s);record(doc?'保存修改':'创建',changes)}}
 const batch=[];
 if(c.kind==='audit'||c.kind==='reverse'){
  const reverse=c.kind==='reverse',priorStatus=next.status,priorVersion=next.version;
  if(!reverse&&next.reversed)next.version++;
  const applied=reverse?next.applied:rows,from=reverse?next.appliedFrom:next.from,to=reverse?next.appliedTo:next.to;
  if(!applied)return fail('STATE','缺少原审核记录，未执行。');
  for(const x of applied){const p=state.products.find(p=>p.id===x.p);for(const [w,delta] of [[from,(reverse?1:-1)*x.n],[to,(reverse?-1:1)*x.n]]){const before=p?.stock[w]?.[x.c]?.[x.s];if(!Number.isFinite(before))return fail('STOCK','库存模拟资料不可用，未执行。');batch.push({p,x,w,delta,before,after:before+delta})}}
  next.status=reverse?'未审核':'已审核';if(reverse){next.reversed=at;next.reverseActor=actor(s);next.auditor=''}else{next.applied=copy(rows);next.appliedFrom=next.from;next.appliedTo=next.to;next.auditor=s.name;next.auditActor=actor(s);next.audited=at;}
  record(reverse?'弃审':next.reversed?'再次审核':'审核',[{field:'status',before:priorStatus,after:next.status},{field:'version',before:priorVersion,after:next.version}]);
 }
 for(const b of batch){b.p.stock[b.w][b.x.c][b.x.s]=b.after;state.events.push({id:++state.serial,key:[b.x.p,b.x.c,b.x.s,b.w].join('|'),productId:b.x.p,colorId:b.x.colorId,sizeId:b.x.sizeId,time:at,type:c.kind==='reverse'?'调拨弃审':b.delta<0?'调拨出':'调拨入',delta:b.delta,before:b.before,after:b.after,source:next.id,user:s.name,actor:actor(s),version:next.version})}
 if(doc)state.docs[state.docs.indexOf(doc)]=next;else{state.docs.push(next);state.leases[next.id]=lease;delete state.leases[c.docId];for(const ev of Object.values(state.workEvents))if(ev.docId===c.docId&&ev.actor.id===s.accountId)ev.docId=next.id;}
 const result={ok:true,doc:copy(next),lease:copy(lease),noop:!mutated};state.requests[requestKey]={fingerprint:JSON.stringify({kind:c.kind,docId:c.docId,base:c.baseRevision,draft:c.draft}),result:copy(result)};return result;
}
const api={seed,reduce};if(typeof module!=='undefined')module.exports=api;else root.TRANSFER_MOCK_CORE=api;
})(typeof window!=='undefined'?window:globalThis);
