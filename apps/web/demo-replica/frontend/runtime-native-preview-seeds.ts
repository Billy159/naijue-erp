import type {createSyntheticUnifiedTransport} from '../../unified-browser-harness/synthetic-transport.ts';
/** Explicit preview memory only. Reuses original finite prepare/SAVE factory;
 * never imported by production-bootstrap or used as a service fallback. */
export async function seedFiniteNativePreviewDocuments(base:ReturnType<typeof createSyntheticUnifiedTransport>){
 if(base.http.origin!=='https://synthetic-management.invalid')throw new TypeError('Explicit finite synthetic origin required');
 const seeds=[
  {
    "kind": "sales",
    "intent": {
      "businessType": "RETURN",
      "businessDate": "2026-10-20",
      "note": "SYNTHETIC ONLY - existing finite factory; no real business",
      "hallId": "00000000-0000-0000-0000-000000000010",
      "customerId": "00000000-0000-0000-0000-000000000011",
      "salespersonId": null,
      "warehouseId": "00000000-0000-0000-0000-000000000020",
      "orderDiscount": "0.00",
      "lines": [
        {
          "skuId": "00000000-0000-0000-0000-000000000070",
          "quantity": "-1",
          "dealPrice": "39.90",
          "pricingRule": "UNIT_PRICE",
          "discountTenths": null,
          "isGift": false,
          "zeroConfirmed": false
        }
      ],
      "settlements": [
        {
          "paymentAccountId": "00000000-0000-0000-0000-000000000031",
          "paymentMethodId": "00000000-0000-0000-0000-000000000030",
          "direction": "REFUND",
          "amount": "39.90"
        }
      ]
    }
  },
  {
    "kind": "transfers",
    "intent": {
      "businessDate": "2026-10-20",
      "note": "SYNTHETIC ONLY - existing finite factory; no real business",
      "fromWarehouseId": "00000000-0000-0000-0000-000000000020",
      "toWarehouseId": "00000000-0000-0000-0000-000000000021",
      "lines": [
        {
          "skuId": "00000000-0000-0000-0000-000000000070",
          "quantity": "1"
        },
        {
          "skuId": "00000000-0000-0000-0000-000000000071",
          "quantity": "2"
        }
      ]
    }
  }
] as const;
 for(const {kind,intent} of seeds){
  const post=(path:string,body:unknown)=>base.http.fetch(base.http.origin+'/api/'+kind+path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const prepared=await post('/prepare-create',intent);
  if(!prepared.ok)throw new Error('Finite native preview preparation unavailable');
  const draft:unknown=await prepared.json();
  const saved=await post('/commands',{action:'SAVE',requestKey:'SYNTHETIC.C.NATIVE.PREVIEW.'+kind,expectedVersion:null,draft});
  if(!saved.ok)throw new Error('Finite native preview memory initialization unavailable');
  await saved.body?.cancel();
 }
}
