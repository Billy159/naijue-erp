import type {FastifyInstance, FastifyRequest, HTTPMethods} from 'fastify';
import {DataAccessError} from '../database/access-errors.js';
import type {ActionLock} from '../database/session.js';
import {IdentityService, type AuthorizedContext, type Selection} from './service.js';
import {SecurityError, object, invalid, identifier} from './errors.js';
import {operation, type OperationId} from './policies.js';
import {listEmployeeRecords, listMasterRecords, type MasterKind, masterHistory, saveMasterRecord, setMasterEnabled} from './master-data.js';

declare module 'fastify' {
  interface FastifyInstance {identity: IdentityService | null}
  interface FastifyRequest {identityToken: string | null}
  interface FastifyContextConfig {t10Guarded?: boolean}
}
export interface BusinessRoute {
  method: HTTPMethods | HTTPMethods[]; url: string;
  resolve(request: FastifyRequest): {id: OperationId; selection: Selection; locks?: readonly ActionLock[]};
  handler(context: AuthorizedContext, request: FastifyRequest): Promise<unknown>;
}
export interface AuthorizedBusinessWorkflow {
  readonly actor: import('./repository.js').Actor;
  execute<T>(work: (context: AuthorizedContext) => Promise<T>): Promise<T>;
}
export interface BusinessWorkflowRoute {
  method: HTTPMethods | HTTPMethods[];
  url: string;
  resolve(request: FastifyRequest): {id: OperationId; selection: Selection; locks?: readonly ActionLock[]};
  workflow(context: AuthorizedBusinessWorkflow, request: FastifyRequest): Promise<unknown>;
}
const guardedHandlers = new WeakSet<object>();
/** Enforced even in health-only mode; a missing security config never makes business routes public. */
export function enforceRouteRegistration(app: FastifyInstance): void {
  app.addHook('onRoute', route => {
    if (!guardedHandlers.has(route.handler)) throw new Error('USE_T10_BUSINESS_ROUTE_REGISTRATION');
  });
}
/** The only business route registration seam: authorization, scope and work share a T09 action. */
export function registerBusinessRoute(app: FastifyInstance, route: BusinessRoute): void {
  const handler = async (request: FastifyRequest): Promise<unknown> => {
    const service = app.identity, token = request.identityToken;
    if (!service || !token) throw new SecurityError('UNAUTHENTICATED', 401, '请先登录');
    const {id, selection, locks} = route.resolve(request);
    return {ok: true, data: await service.execute(token, id, selection, context => route.handler(context, request), locks)};
  };
  guardedHandlers.add(handler);
  app.route({method: route.method, url: route.url, config: {t10Guarded: true}, handler});
}
/** T13 media workflows authorize first, perform filesystem I/O outside a DB action, then re-enter for index writes. */
export function registerBusinessWorkflowRoute(app: FastifyInstance, route: BusinessWorkflowRoute): void {
  const handler = async (request: FastifyRequest): Promise<unknown> => {
    const service = app.identity, token = request.identityToken;
    if (!service || !token) throw new SecurityError('UNAUTHENTICATED', 401, '请先登录');
    const {id, selection, locks} = route.resolve(request);
    const principal = await service.execute(token, id, selection, async context => ({actor: context.actor}), locks);
    const workflow: AuthorizedBusinessWorkflow = {actor: principal.actor,
      execute: work => service.execute(token, id, selection, work, locks)};
    return {ok: true, data: await route.workflow(workflow, request)};
  };
  guardedHandlers.add(handler);
  app.route({method: route.method, url: route.url, config: {t10Guarded: true}, handler});
}
function sameOrigin(request: FastifyRequest, service: IdentityService, required: boolean): void {
  const origin = request.headers.origin, site = request.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none' || origin && origin !== service.keys.config.origin || required && origin !== service.keys.config.origin) throw new SecurityError('CSRF', 403, '请求来源无效，请刷新后重试');
  if (required && !/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) throw new SecurityError('CSRF', 403, '请求格式无效');
}
export function installIdentity(app: FastifyInstance, service: IdentityService): void {
  app.decorateRequest('identityToken', null);
  const attempts = new Map<string, {count: number; expires: number}>();
  const passwordAttempts = new Map<string, {count: number; expires: number}>();
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0];
    if (path === '/api/health' && ['GET','HEAD'].includes(request.method)) return;
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
    const token = service.keys.token(request.headers.cookie);
    request.identityToken = token;
    if (path === '/api/runtime/session' && request.method === 'POST') {
      sameOrigin(request, service, true);
      const now = Date.now();
      for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
      const entry = attempts.get(request.ip) ?? {count: 0, expires: now + 60000};
      if (entry.count >= 20 || !attempts.has(request.ip) && attempts.size >= 1024) throw new SecurityError('LOGIN_RATE_LIMIT', 429, '登录尝试过于频繁，请稍后重试');
      entry.count++; attempts.set(request.ip, entry); return;
    }
    if (path === '/api/runtime/session' && ['GET','HEAD'].includes(request.method) && !token) {sameOrigin(request, service, false); return;}
    if (!token) throw new SecurityError('UNAUTHENTICATED', 401, '请先登录');
    const authenticated = await service.authenticate(token);
    const unsafe = !['GET','HEAD','OPTIONS'].includes(request.method);
    sameOrigin(request, service, unsafe);
    if (unsafe && !service.keys.csrfMatches(token, request.headers['x-csrf-token'])) throw new SecurityError('CSRF', 403, '登录校验已更新，请刷新后重试');
    if (path === '/api/runtime/password/change' && request.method === 'POST') {
      const now = Date.now(), key = authenticated.actor.id;
      for (const [stale, value] of passwordAttempts) if (value.expires <= now) passwordAttempts.delete(stale);
      const entry = passwordAttempts.get(key) ?? {count: 0, expires: now + 60000};
      if (entry.count >= 5 || !passwordAttempts.has(key) && passwordAttempts.size >= 1024)
        throw new SecurityError('PASSWORD_RATE_LIMIT', 429, '尝试过于频繁，请稍后重试');
      entry.count++; passwordAttempts.set(key, entry);
    }
  });
  app.setErrorHandler((error, _request, reply) => {
    let failure: SecurityError;
    if (error instanceof SecurityError) failure = error;
    else if (error instanceof DataAccessError) {
      if (['COMMIT_OUTCOME_UNKNOWN','COMMITTED_CONNECTION_CLEANUP_FAILED'].includes(error.code)) failure = new SecurityError('PENDING_VERIFICATION', 503, '提交结果待核实，请查询原请求');
      else if (error.sqlState === '23505') failure = new SecurityError('VALIDATION', 409, '记录已存在，请核对后重试');
      else failure = new SecurityError('CONNECTION', 503, '服务暂不可用，请稍后核实');
    } else if (error && typeof error === 'object' && ('validation' in error || 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode < 500)) failure = new SecurityError('VALIDATION', 400, '请求参数无效');
    else failure = new SecurityError('INTERNAL', 500, '操作未完成，请查询原请求或稍后核实');
    void reply.code(failure.statusCode).send({ok: false, error: {code: failure.code, message: failure.message, ...(failure.latest ? {latest:failure.latest} : {})}});
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ok: false, error: {code: 'NOT_FOUND', message: '接口不存在'}}));
  const loginHandler: import('fastify').RouteHandlerMethod = async (request, reply) => {
    const result = await service.login(request.body, request.identityToken);
    reply.header('Set-Cookie', service.keys.cookie(result.token));
    return {ok: true, data: {employee: result.employee, csrfToken: result.csrfToken, stateScope: service.keys.cookieName}};
  };
  guardedHandlers.add(loginHandler); app.post('/api/runtime/session', loginHandler);
  const sessionHandler: import('fastify').RouteHandlerMethod = async request => {
    if (!request.identityToken) return {ok: true, data: {employee: null, csrfToken: null}};
    const {employee} = await service.authenticate(request.identityToken);
    return {ok: true, data: {employee, csrfToken: service.keys.csrf(request.identityToken), stateScope: service.keys.cookieName}};
  };
  guardedHandlers.add(sessionHandler); app.get('/api/runtime/session', sessionHandler);
  const logoutHandler: import('fastify').RouteHandlerMethod = async (request, reply) => {
    await service.logout(request.identityToken!);
    reply.header('Set-Cookie', service.keys.cookie('', true));
    return {ok: true, data: {loggedOut: true}};
  };
  guardedHandlers.add(logoutHandler); app.post('/api/runtime/logout', logoutHandler);
  const passwordChangeHandler: import('fastify').RouteHandlerMethod = async (request, reply) => {
    const {actor} = await service.authenticate(request.identityToken!);
    await service.changeOwnPassword(request.identityToken!, request.body);
    passwordAttempts.delete(actor.id);
    reply.header('Set-Cookie', service.keys.cookie('', true));
    return {ok: true, data: {changed: true}};
  };
  guardedHandlers.add(passwordChangeHandler);
  app.post('/api/runtime/password/change', {config: {t10Guarded: true}}, passwordChangeHandler);
  registerBusinessRoute(app, {method: 'GET', url: '/api/runtime/employees', resolve: () => ({id: 'employees.list', selection: {kind: 'global'}}),
    handler: async ({session, repo}) => listEmployeeRecords(session,repo)});
  registerBusinessRoute(app, {method: 'GET', url: '/api/runtime/masters', resolve: () => ({id: 'masters.list', selection: {kind: 'global'}}),
    handler: async ({session,repo}) => listMasterRecords(session,repo)});
  registerBusinessRoute(app, {method: 'GET', url: '/api/runtime/masters/history', resolve: () => ({id: 'masters.history', selection: {kind: 'global'}}),
    handler: async ({actor,session,repo},request) => masterHistory(session,repo,actor,request.query)});
  registerBusinessRoute(app, {method: 'POST', url: '/api/runtime/masters', resolve: request => {const body=object(request.body),key=identifier(body['requestKey']);return {id: 'masters.save', selection: {kind: 'global'}, locks:[{scope:'reference',key:'master-data-catalog'},{scope:'inventory',key:'posting-ledger'},{scope:'idempotency',key:'masters.save:'+key}]};},
    handler: async ({actor,session,repo},request) => saveMasterRecord(session,repo,actor,request.body)});
  registerBusinessRoute(app, {method: 'POST', url: '/api/runtime/masters/status', resolve: () => ({id: 'masters.setEnabled', selection: {kind: 'global'}, locks:[{scope:'reference',key:'master-data-catalog'},{scope:'inventory',key:'posting-ledger'}]}),
    handler: async ({actor,session,repo},request) => setMasterEnabled(session,repo,actor,request.body)});
  // Account changes have their own authoritative action, not a generic SQL or body-actor route.
  const accountHandler: import('fastify').RouteHandlerMethod = async request => ({ok: true, data: await service.saveEmployee(request.identityToken!, request.body)});
  guardedHandlers.add(accountHandler); app.post('/api/runtime/employees', {config: {t10Guarded: true}}, accountHandler);
  registerBusinessRoute(app, {method: 'GET', url: '/api/requests/result', resolve: request => {
    const query = object(request.query);
    if (typeof query['requestKey'] !== 'string' || typeof query['operationId'] !== 'string') return invalid();
    return {id: 'requests.result', selection: {kind: 'request-result', requestKey: query['requestKey'], operationId: query['operationId']}};
  }, handler: async context => context.requestResult});
  registerBusinessRoute(app, {method: ['GET','POST','PUT','PATCH','DELETE'], url: '/api/*', resolve: resolveCompatibility,
    handler: async (context, request) => {
      if (request.method === 'GET' && request.url.split('?')[0] === '/api/reference/warehouses') {
        const catalog=await listMasterRecords(context.session,context.repo,{kinds:['warehouses']}),rows=catalog.records.filter(row=>row.kind==='warehouses').map(row=>({id:row.id,...row.body,version:row.version}));
        return {items:rows,total:rows.length};
      }
      if (request.method === 'GET' && request.url.split('?')[0] === '/api/runtime/hall-config') {
        const catalog=await listMasterRecords(context.session,context.repo,{kinds:['halls','warehouses']}),halls=catalog.records.filter(row=>row.kind==='halls');
        return {aliases:{},stores:halls.map(hall=>({id:hall.id,...hall.body,warehouseIds:catalog.records.filter(row=>row.kind==='warehouses'&&(row.body['hallRelations'] as string[]|undefined)?.includes(hall.id)).map(row=>row.id)}))};
      }
      if (request.method === 'GET' && /^\/api\/reference\/[a-z-]+$/.test(request.url.split('?')[0]??'')) {
        const path=request.url.split('?')[0]??'',raw=path.slice('/api/reference/'.length);
        const kindMap:Record<string,MasterKind|'employees'>={'halls':'halls','warehouses':'warehouses','customers':'parties','suppliers':'parties','employees':'employees','payment-methods':'payments','fund-accounts':'fundAccounts'};
        const kind=kindMap[raw];
        if (!kind) return {items:[],total:0};
        let rows:Record<string,unknown>[];
        if (kind==='employees') {
          rows=(await listEmployeeRecords(context.session,context.repo)).map(({id,code,name,role,storeId,hallId,phone,employmentStatus,enabled})=>({id,code,name,role,storeId,hallId,phone,employmentStatus,enabled}));
        } else {
          const catalog=await listMasterRecords(context.session,context.repo,{kinds:[kind]});
          rows=catalog.records.filter(row=>{
            if(row.kind!==kind)return false;
            if(raw!=='customers'&&raw!=='suppliers')return true;
            const usage=row.body['usage'];
            return Array.isArray(usage)&&usage.length===1&&usage[0]===(raw==='customers'?'customer':'supplier');
          }).map(row=>({id:row.id,...row.body,version:row.version}));
        }
        const query=object(request.query),size=Math.min(500,Math.max(1,Number(query['size'])||200)),page=Math.max(1,Number(query['page'])||1),start=(page-1)*size;
        return {items:rows.slice(start,start+size),total:rows.length};
      }
      throw new SecurityError('NOT_IMPLEMENTED', 501, '业务模块尚未接入正式服务');
    }});
}

function resolveCompatibility(request: FastifyRequest): {id: OperationId; selection: Selection} {
  const path = request.url.split('?')[0]?.slice(4) ?? '', query = object(request.query);
  const body = request.body === undefined ? {} : object(request.body);
  const global = (id: OperationId): {id: OperationId; selection: Selection} => ({id, selection: {kind: 'global'}});
  const product = (id: OperationId): {id: OperationId; selection: Selection} => ({id, selection: {kind: 'product', id: identifier(body['productId'] ?? query['productId'] ?? body['id'], true)}});
  if (path === '/runtime/command' && request.method === 'POST') {
    const type = body['documentType'];
    if (type !== 'SALE' && type !== 'TRANSFER') return invalid();
    const action = body['operation'] === 'delete' ? 'void' : body['operation'];
    const id = operation((type === 'SALE' ? 'sales.' : 'transfers.') + String(action));
    if (!['create','save','approve','unapprove','void'].includes(String(action))) return invalid();
    const selection: Selection = action === 'create' ? {kind: 'new-document', type, body: body['body']}
      : action === 'save' ? {kind: 'document-change', id: identifier(body['documentId'], true), body: body['body']}
      : {kind: 'document', id: identifier(body['documentId'], true)};
    return {id, selection};
  }
  if (path === '/runtime/documents' && request.method === 'GET') {
    if (query['type'] !== 'SALE' && query['type'] !== 'TRANSFER') return invalid();
    const storeId = typeof query['storeId'] === 'string' ? query['storeId'] : undefined;
    return {id: query['type'] === 'SALE' ? 'sales.list' : 'transfers.list', selection: {kind: 'document-list', type: query['type'], ...(storeId ? {storeId} : {})}};
  }
  const document = path.match(/^\/runtime\/(?:document|history)\/([a-f0-9-]+)$/i);
  if (document && request.method === 'GET') return {id: 'inventory.sourceTrace', selection: {kind: 'document', id: identifier(document[1], true)}};
  const media = path.match(/^\/(?:media|runtime\/media)\/([a-f0-9-]+)$/i);
  if (media && request.method === 'GET') return {id: 'media.read', selection: {kind: 'media', id: identifier(media[1], true)}};
  if (['/outputs/export','/outputs/print','/outputs/barcodeLabels'].includes(path)) {
    const source = request.method === 'GET' ? query : body;
    const ids = source['documentIds'] ?? (source['documentId'] ? [source['documentId']] : null);
    const id = operation(path.slice(1).replace('/', '.'));
    if (Array.isArray(ids)) return {id, selection: {kind: 'documents', ids: ids.map(value => identifier(value, true))}};
    return product(id);
  }
  if (path === '/runtime/correction' || path === '/correction/preview' || path === '/correction/confirm') return {id: path.endsWith('/preview') || body['checkOnly'] === true ? 'correction.preview' : 'correction.confirm', selection: {kind: 'warehouse', id: identifier(body['warehouseId'] ?? query['warehouseId'], true)}};
  const readPaths: Record<string, OperationId> = {'/runtime/products': 'products.list', '/runtime/catalog': 'products.list', '/runtime/product-master': 'productMasters.list',
    '/runtime/inventory': 'inventory.query', '/runtime/stock': 'inventory.balance', '/runtime/warehouse-stock': 'inventory.balance', '/runtime/ledger': 'inventory.ledger',
    '/runtime/hall-config': 'masters.candidates', '/runtime/recommendations': 'masters.candidates', '/runtime/barcode': 'barcodes.resolve'};
  if (request.method === 'GET' && readPaths[path]) return global(readPaths[path]);
  if (request.method === 'GET' && /^\/reference\/[a-z-]+$/.test(path)) return global('masters.candidates');
  if (path === '/runtime/product-profile' && request.method === 'POST') return body['productId'] ? product('products.save') : global('products.save');
  if (path === '/runtime/product-delete' && request.method === 'POST') return product(body['checkOnly'] === true ? 'products.checkDelete' : 'products.delete');
  if (path === '/runtime/product-master' && request.method === 'POST') return global('productMasters.save');
  if (path === '/runtime/inventory' && request.method === 'POST') return global('inventory.query');
  // Unknown/old transport entries remain closed even for authenticated accounts.
  throw new SecurityError('NOT_FOUND', 404, '接口不存在');
}
