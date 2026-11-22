import {salesInputMoney} from '../../../../src/sales/commands/form-model.ts';
import type {SalesDetailDto} from '../../../../src/sales/contracts.ts';
import type {SalesProposalSnapshot} from '../../../../src/current-form/sales-proposal.ts';

/** A complete authenticated aggregate is usable only for the exact original
 * contributing rows. It is not a mapping from products/SKUs to categories. */
export function unchangedSalesCategorySummary(detail:SalesDetailDto|undefined,state:Pick<SalesProposalSnapshot,'draft'|'entries'|'lineEdit'>){
 const summary=detail?.categorySummary;
 if(!detail||detail.stockBasis!=='RUNTIME_LEDGER'||detail.document.header.businessType!=='SALE'||state.draft.businessType!=='SALE'||
   !summary||summary.basis!=='CURRENT'||summary.metric!=='QUANTITY'||summary.hasMore||summary.categoryCount!==String(summary.items.length))return undefined;
 // Bare search text is not a selected product and does not enter the category totals.
 if(Object.values(state.entries).some(entries=>entries.some(row=>row.product||row.sku||row.color||row.fit||row.size)))return undefined;
 const saved=new Map<string,SalesDetailDto['document']['lines'][number]>(detail.document.lines.map(line=>[line.id,line]));
 if(saved.size!==detail.document.lines.length||saved.size!==state.draft.lines.length)return undefined;
 const edit=state.lineEdit;
 if(edit&&!state.draft.lines.some(row=>row===edit.original&&row.key===edit.key))return undefined;
 for(const row of state.draft.lines){
  const original=saved.get(row.key);
  if(!original||original.isCurrent!==true||original.isGift===null||row.sourceLine?.id!==original.id||row.sourceLine.skuId!==original.skuId||
    row.sku?.id!==original.skuId||row.sku.productId!==row.product.id||row.quantity!==original.quantity||row.isGift!==original.isGift)return undefined;
  if(edit?.key===row.key&&(!edit.sku||edit.sku.id!==original.skuId||edit.sku.productId!==row.sku.productId||edit.product.id!==row.product.id||
    edit.color?.id!==row.sku.colorId||edit.fit?.id!==row.sku.fitId||edit.size?.id!==row.sku.sizeId||
    edit.quantity!==original.quantity||edit.isGift!==original.isGift))return undefined;
  saved.delete(row.key);
 }
 return summary;
}

/** Display-only exact signed quantities. Gifts count as units, not return/exchange flows. */
export function salesQuantitySummary(rows:readonly {readonly quantity:string;readonly isGift:boolean|null}[]|null){
 if(rows===null||rows.some(row=>row.isGift===null))return null;let quantity=0n,giftQuantity=0n,incoming=0n,outgoing=0n;
 for(const row of rows){if(!/^-?\d{1,100}$/.test(row.quantity))return null;const q=BigInt(row.quantity);quantity+=q;if(row.isGift)giftQuantity+=q;else if(q<0n)incoming-=q;else outgoing+=q;}
 return {quantity:String(quantity),giftQuantity:String(giftQuantity),incoming:String(incoming),outgoing:String(outgoing)};
}
/** Amount direction follows net due, never remaining settlement balance. */
export function salesExchangeSummary(netDue:string|null|undefined){
 if(netDue==null||! /^-?\d{1,100}$/.test(netDue))return '差额 —';
 const value=BigInt(netDue);return (value<0n?'应退':value>0n?'应收':'差额')+' ¥'+salesInputMoney(String(value<0n?-value:value));
}

export function salesDraftCategories(rows:readonly {readonly quantity:string;readonly isGift:boolean|null;readonly product:{readonly id:string;readonly category?:{readonly id:string;readonly label:string|null}}}[]|null){
 if(salesQuantitySummary(rows)===null||rows===null)return undefined;
 const groups=new Map<string|null,{categoryId:string|null;categoryName:string|null;value:bigint}>();
 for(const row of rows){if(row.isGift)continue;const categoryId=row.product.category?.id??null,categoryName=row.product.category?.label??null,previous=groups.get(categoryId);if(previous&&previous.categoryName!==categoryName)return undefined;groups.set(categoryId,{categoryId,categoryName,value:(previous?.value??0n)+BigInt(row.quantity)});}
 const items=[...groups.values()].filter(row=>row.value!==0n).map(row=>({...row,value:String(row.value)}));
 return {basis:'CURRENT' as const,metric:'QUANTITY' as const,categoryCount:String(items.length),items,hasMore:false};
}

/** Physical signed flow includes all lines; gift classification is deliberately not guessed. */
export function salesSignedFlowSummary(rows: readonly { readonly quantity: string }[]) {
 let sold=0n,returned=0n;
 for (const row of rows) { if (!/^-?[1-9]\d{0,18}$/.test(row.quantity)) return null; const q=BigInt(row.quantity); if(q<0n)returned-=q;else sold+=q; }
 return {sold:String(sold),returned:String(returned),net:String(sold-returned)};
}
