import type {FastifyInstance, FastifyRequest} from 'fastify';
import type {DocumentCommand, DocumentCommandName, DocumentType} from './command.js';
import {documentCommandLocks, executeDocumentCommand} from './command.js';
import {identifier, invalid, object, SecurityError} from '../../security/errors.js';
import {registerBusinessRoute} from '../../security/http.js';
import type {OperationId} from '../../security/policies.js';
import type {Selection} from '../../security/service.js';
import {registerTransferRoutes} from '../transfers/http.js';
import {registerSalesRoutes} from '../sales/http.js';

const actions = ['create','save','approve','unapprove','delete'] as const;
const actionSet: ReadonlySet<string> = new Set(actions);
const types = ['SALE','TRANSFER'] as const;
const typeSet: ReadonlySet<string> = new Set(types);
const logicalOperation = (type: DocumentType, action: DocumentCommandName): OperationId => {
  const prefix = type === 'SALE' ? 'sales.' : 'transfers.';
  return `${prefix}${action === 'delete' ? 'void' : action}` as OperationId;
};

interface ResolvedCommand {readonly input: DocumentCommand; readonly operationId: OperationId; readonly selection: Selection}

function resolve(request: FastifyRequest): ResolvedCommand {
  const body = object(request.body), type = body['documentType'], action = body['operation'];
  if (typeof type !== 'string' || !typeSet.has(type) || typeof action !== 'string' || !actionSet.has(action)
    || typeof body['expectedVersion'] !== 'number' || !Number.isSafeInteger(body['expectedVersion']) || body['expectedVersion'] < 0
    || typeof body['requestKey'] !== 'string' || !body['requestKey'].trim() || body['requestKey'].length > 200 || body['requestKey'].includes('\0')) return invalid();
  const documentId = identifier(body['documentId'],true) as string;
  const documentType = type as DocumentType, commandName = action as DocumentCommandName;
  const input: DocumentCommand = {documentId,documentType,operation:commandName,expectedVersion:body['expectedVersion'],requestKey:body['requestKey'],
    ...(body['body'] !== undefined ? {body:object(body['body'])} : {})};
  const headerRequestId = request.headers['x-request-id'];
  if (headerRequestId !== undefined && (Array.isArray(headerRequestId) || headerRequestId !== input.requestKey)) throw new SecurityError('VALIDATION',400,'请求编号与请求正文不一致');
  const operationId = logicalOperation(documentType,commandName);
  let selection: Selection;
  if (commandName === 'create') {
    if (!input.body) return invalid();
    selection = {kind:'new-document',type:documentType,body:input.body};
  } else if (commandName === 'save' || commandName === 'approve' && input.body) {
    if (!input.body) return invalid();
    selection = {kind:'document-change',id:documentId,body:input.body};
  } else selection = {kind:'document',id:documentId};
  return {input,operationId,selection};
}

/** Single protected entry point for T11's document commands; T10 selects policy from the typed action. */
export function registerTransactionCommandRoute(app: FastifyInstance): void {
  registerTransferRoutes(app);
  registerSalesRoutes(app);
  registerBusinessRoute(app,{method:'POST',url:'/api/runtime/command',resolve(request){
    const resolved = resolve(request);
    return {id:resolved.operationId,selection:resolved.selection,locks:documentCommandLocks(resolved.input,resolved.operationId)};
  },handler(context,request){
    const resolved = resolve(request);
    return executeDocumentCommand(context,resolved.input,resolved.operationId);
  }});
}
