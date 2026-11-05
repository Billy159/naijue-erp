import { requireDomain } from '../../../packages/domain/src/errors.ts';
import { requestHash } from '../../../packages/application/src/request-hash.ts';
import type { MaintenanceCompletion } from '../../../packages/application/src/maintenance-commit-ports.ts';
import type { PgSalesPool } from './sales-unit-of-work.ts';
import type { ProductCapacityFactory } from './product-maintenance-store.ts';
import { maintenanceContextClient } from './maintenance-command-unit-of-work.ts';
import { createStandard27ProductCreateCapacity,safeStandard27CapacitySnapshot } from './standard27-product-create-capacity.ts';
import { createStandard27ImportedEmptyEditCapacity } from './standard27-product-edit-capacity.ts';
/** Host authority is intentionally an unresolved dependency: this factory does
 * not verify a catalog, mint an issuer, or enable application wiring. A future
 * real issuer must bind its rechecks to this exact active transaction and prove
 * role, published visibility, all relevant guards and cooperative writers. */
export interface Standard27ProductCapacityHost {readonly profile:'STANDARD27_PRODUCT_CAPACITY_HOST_V1';readonly assertReady:(client:object,purpose:'CREATE'|'EMPTY_IMPORTED_EDIT')=>Promise<void>}
const claimedContexts=new WeakMap<object,{owner:symbol;invoke:(completion:MaintenanceCompletion)=>Promise<void>}>();
export function createStandard27ProductCapacityFactory(pool:PgSalesPool,host:Standard27ProductCapacityHost):ProductCapacityFactory {
 if(!pool||typeof pool.connect!=='function'||!host||Object.getPrototypeOf(host)!==Object.prototype||Reflect.ownKeys(host).sort().join(',')!=='assertReady,profile')throw TypeError('Exact pool and separately verified V27 host required');
 const p=Object.getOwnPropertyDescriptor(host,'profile'),a=Object.getOwnPropertyDescriptor(host,'assertReady');if(!p?.enumerable||!('value'in p)||p.value!=='STANDARD27_PRODUCT_CAPACITY_HOST_V1'||!a?.enumerable||!('value'in a)||typeof a.value!=='function')throw TypeError('Verified V27 product capacity host required');
 const owner=Symbol('standard27-product-capacity-factory');
 return context=>{const client=maintenanceContextClient(context,pool);const claimed=claimedContexts.get(context);if(claimed){requireDomain(claimed.owner===owner,'PRODUCT_EVIDENCE_CAPACITY_NOT_READY','Original capacity factory already owns this transaction');return claimed.invoke;}const active=()=>{requireDomain(maintenanceContextClient(context,pool)===client,'TRANSACTION_SCOPE','Original active product transaction required')};
  const ready=async(x:object,purpose:'CREATE'|'EMPTY_IMPORTED_EDIT')=>{active();requireDomain(x===client,'TRANSACTION_SCOPE','Original client required');const result:unknown=await a.value(client,purpose);if(result!==undefined)throw TypeError('Host proof must throw or return undefined');active()};
  const create=createStandard27ProductCreateCapacity(client,{profile:'STANDARD27_PRODUCT_CREATE_CAPACITY_V1',assertReady:x=>ready(x,'CREATE')},active);
  const edit=createStandard27ImportedEmptyEditCapacity(client,{profile:'STANDARD27_IMPORTED_EMPTY_EDIT_CAPACITY_V1',assertReady:x=>ready(x,'EMPTY_IMPORTED_EDIT')},active);
  let busy=false,failed=false,admitted:{operationId:string;fingerprint:string}|undefined;
  const invoke=async(input:MaintenanceCompletion)=>{active();requireDomain(!busy&&!failed,'PRODUCT_EVIDENCE_CAPACITY_NOT_READY','Capacity scope busy or poisoned');busy=true;try{
   const completion=safeStandard27CapacitySnapshot(input) as MaintenanceCompletion;const fingerprint=requestHash(completion);
   if(admitted)requireDomain(admitted.operationId===completion.operationId&&admitted.fingerprint===fingerprint,'PRODUCT_EVIDENCE_CAPACITY_NOT_READY','Only original product operation can replay');
   if(completion.action==='CREATE')await create.assertPendingCapacity(completion);else if(completion.action==='EDIT')await edit.assertPendingCapacity(completion);else requireDomain(false,'PRODUCT_EVIDENCE_CAPACITY_NOT_READY','Only CREATE or narrow imported-empty EDIT capacity available');active();admitted={operationId:completion.operationId,fingerprint};
  }catch(error){failed=true;throw error;}finally{busy=false;}};
  claimedContexts.set(context,{owner,invoke});return invoke;
 };
}
