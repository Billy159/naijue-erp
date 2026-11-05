import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createReplicaPreviewTransport} from '../frontend/runtime-preview-transport.ts';
import {qaHalls,qaCustomers,qaId} from '../frontend/qa-reference-fixtures.mts';
import {installCustomerRecommendationFixture} from './customer-recommendation-fixture.mjs';
test('document preview preserves negotiated customer hints and exact second hall identity',async()=>{
 installCustomerRecommendationFixture();const transport=createReplicaPreviewTransport();
 const query=async(hallId,version,search='')=>{const response=await transport.http.fetch(transport.http.origin+'/api/current-form/sales-references/query',{method:'POST',credentials:'same-origin',headers:version?{'x-naijue-current-form-recommendation':version}:{},body:JSON.stringify({kind:'customer',hallId,search,page:1,pageSize:20})});return {status:response.status,body:await response.json()};};
 for(const [hall,id]of [[qaHalls[0].id,qaCustomers[0].id],[qaId(3299),qaCustomers[1].id]]){const {body}=await query(hall,'customer-v1');assert.equal(body.recommendationAvailability,'AVAILABLE');assert.deepEqual(body.items.filter(x=>x.isRecommended).map(x=>x.id),[id]);}
 for(const version of [undefined,'future-v2']){const {body}=await query(qaHalls[0].id,version);assert.equal('recommendationAvailability'in body,false);assert.equal(body.items.some(x=>'isRecommended'in x),false);}
 const filtered=await query(qaHalls[0].id,'customer-v1',qaCustomers[1].name);assert.equal(filtered.body.items.some(x=>x.isRecommended),false);
 const disabled=qaCustomers[1].enabled;try{qaCustomers[1].enabled=false;const {body}=await query(qaId(3299),'customer-v1');assert.equal(body.items.some(x=>x.isRecommended||x.id===qaCustomers[1].id),false);}finally{qaCustomers[1].enabled=disabled;}
 assert.equal((await query(qaId(99999),'customer-v1')).status,403);
});
