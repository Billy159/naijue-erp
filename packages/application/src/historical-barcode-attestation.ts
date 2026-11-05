import { isProxy } from 'node:util/types';
import { requireDomain } from '../../domain/src/errors.ts';
import { entityId } from '../../domain/src/values.ts';
import { BARCODE_SCHEMES } from './barcode-generation.ts';

type SourceRef = Readonly<{file_sha256:string;sheet:string;row:number}>;
type Mapping = Readonly<{scheme_id:string;color_id:string;fit_id:string;size_id:string;product_segment:string;color_code:string;size_code:string;sources:Readonly<{product:SourceRef;color:SourceRef;fit:SourceRef;size:SourceRef}>}>;
export type HistoricalBarcodeAttestation = Readonly<{version:'HISTORICAL_BARCODE_ATTESTATION_V1';product_id:string;product_source_key:string;entries:readonly Mapping[];verification:'LOCAL_DECLARATION_ONLY'}>;
const widths:Readonly<Record<string,readonly [number,number]>>=Object.freeze({[BARCODE_SCHEMES.y2018]:[1,2],[BARCODE_SCHEMES.y2020]:[1,2],[BARCODE_SCHEMES.y2021]:[3,2],[BARCODE_SCHEMES.y2021fit]:[3,2],[BARCODE_SCHEMES.y2023]:[3,3]});
function bad():never { throw new Error('INVALID_HISTORICAL_BARCODE_ATTESTATION'); }
function record(v:unknown,keys:readonly string[]):Record<string,unknown> {
 if(v===null||typeof v!=='object'||isProxy(v)||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype) return bad();
 const descriptors=Object.getOwnPropertyDescriptors(v),all=Reflect.ownKeys(v);
 if(all.length!==keys.length||!keys.every(k=>Object.hasOwn(descriptors,k)&&descriptors[k]!.enumerable&&Object.hasOwn(descriptors[k]!, 'value'))) return bad();
 return v as Record<string,unknown>;
}
// Reject non-scalar UTF-16 before UTF-8 encoding or PostgreSQL text conversion.
// Keep valid source text exact; do not normalize or replace characters.
function raw(v:unknown,max:number):string {if(typeof v!=='string'||v.length===0||v.length>max||v.includes('\0')||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v)||!v.trim()) return bad();return v;}
function code(v:unknown,width:number):string {const s=raw(v,3);if(!new RegExp(`^[0-9]{${width}}$`).test(s))return bad();return s;}
function id(kind:'product'|'color'|'fit'|'size',v:unknown):string {if(typeof v!=='string')return bad();try{return entityId(kind,v);}catch{return bad();}}
function ref(v:unknown,pins:ReadonlySet<string>):SourceRef {const x=record(v,['file_sha256','sheet','row']),hash=x.file_sha256;if(typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash)||!pins.has(hash)||!Number.isSafeInteger(x.row)||Number(x.row)<1)return bad();return Object.freeze({file_sha256:hash,sheet:raw(x.sheet,256),row:Number(x.row)});}
/** Structural/pin validation only. A hash pin is not proof of origin. Never use
 * this function to grant trust to a caller or create a SKU-barcode binding. */
export function parseHistoricalBarcodeAttestation(input:unknown,actualProductId:string,pinnedSourceFiles:ReadonlySet<string>):HistoricalBarcodeAttestation {
 const x=record(input,['version','product_id','product_source_key','entries']);
 if(x.version!=='HISTORICAL_BARCODE_ATTESTATION_V1'||id('product',x.product_id)!==id('product',actualProductId)||isProxy(x.entries)||!Array.isArray(x.entries)||x.entries.length===0||x.entries.length>10000)return bad();
 // Plain dense arrays only; do not invoke a caller-provided getter.
 const arrayDescriptors=Object.getOwnPropertyDescriptors(x.entries), arrayKeys=Reflect.ownKeys(x.entries);
 if(Object.getPrototypeOf(x.entries)!==Array.prototype || arrayKeys.length!==x.entries.length+1 || !Object.hasOwn(arrayDescriptors,'length'))return bad();
 for(let i=0;i<x.entries.length;i++){const d=arrayDescriptors[String(i)];if(!d||!d.enumerable||!Object.hasOwn(d,'value'))return bad();}
 const seen=new Set<string>(), out:Mapping[]=[];
 for(const rawEntry of x.entries){const e=record(rawEntry,['scheme_id','color_id','fit_id','size_id','product_segment','color_code','size_code','sources']);
  const scheme=typeof e.scheme_id==='string'?e.scheme_id:'',width=widths[scheme];if(!width)return bad();
  const colorId=id('color',e.color_id),fitId=id('fit',e.fit_id),sizeId=id('size',e.size_id),key=JSON.stringify([scheme,colorId,fitId,sizeId]);if(seen.has(key))return bad();seen.add(key);
  const sources=record(e.sources,['product','color','fit','size']);
  const productSegment=raw(e.product_segment,512);
  if(/[\x00-\x1f\x7f]/.test(productSegment)||1+productSegment.length+width[0]+width[1]>512)return bad();
  out.push(Object.freeze({scheme_id:scheme,color_id:colorId,fit_id:fitId,size_id:sizeId,product_segment:productSegment,color_code:code(e.color_code,width[0]),size_code:code(e.size_code,width[1]),sources:Object.freeze({product:ref(sources.product,pinnedSourceFiles),color:ref(sources.color,pinnedSourceFiles),fit:ref(sources.fit,pinnedSourceFiles),size:ref(sources.size,pinnedSourceFiles)})}));
 }
 requireDomain(out.length===x.entries.length,'INVALID_HISTORICAL_BARCODE_ATTESTATION','Missing entries');
 return Object.freeze({version:'HISTORICAL_BARCODE_ATTESTATION_V1',product_id:actualProductId,product_source_key:raw(x.product_source_key,512),entries:Object.freeze(out),verification:'LOCAL_DECLARATION_ONLY'});
}
