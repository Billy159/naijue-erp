import assert from 'node:assert/strict';
import {sizeMapping} from './size-mapping.ts';
import {currentSizeGroups} from '../../frontend/product-size-groups.mjs';

// Explicit user decisions and exact rows in 2.0(2), independent of mapper normalization.
const cases = [
 ['68f5fe19-5b56-c031-b8ca-d068d30c391d','107','180/104A  43','UPPER','207','190/3XL'],
 ['903c7aef-efc2-dd58-5191-3495663df43c','947','3XL','PANTS','907','35'],
 ['1ca73462-157f-c8e2-356f-990e128c8492','816','185/92B 52','UPPER','206','185/2XL'],
 ['e077f059-f483-ed8b-3f4a-8a2e72c43f24','944','L','UPPER','204','175/L'],
 ['2d77c7e8-e1f2-e2ef-dfaa-8c3c95d215e0','503','170/88A','UPPER','203','170/M'],
 ['71e39d27-ee0c-8893-f576-85c1ba1e05a0','910','无尺码','FREE','910','无尺码'],
];
for(const [sku,sourceCode,sourceName,groupId,code,name] of cases){
 const mapping=sizeMapping.get(sku);
 assert.ok(mapping,`missing original SKU ${sku}`);
 assert.equal(mapping.sourceCode,sourceCode,'original code is retained as text');
 assert.equal(mapping.sourceSize,sourceName,'original size name is retained exactly');
 assert.equal(mapping.targetGroup,groupId,`decided group for ${sku}`);
 assert.equal(mapping.targetSize,name,`decided size for ${sku}`);
 if(code!=='910')assert.equal(mapping.target[2],code,`decided code for ${sku}`);
}
const groups=currentSizeGroups();
assert.deepEqual(groups.map(g=>g.id),['UPPER','PANTS','WOMEN','SHOES','KIDS','FREE']);
assert.equal(groups.find(g=>g.id==='PANTS')!.sizes.find(s=>s.code==='910')!.name,'40','new 910 is 40; historical 910 remains no size');
assert.equal(sizeMapping.size,14864,'no historical SKU is removed or combined');
console.log('accepted shirt, shorts, western pants, 119TX, reclassified clothing and accessories: PASS');
