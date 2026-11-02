import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLegacyJsonText,parseLegacyJsonTextIterative,legacyDecimalText} from '../scripts/import-v3/native-cleaning/legacy-json.mjs';
function typed(v){
 if(v!==null&&typeof v==='object'){
  try{return ['number',legacyDecimalText(v)];}catch{}
  if(Array.isArray(v))return ['array',v.map(typed)];
  return ['object',Object.entries(v).map(([k,x])=>[k,typed(x)])];
 }
 return [v===null?'null':typeof v,v];
}
function compare(text){
 let original,expectedError;
 try{original=typed(parseLegacyJsonText(text));}catch(e){expectedError=e.message;}
 if(expectedError){assert.throws(()=>parseLegacyJsonTextIterative(text),e=>e.message===expectedError);}
 else assert.deepEqual(typed(parseLegacyJsonTextIterative(text)),original);
}
test('exact literal spelling and types survive large numbers, exponents, negative zero and strings',()=>{
 compare('{"a":[9007199254740993123456789,-0,1.0000000000000001,1e999,1E-999,"123",true,null],"q":-9223372036854775809}');
 compare('12.0000');compare('"12.0000"');compare('null');compare('[]');compare('{}');
});
test('escaped source NUL falls back without treating source strings or keys as numeric placeholders',()=>{
 compare('{"\\u0000":"\\u00001","a":1,"b":"\\\\u0000"}');
 compare('{"\\u0071uantity":2,"nested":{"__proto__":123},"__proto__":{"x":1}}');
 compare('{"a":1,"a":2,"b":"\\\"1\\\" \\\\"}');
});
test('quoting numeric literals never repairs invalid keys, missing quotes, escapes or malformed numeric syntax',()=>{
 for(const text of ['{1:2}','{1 : 2}','{"a":{12:1}}','"\\1','["\\1','"1','{"a":01}','[1e]','[1,]','[+1]','[NaN]','[Infinity]','[1 2]','[1true]','[1:2]','{"a":-}','{"a":1.}','{"a":.1}','"\\x00"','"a\n1"'])compare(text);
});
test('nested generated JSON values remain equivalent to the original lossless decoder',()=>{
 let seed=785143;
 const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 const numbers=['0','-0','123.0000','-123.4567','9007199254740993123456789','1e99','2E-9'];
 const strings=['normal','12','quote"slash\\','零','\u0000private','__proto__','line\ntext'];
 const value=depth=>{const choice=random(depth?5:3);if(choice===0)return numbers[random(numbers.length)];if(choice===1)return JSON.stringify(strings[random(strings.length)]);if(choice===2)return ['true','false','null'][random(3)];if(choice===3)return '['+Array.from({length:random(4)},()=>value(depth-1)).join(',')+']';return '{'+Array.from({length:random(4)},(_,i)=>JSON.stringify(strings[random(strings.length)]+i)+':'+value(depth-1)).join(',')+'}';};
 for(let i=0;i<1000;i++)compare(value(4));
});
test('single-character mutations have the same acceptance and results as native-context parsing',()=>{
 const seeds=['{"x":123,"y":[-2,"abc",true]}','["\\\"1",123.45,1e9]','{"__proto__":{"x":1},"x":"\\u0000"}','"\\\\12"','[0,1,-2,3.0000]'];
 for(const text of seeds)for(let i=0;i<text.length;i++){
  compare(text.slice(0,i)+text.slice(i+1));
  for(const insert of ['"','\\',':','0','1',',',' ','[','}'])compare(text.slice(0,i)+insert+text.slice(i));
 }
});
