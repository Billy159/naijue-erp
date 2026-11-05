/** Unresolved HOST verification seam, not an issuer. The host must bind its
 * original clients to freshly verified exact schema1..27, source bodies/ACL/RLS,
 * role and target generation. Read-only EXACT27 authority is not command authority.
 * This deliberately does not admit maintenance, unknown SKU creation or history. */
export interface Runtime27CommandCapability {
  readonly profile: 'EXACT27';
  readonly contract: 'STANDARD_RUNTIME27_COMMAND_V1';
  readonly assertReady: (client: object, purpose: 'DOCUMENT_COMMAND' | 'INVENTORY_ADMISSION' | 'CATALOGUE_READ') => Promise<void>;
}
/** Shape/return-contract validation only; independent host verification remains
 * mandatory. Like26, this function cannot manufacture evidence from a boolean. */
export function checkedRuntime27CommandCapability(value: Runtime27CommandCapability): Runtime27CommandCapability {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value)!==Object.prototype || Reflect.ownKeys(value).length!==3)
    throw new TypeError('Explicit independently verified runtime27 command capability required');
  const profile=Object.getOwnPropertyDescriptor(value,'profile'),contract=Object.getOwnPropertyDescriptor(value,'contract'),verify=Object.getOwnPropertyDescriptor(value,'assertReady');
  if (!profile?.enumerable || !('value' in profile) || profile.value!=='EXACT27' || !contract?.enumerable || !('value' in contract) || contract.value!=='STANDARD_RUNTIME27_COMMAND_V1'
    || !verify?.enumerable || !('value' in verify) || typeof verify.value!=='function') throw new TypeError('Closed runtime27 command capability required');
  return Object.freeze({profile:'EXACT27',contract:'STANDARD_RUNTIME27_COMMAND_V1',async assertReady(client:object,purpose:Parameters<Runtime27CommandCapability['assertReady']>[1]) {
    if (!['DOCUMENT_COMMAND','INVENTORY_ADMISSION','CATALOGUE_READ'].includes(purpose)) throw new TypeError('Unreviewed runtime27 purpose');
    const result:unknown=await verify.value(client,purpose);
    if(result!==undefined)throw new TypeError('Runtime27 host verification must throw on failure, not return a substitute');
  }});
}
