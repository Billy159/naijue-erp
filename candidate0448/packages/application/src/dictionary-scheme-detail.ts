import {DomainError} from '../../domain/src/errors.ts';
import type {DictionaryBarcodeScheme} from './dictionary-read-ports.ts';
import {validateDictionaryScheme} from './dictionary-read-validation.ts';
export interface BarcodeGenerationSegment {readonly key:'prefix'|'fit'|'product'|'color'|'size';readonly length:number;readonly literal:string|null}
export interface BarcodeGenerationMetadata {readonly basis:'CURRENT_GENERATION'|'UNKNOWN';readonly segments:readonly BarcodeGenerationSegment[]}
export interface DictionaryBarcodeSchemeDetail extends DictionaryBarcodeScheme {readonly generationRule?:BarcodeGenerationMetadata}
const segments:readonly BarcodeGenerationSegment[]=Object.freeze([
 {key:'prefix',length:1,literal:'5'},{key:'fit',length:1,literal:null},{key:'product',length:7,literal:null},{key:'color',length:3,literal:null},{key:'size',length:3,literal:null}
].map(row=>Object.freeze(row as BarcodeGenerationSegment)));
/** Read-only approved new-SKU generation specification. Never parsed from a label
 * or historical description and never used to generate, pad or rewrite barcodes. */
function known(s:DictionaryBarcodeScheme){return s.id==='0e70e45e-1a51-4d44-afe8-0002cf3fb7ef'&&s.status==='CURRENT'&&s.barcodeType==='Code128'&&s.codeLength===15&&s.ruleVersion==='NATIVE_SOURCE_RETAINED_V1';}
export function withSchemeGenerationMetadata(value:unknown):DictionaryBarcodeSchemeDetail{
 const base=validateDictionaryScheme(value);return Object.freeze({...base,generationRule:Object.freeze(known(base)?{basis:'CURRENT_GENERATION' as const,segments}:{basis:'UNKNOWN' as const,segments:Object.freeze([])})});
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
 if(rule.basis!=='CURRENT_GENERATION'||!known(base)||rule.segments.length!==segments.length)return invalid();
 rule.segments.forEach((raw,index)=>{const row=shape(raw,['key','length','literal']),expected=segments[index]!;if(row.key!==expected.key||row.length!==expected.length||row.literal!==expected.literal)invalid();});
 return withSchemeGenerationMetadata(base);
}
