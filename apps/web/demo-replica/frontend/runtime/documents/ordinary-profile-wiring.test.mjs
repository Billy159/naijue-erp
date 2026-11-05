import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseProductionHostConfiguration} from '../../../../src/production-host/configuration.ts';
const config={kind:'naijue-erp-production-host',http:{origin:'https://erp.test',basePath:'/api'},assets:{basePath:'/assets/'},session:{verifyOnMount:true},routes:{inventory:true,sales:true,transfers:true}};
test('ordinary list profile is a strict opt-in passed from host configuration to the real replica feature',async()=>{
 const profile='source-confirmed-ordinary-documents-v1';
 assert.equal(parseProductionHostConfiguration({...config,routes:{...config.routes,documentListProfile:profile}}).routes.documentListProfile,profile);
 assert.throws(()=>parseProductionHostConfiguration({...config,routes:{...config.routes,documentListProfile:'unrecognized'}}));
 assert.equal(parseProductionHostConfiguration(config).routes.documentListProfile,undefined);
 const sales=await readFile(new URL('./sales-feature.ts',import.meta.url),'utf8');
 assert.match(sales,/documentListProfile:\s*config\.documentListProfile/);
});
