import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProductionHostConfiguration,productionAssetUrl} from './configuration.ts';

const candidate='/__naijue_candidate/replica-private-01/api';
const configuration=(basePath:string='/api')=>({kind:'naijue-erp-production-host',http:{origin:'https://synthetic.test',basePath},assets:{basePath:'/assets/replica-test/'},session:{verifyOnMount:true},routes:{inventory:true,sales:true,transfers:true}});

test('production API configuration preserves only the original and exact registered candidate prefix',()=>{
 for(const prefix of ['/api',candidate]){
  const source=configuration(prefix),parsed=parseProductionHostConfiguration(source);
  assert.equal(parsed.http.basePath,prefix);assert.equal(parsed.http.origin,'https://synthetic.test');assert.equal(parsed.session.verifyOnMount,true);
  source.http.basePath='/changed';assert.equal(parsed.http.basePath,prefix);assert.ok(Object.isFrozen(parsed.http));
  assert.equal(productionAssetUrl(parsed,'application.js'),'https://synthetic.test/assets/replica-test/application.js');
 }
 assert.equal(parseProductionHostConfiguration(configuration()).http.basePath,'/api');
});

test('no other candidate, arbitrary URL/path, trailing slash, encoded separator or query is accepted',()=>{
 for(const basePath of [undefined,null,'','api','/api/','/other/api','/__naijue_candidate/replica-private-02/api',candidate+'/',candidate+'?x=1',candidate+'#part',candidate+'/extra','/__naijue_candidate/replica-private-01%2fapi','/x/../api','//other.test/api','https://other.test/api','https://synthetic.test'+candidate]){
  assert.throws(()=>parseProductionHostConfiguration({...configuration(),http:{origin:'https://synthetic.test',basePath}}));
 }
});

test('candidate prefix retains canonical HTTPS, verify-on-mount and original route/configuration guards',()=>{
 for(const basePath of ['/api',candidate]){
  for(const origin of ['http://synthetic.test','https://synthetic.test/','https://synthetic.test/path','https://synthetic.test?x=1','https://synthetic.test#part','https://user:pass@synthetic.test'])assert.throws(()=>parseProductionHostConfiguration({...configuration(basePath),http:{origin,basePath}}));
  assert.throws(()=>parseProductionHostConfiguration({...configuration(basePath),session:{verifyOnMount:false}}));
  assert.throws(()=>parseProductionHostConfiguration({...configuration(basePath),routes:{inventory:true,sales:false,transfers:true,salesManualCreate:true}}));
  assert.throws(()=>parseProductionHostConfiguration({...configuration(basePath),http:{origin:'https://synthetic.test',basePath,credentials:'omit'}}));
  assert.throws(()=>parseProductionHostConfiguration({...configuration(basePath),role:'ADMIN'}));
 }
});
