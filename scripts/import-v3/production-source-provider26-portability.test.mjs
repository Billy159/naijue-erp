import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const providerTest=new URL('./production-source-provider26.test.mjs',import.meta.url);
const helperRoot=new URL('./fixtures/production-provider26/',import.meta.url);
const helperPins=Object.freeze({
  "retained-native-closure-streams-20261026.mjs": "ada8e60d789c4ded205f901a12326658057a784e97ea5ffd62801e0d6f96ba24",
  "sales-header-closure-session-20261026.mjs": "c708c30c8329a6e9c68d473d5154b4ea981d23f71a6580c814ce1dec109e1772",
  "prepare-retained-sales-header-window-20261026.mjs": "89c6149ed32c02fd3e41e41f372e864d16fcd5b4864f6be4a16ff57d02bdcd1c",
  "prepare-retained-sales-options-20261026.mjs": "b73b34b9df14e7694acfc68f7329216b7db4136f0e8d223e1cba0df957939480",
  "retained-sales-settlement-consumer-20261025.mjs": "2213f351e195e2927b2b7625e43c26f87a3e07dde41de7703482c031e16d7c1e",
  "prepare-retained-transfer-header-window-20261025-v2.mjs": "aaea814af3db254c4801a7e07cadef7ddefd056d2b2f56f0a11c09c38ae70eac",
  "transfer-final-document-join1/join-core.mjs": "1c655536bf1d4580071670bd984f7c952cfd1e8399525b4b8a9f1051bd215360"
});

test('provider26 default launch test never contains a host-user/Mac fixture path',async()=>{
 const source=await readFile(providerTest,'utf8');
 assert.doesNotMatch(source,/\/(?:Users|Volumes)\//);
 assert.match(source,/sourceRoot:provider26TestSourceRoot/);
});

test('provider26 portable helpers preserve the genuine original validated bytes',async()=>{
 for(const[name,pin]of Object.entries(helperPins)){
  const bytes=await readFile(new URL(name,helperRoot));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),pin,name);
 }
});

test('provider26 new derived product, SKU and stock synthetic fixture modules must exist; never skip missing inputs',async()=>{
 for(const name of ['product','sku','stock']){
  // File presence is deliberately required; phase 3 explicitly supplies NEW synthetic inputs.
  // Runtime fixture semantics still require the unchanged original provider tests.
  const bytes=await readFile(new URL('retained-native-closure-fixtures-20261026/'+name+'.mjs',helperRoot));
  assert.ok(bytes.length>0,name+' new derived synthetic fixture missing');
 }
});


test('new portable synthetic fixtures retain exact existing constructors and original validation calls',async()=>{
 for(const name of ['product','sku','stock']){
  const original=await readFile(new URL('./native-'+name+'-source26.test.mjs',import.meta.url),'utf8');
  const prefix=original.slice(0,original.indexOf("test('"));
  assert.ok(prefix.includes('async function fixture('));
  const constructor=prefix.slice(prefix.indexOf('async function fixture('));
  const portable=await readFile(new URL('retained-native-closure-fixtures-20261026/'+name+'.mjs',helperRoot),'utf8');
  assert.ok(portable.includes(constructor),name+' fixture constructor/validation semantics changed');
  assert.doesNotMatch(portable,/node:test|\/(?:Users|Volumes)\//);
  assert.match(portable,/export \{fixture\};/);
 }
});
