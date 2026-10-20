import type {Actor,DocumentScope} from './repository.js';
import {SecurityRepository,scopeFromBody,withTransferCreationScope} from './repository.js';
import {authorizeDocument} from './policies.js';
import {SecurityError} from './errors.js';

const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);

/** A committed response is a historical body, not proof of the caller's current read scope. */
export async function authorizeDocumentResponse(actor:Actor,repo:SecurityRepository,current:DocumentScope,response:unknown):Promise<void>{
  const action=current.type==='SALE'?'sales.detail':current.type==='TRANSFER'?'transfers.detail':'correction.detail';
  await authorizeDocument(actor,current,action,repo);
  // Correction responses retain their existing authorization contract; only SALE/TRANSFER contain this command envelope.
  if(current.type!=='SALE'&&current.type!=='TRANSFER')return;
  const document=record(response)?response['document']:null;
  if(!record(document)||document['id']!==current.id||document['documentType']!==current.type||!record(document['body'])){
    throw new SecurityError('PENDING_VERIFICATION',409,'原请求正文身份待核实');
  }
  await authorizeDocument(actor,withTransferCreationScope(scopeFromBody(current.type,document['body']),current),action,repo);
}
