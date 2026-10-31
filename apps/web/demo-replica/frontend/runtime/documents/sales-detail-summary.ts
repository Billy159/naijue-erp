import {salesInputMoney} from '../../../../src/sales/commands/form-model.ts';
/** Display-only exact signed quantities. Gifts count as units, not return/exchange flows. */
export function salesQuantitySummary(rows:readonly {readonly quantity:string;readonly isGift:boolean}[]|null){
 if(rows===null)return null;let quantity=0n,giftQuantity=0n,incoming=0n,outgoing=0n;
 for(const row of rows){if(!/^-?\d{1,100}$/.test(row.quantity))return null;const q=BigInt(row.quantity);quantity+=q;if(row.isGift)giftQuantity+=q;else if(q<0n)incoming-=q;else outgoing+=q;}
 return {quantity:String(quantity),giftQuantity:String(giftQuantity),incoming:String(incoming),outgoing:String(outgoing)};
}
/** Amount direction follows net due, never remaining settlement balance. */
export function salesExchangeSummary(netDue:string|null|undefined){
 if(netDue==null||! /^-?\d{1,100}$/.test(netDue))return '差额 —';
 const value=BigInt(netDue);return (value<0n?'应退':value>0n?'应收':'差额')+' ¥'+salesInputMoney(String(value<0n?-value:value));
}

export function salesDraftCategories(rows:readonly {readonly quantity:string;readonly isGift:boolean;readonly product:{readonly id:string;readonly category?:{readonly id:string;readonly label:string|null}}}[]|null){
 if(salesQuantitySummary(rows)===null||rows===null)return undefined;
 const groups=new Map<string|null,{categoryId:string|null;categoryName:string|null;value:bigint}>();
 for(const row of rows){if(row.isGift)continue;const categoryId=row.product.category?.id??null,categoryName=row.product.category?.label??null,previous=groups.get(categoryId);if(previous&&previous.categoryName!==categoryName)return undefined;groups.set(categoryId,{categoryId,categoryName,value:(previous?.value??0n)+BigInt(row.quantity)});}
 const items=[...groups.values()].filter(row=>row.value!==0n).map(row=>({...row,value:String(row.value)}));
 return {basis:'CURRENT' as const,metric:'QUANTITY' as const,categoryCount:String(items.length),items,hasMore:false};
}
