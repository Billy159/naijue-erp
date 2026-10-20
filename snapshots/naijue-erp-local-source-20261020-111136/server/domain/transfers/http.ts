import type {FastifyInstance} from 'fastify';
import {registerBusinessRoute} from '../../security/http.js';
import {identifier,invalid,object,SecurityError} from '../../security/errors.js';
import {transferDetail,transferHistory,transferList} from './query.js';
import {transferWork,transferWorkId} from './work.js';

export function registerTransferRoutes(app:FastifyInstance):void {
  registerBusinessRoute(app,{method:'GET',url:'/api/runtime/documents',resolve(request){
    const q=object(request.query);if(q['type']!=='TRANSFER'&&q['type']!=='SALE')return invalid();
    return {id:q['type']==='TRANSFER'?'transfers.list':'sales.list',selection:{kind:'document-list',type:q['type']}};
  },async handler(context,request){if(context.listScope?.type!=='TRANSFER')throw new SecurityError('NOT_IMPLEMENTED',501,'销货列表尚未接入');return transferList(context,request.query);}});
  for(const history of [false,true])registerBusinessRoute(app,{method:'GET',url:`/api/runtime/${history?'history':'document'}/:documentId`,
    resolve:request=>({id:history?'transfers.history':'transfers.detail',selection:{kind:'document',id:identifier(object(request.params)['documentId'],true)}}),
    handler:(context,request)=>history?transferHistory(context,identifier(object(request.params)['documentId'],true)):transferDetail(context,identifier(object(request.params)['documentId'],true))});
  registerBusinessRoute(app,{method:'POST',url:'/api/transfers/work',resolve(request){
    const b=object(request.body),id=transferWorkId(b['docId']),draft=/^草稿-[a-f0-9]{8}$/.test(id);
    if(!draft)identifier(id,true);
    return {id:'work.command',selection:draft?{kind:'transfer-draft',id}:{kind:'document',id},locks:[{scope:'document',key:'transfer-work:'+id}]};
  },handler:(context,request)=>transferWork(context,request.body)});
}
