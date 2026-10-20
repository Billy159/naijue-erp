import type {FastifyInstance} from 'fastify';
import {registerBusinessRoute} from '../../security/http.js';
import {identifier, invalid, object} from '../../security/errors.js';
import {saleDetail, saleHistory, saleList} from './query.js';
import {saleWork} from './work.js';

export function registerSalesRoutes(app:FastifyInstance):void {
  registerBusinessRoute(app,{method:'GET',url:'/api/sales/documents',resolve(request){
    const q=object(request.query);if(q['type']!==undefined&&q['type']!=='SALE')return invalid();
    const storeId=q['storeId']===undefined?undefined:identifier(q['storeId'],true);
    return {id:'sales.list',selection:{kind:'document-list',type:'SALE',...(storeId?{storeId}:{})}};
  },handler:(context,request)=>saleList(context,request.query)});
  for(const history of [false,true])registerBusinessRoute(app,{method:'GET',url:`/api/sales/${history?'history':'document'}/:documentId`,
    resolve:request=>({id:history?'sales.history':'sales.detail',selection:{kind:'document',id:identifier(object(request.params)['documentId'],true)}}),
    handler:(context,request)=>history?saleHistory(context,identifier(object(request.params)['documentId'],true)):saleDetail(context,identifier(object(request.params)['documentId'],true))});
  registerBusinessRoute(app,{method:'POST',url:'/api/sales/work',resolve(request){
    const b=object(request.body),id=identifier(b['docId']),draft=/^unsaved-[a-f0-9-]{36}$/i.test(id);
    if(!draft)identifier(id,true);
    return {id:'work.command',selection:draft?{kind:'sales-draft',id}:{kind:'document',id},locks:[{scope:'document',key:'sale-work:'+id}]};
  },handler:(context,request)=>saleWork(context,request.body)});
}
