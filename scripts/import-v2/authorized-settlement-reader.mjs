import {openSealedPaymentSource} from './sealed-payment-source.mjs';
import {prepareHistorySettlementChunk,validatePreparedHistorySettlementChunk,historySettlementRequestHash} from '../../packages/application/src/import-v3-history-settlement.ts';
import {requestHash} from '../../packages/application/src/request-hash.ts';
const fail=code=>{throw Error('SETTLEMENT_READER_'+code);};
/** Exact selected source authority is independent from the mandatory actual
 * readonly header/account/original-method binding resolver used for STAGE. */
export async function openAuthorizedSettlementReader(options){
 const source=await openSealedPaymentSource(options,'SETTLEMENT'),{config}=source,resolveBinding=config.resolveNativeBinding;
 return {report:source.report,rows:source.rows,close:source.close,
  async authorize(original){
   source.assertOpen();if(typeof resolveBinding!=='function')fail('RESOLVER_REQUIRED');
   validatePreparedHistorySettlementChunk(original);const chunk=structuredClone(original),input=chunk.input;
   if(input.batchId!==config.batchId||input.fixedSourceNamespace!==config.fixedSourceNamespace||requestHash(input.selection)!==requestHash(source.selection('SETTLEMENT'))||historySettlementRequestHash(input.moneyApprovals)!==historySettlementRequestHash(source.moneyApprovals()))fail('CONTEXT_NOT_AUTHORIZED');
   await source.verify();const authorized=[];
   for(const row of input.rows){
    const record={source:row.source,selection:input.selection};source.check(record);
    const resolved=await resolveBinding(structuredClone({entity:'SETTLEMENT',sourceKey:row.source.sourceKey,rawFields:row.source.rawFields,normalizedFields:row.source.normalizedFields}));
    source.assertOpen();historySettlementRequestHash(resolved);const binding=structuredClone(resolved);source.check(record);await source.verify();
    if(historySettlementRequestHash(binding)!==historySettlementRequestHash({header:row.header,account:row.account,method:row.method}))fail('BINDING_MISMATCH');authorized.push({source:row.source,...binding});
   }
   const expected=prepareHistorySettlementChunk({batchId:config.batchId,fixedSourceNamespace:config.fixedSourceNamespace,selection:source.selection('SETTLEMENT'),moneyApprovals:source.moneyApprovals(),rows:authorized});
   if(historySettlementRequestHash(expected)!==historySettlementRequestHash(chunk))fail('PREPARED_NOT_AUTHORIZED');await source.verify();validatePreparedHistorySettlementChunk(chunk);
  }
 };
}
