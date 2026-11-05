import {openSealedPaymentSource} from './sealed-payment-source.mjs';
import {prepareNativePaymentImportChunk,validatePreparedNativePaymentImportChunk,validateNativePaymentRaw} from '../../packages/application/src/native-payment-import.ts';
import {requestHash} from '../../packages/application/src/request-hash.ts';
const fail=code=>{throw Error('NATIVE_PAYMENT_READER_'+code);};
/** A trusted host separately supplies actual typed reference and explicit allocation/
 * state decisions. Neither source IDs nor names are treated as native identities. */
export async function openAuthorizedNativePaymentReader(options){
 const source=await openSealedPaymentSource(options,'PAYMENT'),{config}=source,resolveBinding=config.resolveNativeBinding;
 return {report:source.report,rows:source.rows,close:source.close,
  async authorize(original){
   source.assertOpen();if(typeof resolveBinding!=='function')fail('RESOLVER_REQUIRED');
   validatePreparedNativePaymentImportChunk(original);const chunk=structuredClone(original),input=chunk.input;
   if(input.batchId!==config.batchId||input.fixedSourceNamespace!==config.fixedSourceNamespace||requestHash(input.selection)!==requestHash(source.selection(input.selection.entity)))fail('CONTEXT_NOT_AUTHORIZED');
   await source.verify();const authorized=[];
   for(const row of input.rows){
    const record={source:row.source,selection:input.selection};source.check(record);
    const resolved=await resolveBinding(structuredClone({entity:row.source.entityType,sourceKey:row.source.sourceKey,rawFields:row.source.rawFields,normalizedFields:row.source.normalizedFields}));
    source.assertOpen();validateNativePaymentRaw(resolved);const decision=structuredClone(resolved);source.check(record);await source.verify();
    if(requestHash(decision)!==requestHash({nativeId:row.nativeId,enabledMapping:row.enabledMapping,references:row.references}))fail('BINDING_MISMATCH');authorized.push({source:row.source,...decision});
   }
   const expected=prepareNativePaymentImportChunk({batchId:config.batchId,fixedSourceNamespace:config.fixedSourceNamespace,selection:source.selection(input.selection.entity),rows:authorized});
   if(requestHash(expected)!==requestHash(chunk))fail('PREPARED_NOT_AUTHORIZED');await source.verify();validatePreparedNativePaymentImportChunk(chunk);
  }
 };
}
