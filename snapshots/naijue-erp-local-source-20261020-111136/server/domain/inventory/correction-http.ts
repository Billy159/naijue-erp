import type {FastifyInstance,FastifyRequest} from 'fastify';
import {registerBusinessRoute} from '../../security/http.js';
import {identifier,object,SecurityError} from '../../security/errors.js';
import {correctionInput,correctionLocks,previewCorrection,confirmCorrection,correctionDetail,listCorrections,type CorrectionConfirm} from './correction.js';

function confirmation(request: FastifyRequest): CorrectionConfirm {
  const input = correctionInput(request.body,true) as CorrectionConfirm, requestId = request.headers['x-request-id'];
  if (requestId !== undefined && requestId !== input.requestKey) throw new SecurityError('VALIDATION',400,'请求编号与正文不一致');
  return input;
}
export function registerCorrectionRoutes(app: FastifyInstance): void {
  registerBusinessRoute(app,{method:'GET',url:'/api/correction/preview',resolve:request => {
    const input=correctionInput(request.query); return {id:'correction.preview',selection:{kind:'warehouse',id:input.warehouseId}};
  },handler:(context,request) => previewCorrection(context,correctionInput(request.query))});
  registerBusinessRoute(app,{method:'POST',url:'/api/correction/confirm',resolve:request => {
    const input=confirmation(request); return {id:'correction.confirm',selection:{kind:'warehouse',id:input.warehouseId},locks:correctionLocks(input)};
  },handler:(context,request) => confirmCorrection(context,confirmation(request))});
  registerBusinessRoute(app,{method:'GET',url:'/api/corrections',resolve:() => ({id:'correction.list',selection:{kind:'global'}}),
    handler:(context,request) => listCorrections(context,request.query)});
  registerBusinessRoute(app,{method:'GET',url:'/api/corrections/:correctionId',resolve:request => ({id:'correction.detail',selection:{kind:'document',id:identifier(object(request.params)['correctionId'],true)}}),
    handler:(context,request) => correctionDetail(context,identifier(object(request.params)['correctionId'],true))});
}
