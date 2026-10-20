import type {FastifyInstance} from 'fastify';
import {registerBusinessRoute} from '../security/http.js';
import {object, SecurityError} from '../security/errors.js';
import {getPreference, savePreference, preferenceView} from './preferences.js';

export function registerUserStateRoutes(app: FastifyInstance): void {
  registerBusinessRoute(app, {method: 'GET', url: '/api/preferences',
    resolve: request => {preferenceView(object(request.query)['viewId']); return {id: 'preferences.get', selection: {kind: 'global'}};},
    handler: (context, request) => getPreference(context, object(request.query)['viewId'])});
  registerBusinessRoute(app, {method: 'POST', url: '/api/preferences',
    resolve: request => {const body=object(request.body),view = preferenceView(body['viewId']);if(request.headers['x-request-id']!==undefined&&request.headers['x-request-id']!==body['requestKey'])throw new SecurityError('VALIDATION',400,'请求编号与请求正文不一致'); return {id: 'preferences.save', selection: {kind: 'global'},
      locks: [{scope: 'idempotency', key: 'preferences.save'}, {scope: 'reference', key: 'user-preference:' + view}]};},
    handler: (context, request) => savePreference(context, request.body)});
}
