import test from 'node:test';import assert from 'node:assert/strict';
import { decodeStandard27AuditJson } from '../packages/application/src/standard27-audit-exact-decoder.ts';
test('audit JSON decoder preserves strings and admits only exact safe integer tokens',()=>{
 assert.deepEqual(decodeStandard27AuditJson('{"version":3,"sku":"00001","price":"10.50","nested":[null,true,-5]}'),{version:3,sku:'00001',price:'10.50',nested:[null,true,-5]});
});
test('unsafe integers, decimals, exponent and malformed JSON fail closed without exposing raw values',()=>{
 for(const raw of ['{"n":9007199254740993}','{"n":1.25}','{"n":1e3}','{"n":-0}','{"n":01}','[]'])assert.throws(()=>decodeStandard27AuditJson(raw),{message:'STANDARD27_AUDIT_EXACT_DECODE_UNAVAILABLE'});
});
test('dangerous object property names are rejected instead of reaching reconstruction',()=>{
 for(const raw of ['{"__proto__":{"polluted":true}}','{"nested":{"constructor":{}}}','{"prototype":1}'])assert.throws(()=>decodeStandard27AuditJson(raw),{message:'STANDARD27_AUDIT_EXACT_DECODE_UNAVAILABLE'});
});
