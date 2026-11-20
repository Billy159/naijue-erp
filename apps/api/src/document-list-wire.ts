import { DomainError } from '../../../packages/domain/src/errors.ts';
/** Opt-in extensions preserve legacy exact rows and category-v1 exact summaries. */
export function documentListWire(value:unknown,version:unknown,profile?: 'ordinary-v1',negotiation?:unknown):unknown {
 if(profile==='ordinary-v1'||(value&&typeof value==='object'&&'profile'in value&&value.profile==='ORDINARY_DOCUMENT_LIST_V1')) {
  requireOrdinaryDocumentProfile(negotiation);
  if(!value||typeof value!=='object')throw new Error('Invalid ordinary page');
  const row=value as Record<string,unknown>;
  if(row.profile!=='ORDINARY_DOCUMENT_LIST_V1'||!revision(row.readRevision)||!Array.isArray(row.items)||row.items.some(item=>!item||typeof item!=='object'||item.dataset!=='LIVE'||item.batchId!==null))throw new Error('Invalid ordinary page');
  const {page,pageSize,exactTotal,readRevision,items}=row;
  // Select only the ordinary envelope; never leak history coverage or per-page totals.
  return categoryListWire({profile:'ORDINARY_DOCUMENT_LIST_V1',page,pageSize,exactTotal,readRevision,items},version);
 }

 return categoryListWire(value,version);
}
function categoryListWire(value:unknown,version:unknown):unknown {
 if(version==='category-v2'||!value||typeof value!=='object'||!('items'in value)||!Array.isArray(value.items))return value;
 return {...value,items:value.items.map((item:unknown)=>{if(!item||typeof item!=='object'||!('categorySummary'in item))return item;
  const {categorySummary,...legacy}=item;
  if(version==='category-v1'&&categorySummary&&typeof categorySummary==='object'){const {categoryCount:_,...v1}=categorySummary as Record<string,unknown>;return {...legacy,categorySummary:v1};}
  return legacy;})};
}
export function transferDetailWire(value:unknown,version:unknown):unknown {
 if(version==='category-v2'||!value||typeof value!=='object'||!('categorySummary'in value))return value;
 const {categorySummary:_,...legacy}=value;return legacy;
}

export function salesDetailWire(value:unknown,version:unknown):unknown {
 if(version==='category-v2'||!value||typeof value!=='object')return value;
 const {productSummary:_,categorySummary:__,...legacy}=value as Record<string,unknown>;return legacy;
}

function revision(value:unknown):boolean { return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value); }
export function requireOrdinaryDocumentProfile(value:unknown):void {
 if(value!=='ordinary-v1')throw new DomainError('INVALID_DOCUMENT_LIST_PROFILE','Explicit ordinary list profile required');
}
export function ordinaryDocumentTotalsWire(value:unknown):unknown {
 if(!value||typeof value!=='object')throw new Error('Invalid ordinary totals');
 const row=value as Record<string,unknown>;
 if(row.profile!=='ORDINARY_DOCUMENT_TOTALS_V1'||!revision(row.readRevision))throw new Error('Invalid ordinary totals');
 const {readRevision,exactTotal,totals}=row;
 return {profile:'ORDINARY_DOCUMENT_TOTALS_V1',readRevision,exactTotal,totals};
}
