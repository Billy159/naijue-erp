import { requireDomain } from '../../domain/src/errors.ts';
import { entityId } from '../../domain/src/values.ts';
import type { ActorContext } from './ports.ts';

/** Current product's actual group is the hard boundary, read by the server.
 * A group ID, label, generated identity, business code or barcode is never an input. */
export interface DocumentSpecification {
  readonly productId: string; readonly colorId: string; readonly fitId: string; readonly sizeId: string;
}
export type DocumentSkuSelection = { readonly skuId: string; readonly spec?: never }
  | { readonly spec: DocumentSpecification; readonly skuId?: never };
export interface DocumentSpecificationSaveScope {
  readonly kind: 'SALES' | 'TRANSFER'; readonly documentId: string; readonly operationId: string;
  readonly actor: ActorContext; readonly completedAt: string;
}
export interface DocumentSpecificationResolution {
  readonly scope: DocumentSpecificationSaveScope;
  readonly selections: readonly DocumentSkuSelection[];
  readonly newId: (kind: 'sku' | 'operation') => string;
}
export function parseDocumentSkuSelection(input: unknown): DocumentSkuSelection {
  requireDomain(input !== null && typeof input === 'object' && Object.getPrototypeOf(input) === Object.prototype,
    'INVALID_HTTP_INPUT', 'Explicit SKU or product specification required');
  const keys=Reflect.ownKeys(input),sku=Object.getOwnPropertyDescriptor(input,'skuId'),spec=Object.getOwnPropertyDescriptor(input,'spec');
  requireDomain(keys.length===1,'INVALID_HTTP_INPUT','Select exactly one native SKU or specification');
  if(sku){requireDomain(sku.enumerable&&Object.hasOwn(sku,'value')&&typeof sku.value==='string','INVALID_HTTP_INPUT','Actual SKU identity required');
    return Object.freeze({skuId:entityId('sku',sku.value as string)});}
  requireDomain(spec?.enumerable&&Object.hasOwn(spec,'value'),'INVALID_HTTP_INPUT','Own specification data required');
  const value:unknown=spec.value;
  requireDomain(value!==null&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype
    &&Reflect.ownKeys(value).length===4,'INVALID_HTTP_INPUT','Exact product/color/fit/size selection required');
  const out:Record<string,string>={};
  for(const [key,kind] of [['productId','product'],['colorId','color'],['fitId','fit'],['sizeId','size']] as const){
    const d=Object.getOwnPropertyDescriptor(value,key);
    requireDomain(d?.enumerable&&Object.hasOwn(d,'value')&&typeof d.value==='string','INVALID_HTTP_INPUT','Actual specification identities required');
    out[key]=entityId(kind,d.value as string);
  }
  return Object.freeze({spec:Object.freeze(out as unknown as DocumentSpecification)});
}
/** Explicitly approved new-system code, only for a genuinely new document SKU.
 * This never modifies an original/manual/import code or generates a barcode. */
export function documentCreatedSkuCode(skuId:string):string {
  return `NJNEW-${entityId('sku',skuId).replaceAll('-','')}`;
}
