import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeBarcodeSchemeInitializationRows26} from './native-barcode-import.ts';
import {withSchemeGenerationMetadata,validateDictionarySchemeDetail} from './dictionary-scheme-detail.ts';
import {validateDictionaryScheme} from './dictionary-read-validation.ts';
const row=nativeBarcodeSchemeInitializationRows26().find(x=>x.sourceSchemeKey==='2026')!.native;
const current={id:row.id,name:row.name,barcodeType:row.barcode_type,ruleDescription:row.rule_description,codeLength:row.code_length,ruleVersion:row.rule_version,status:row.status,applicability:null};
test('only exact approved current tuple gets non-executable generation segments',()=>{
 const detail=withSchemeGenerationMetadata(current);assert.equal(detail.generationRule?.basis,'CURRENT_GENERATION');assert.deepEqual(detail.generationRule?.segments.map(s=>s.length),[1,1,7,3,3]);assert.equal(detail.generationRule?.segments[0]?.literal,'5');assert.deepEqual(validateDictionarySchemeDetail(detail),detail);assert.throws(()=>validateDictionaryScheme(detail));assert.deepEqual(validateDictionarySchemeDetail(current),current);
 assert.equal(withSchemeGenerationMetadata({...current,name:'重命名不是身份'}).generationRule?.basis,'CURRENT_GENERATION');
 for(const patch of [{id:'00000000-0000-4000-8000-000000002405'},{status:'HISTORICAL' as const},{codeLength:14},{ruleVersion:'QA'},{barcodeType:'CODE128'}]){const unknown=withSchemeGenerationMetadata({...current,...patch});assert.deepEqual(unknown.generationRule,{basis:'UNKNOWN',segments:[]});assert.equal(unknown.ruleDescription,current.ruleDescription);}
});
test('detail decoder rejects forged current history, extra shape and altered segment widths',()=>{
 const known=withSchemeGenerationMetadata(current);const rule=known.generationRule!;
 for(const value of [Object.assign(Object.create({custom:true}),known),{...known,extra:true},{...known,generationRule:{...rule,extra:true}},{...known,status:'HISTORICAL'},{...known,generationRule:{...rule,segments:rule.segments.map((s,i)=>i===2?{...s,length:6}:s)}},{...known,generationRule:{basis:'UNKNOWN',segments:rule.segments}}])assert.throws(()=>validateDictionarySchemeDetail(value));
});
