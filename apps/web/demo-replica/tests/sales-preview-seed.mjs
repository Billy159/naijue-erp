/** Opt-in finite user preview. Every row/ledger/receipt is created by actual commands;
 * never import static APPROVED examples, reset stores, or mutate persisted facts. */
import {qaHalls,qaCustomers,qaStaff,qaWarehouses,qaSkus,qaPaymentAccounts,qaMethods} from '../frontend/qa-reference-fixtures.mts';
export async function seedSalesPreview(fixture){
 const samples=[];
 for(const businessType of ['SALE','RETURN','EXCHANGE'])for(const status of ['DRAFT','APPROVED']){
  const prefix='preview-v1-'+businessType+'-'+status;
  const proposal={salesId:null,businessType,businessDate:'2026-10-29',note:'合成预览 · 正式服务创建 · '+businessType+' / '+status,hallId:qaHalls[0].id,customerId:qaCustomers[0].id,salespersonId:qaStaff[2].id,warehouseId:qaWarehouses[3].id,orderDiscount:'0.00',lines:(businessType==='RETURN'?['-1']:businessType==='EXCHANGE'?['-1','2']:['1']).map(quantity=>({existingLineId:null,skuId:qaSkus[0].id,quantity,dealPrice:'239.00',pricingRule:'UNIT_PRICE',discountTenths:null,isGift:false,zeroConfirmed:false})),settlements:[{existingSettlementId:null,paymentAccountId:qaPaymentAccounts[0].id,paymentMethodId:qaMethods[0].id,direction:businessType==='RETURN'?'REFUND':'RECEIVE',amount:'239.00'}]};
  const saved=await fixture.command({action:'SAVE',requestKey:prefix+'-save',expectedVersion:null,proposal});if(saved.status!==200)throw Error('Preview real SAVE rejected: '+JSON.stringify(saved));
  const salesId=saved.body.salesId;
  if(status==='APPROVED'){const approved=await fixture.command({action:'APPROVE',requestKey:prefix+'-approve',salesId,expectedVersion:1});if(approved.status!==200)throw Error('Preview real APPROVE rejected: '+JSON.stringify(approved));}
  samples.push({salesId,businessType,status});
 }
 return samples;
}
