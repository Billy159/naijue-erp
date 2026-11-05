/** Additional exact27 document-append admission. Not an exact26 capability or a host target verifier. */
import {checkedRuntime27CommandCapability} from '../../../packages/application/src/runtime27-command-capability.ts';
import type {Runtime27CommandCapability} from '../../../packages/application/src/runtime27-command-capability.ts';
import {assertDocumentBarcodeSuccessor} from './document-barcode-successor-admission.ts';
interface Client {query(sql:string):Promise<{rows:Record<string,unknown>[]}>}
export interface Runtime27DocumentAppendScope {readonly actorAccountId:string;readonly parentOperationId:string;readonly parentDocumentId:string;readonly parentKind:'SALES'|'TRANSFER'}
export interface Runtime27DocumentAppendProof {readonly profile:'EXACT27';readonly purpose:'EXACT27_DOCUMENT_SKU_APPEND_V1'}
const owned=new WeakMap<object,{client:Client;runtime:Runtime27CommandCapability;active:()=>void;scope:Runtime27DocumentAppendScope}>();
function snapshot(scope:Runtime27DocumentAppendScope):Runtime27DocumentAppendScope{
 if(!scope||Object.getPrototypeOf(scope)!==Object.prototype||Reflect.ownKeys(scope).sort().join(',')!=='actorAccountId,parentDocumentId,parentKind,parentOperationId')throw new TypeError('Exact append scope required');
 const out:Record<string,string>={};for(const k of ['actorAccountId','parentOperationId','parentDocumentId','parentKind']){const d=Object.getOwnPropertyDescriptor(scope,k);if(!d?.enumerable||!('value'in d)||typeof d.value!=='string')throw new TypeError('Own scalar append scope required');out[k]=d.value;}
 if(!['SALES','TRANSFER'].includes(out.parentKind!)||!['actorAccountId','parentOperationId','parentDocumentId'].every(k=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(out[k]!)))throw new TypeError('Exact append identities required');return Object.freeze(out) as unknown as Runtime27DocumentAppendScope;
}
async function verify(e:{client:Client;runtime:Runtime27CommandCapability;active:()=>void}){
 e.active();await e.runtime.assertReady(e.client,'DOCUMENT_COMMAND');e.active();await e.runtime.assertReady(e.client,'CATALOGUE_READ');e.active();
 const rows=(await e.client.query('/* document-append:schema-profile */ SELECT (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration)=ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27] AS exact27')).rows;e.active();
 if(rows.length!==1||rows[0]!.exact27!==true)throw new TypeError('Exact27 registry required');await assertDocumentBarcodeSuccessor(e.client);e.active();
}
export async function admitRuntime27DocumentAppend(client:Client,runtime:Runtime27CommandCapability,assertActive:()=>void,scope:Runtime27DocumentAppendScope):Promise<Runtime27DocumentAppendProof>{
 const checked=checkedRuntime27CommandCapability(runtime),fixed=snapshot(scope);if(typeof assertActive!=='function')throw new TypeError('Original transaction guard required');
 const active=()=>{if(assertActive()!==undefined)throw new TypeError('Transaction guard must throw, not return authorization');};
 const entry={client,runtime:checked,active,scope:fixed};await verify(entry);const proof=Object.freeze({profile:'EXACT27' as const,purpose:'EXACT27_DOCUMENT_SKU_APPEND_V1' as const});owned.set(proof,entry);return proof;
}
export async function assertRuntime27DocumentAppend(proof:Runtime27DocumentAppendProof,client:Client,scope:Runtime27DocumentAppendScope):Promise<void>{
 const entry=owned.get(proof),fixed=snapshot(scope);if(!entry||entry.client!==client||Object.keys(fixed).some(k=>fixed[k as keyof typeof fixed]!==entry.scope[k as keyof typeof fixed]))throw new TypeError('Original bound exact27 append proof required');await verify(entry);
}
