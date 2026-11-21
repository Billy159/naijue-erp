import {BARCODE_SCHEMES} from './barcode-generation.ts';
import {DomainError} from '../../domain/src/errors.ts';
import type {DictionaryBarcodeScheme} from './dictionary-read-ports.ts';
import {validateDictionaryScheme} from './dictionary-read-validation.ts';
export interface BarcodeGenerationSegment {readonly key:'prefix'|'fit'|'product'|'color'|'size';readonly length:number;readonly literal:string|null}
export interface BarcodeGenerationMetadata {readonly basis:'CURRENT_GENERATION'|'UNKNOWN';readonly segments:readonly BarcodeGenerationSegment[]}
export interface DictionaryBarcodeSchemeDetail extends DictionaryBarcodeScheme {readonly generationRule?:BarcodeGenerationMetadata}
const current2026:readonly BarcodeGenerationSegment[]=Object.freeze([
 {key:'prefix',length:1,literal:'5'},{key:'fit',length:1,literal:null},{key:'product',length:7,literal:null},{key:'color',length:3,literal:null},{key:'size',length:3,literal:null}
].map(row=>Object.freeze(row as BarcodeGenerationSegment)));
const current2023:readonly BarcodeGenerationSegment[]=Object.freeze([
 {key:'prefix',length:1,literal:'9'},
 {key:'product',length:null,literal:null},
 {key:'color',length:null,literal:null},
 {key:'size',length:null,literal:null},
].map(row=>Object.freeze(row as BarcodeGenerationSegment)));
/** Describes new generation, never rewrites the old barcode or its source metadata.
 * A null width means the original code is kept as-is, not padded or truncated. */
function known(s:DictionaryBarcodeScheme){
 if(s.barcodeType!=='Code128'||s.ruleVersion!=='NATIVE_SOURCE_RETAINED_V1')return null;
 if(s.id===BARCODE_SCHEMES.y2026&&s.status==='CURRENT'&&s.codeLength===15)return current2026;
 if(s.id===BARCODE_SCHEMES.y2023&&s.status==='HISTORICAL'&&s.codeLength===14)return current2023;
 return null;
}
export function withSchemeGenerationMetadata(value:unknown):DictionaryBarcodeSchemeDetail{
 const base=validateDictionaryScheme(value),segments=known(base);
 return Object.freeze({...base,generationRule:Object.freeze(segments?{basis:'CURRENT_GENERATION' as const,segments}:{basis:'UNKNOWN' as const,segments:Object.freeze([])})});
}
const invalid=():never=>{throw new DomainError('INVALID_DICTIONARY_RESPONSE','Invalid scheme generation metadata');};
function shape(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==keys.length||!keys.every(k=>Object.hasOwn(value,k)))return invalid();return value as Record<string,unknown>;}
/** Old servers may omit the extension. The base closed decoder is unchanged. */
export function validateDictionarySchemeDetail(value:unknown):DictionaryBarcodeSchemeDetail{
 if(!value||typeof value!=='object'||!Object.hasOwn(value,'generationRule'))return validateDictionaryScheme(value);
 if(Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)return invalid();
 const {generationRule,...rest}=value as Record<string,unknown>,base=validateDictionaryScheme(rest),rule=shape(generationRule,['basis','segments']);
 if(!Array.isArray(rule.segments))return invalid();
 if(rule.basis==='UNKNOWN'){if(rule.segments.length)return invalid();return Object.freeze({...base,generationRule:Object.freeze({basis:'UNKNOWN',segments:Object.freeze([])})});}
 const segments=known(base);if(rule.basis!=='CURRENT_GENERATION'||!segments||rule.segments.length!==segments.length)return invalid();
 rule.segments.forEach((raw,index)=>{const row=shape(raw,['key','length','literal']),expected=segments[index]!;if(row.key!==expected.key||row.length!==expected.length||row.literal!==expected.literal)invalid();});
 return withSchemeGenerationMetadata(base);
}
