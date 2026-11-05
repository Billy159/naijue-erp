// Restored production-path assertions; not a claim to original lost test source bytes.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import path from 'node:path';
export async function checkProductionGraph(directory){
 const graph=JSON.parse(await readFile(path.join(directory,'metafile.json'),'utf8'));
 assert.ok(Object.values(graph.outputs).some(x=>x.entryPoint==='apps/web/demo-replica/frontend/production-bootstrap.ts'));
 assert.ok(!Object.keys(graph.inputs).some(x=>x.endsWith('/runtime-bootstrap.ts')||x.endsWith('/src/application/application.tsx')));
 const prefix='apps/web/demo-replica/frontend/runtime/';
 const closure=start=>{const seen=new Set();function visit(key){if(seen.has(key))return;seen.add(key);for(const item of graph.inputs[key]?.imports??[])if(item.kind!=='dynamic-import'&&!item.external)visit(item.path);}visit(prefix+start);return seen;};
 for(const [entry,forbidden]of [['documents/sales-list-page.tsx','documents/proposal-form.tsx'],['documents/sales-detail-page.tsx','documents/proposal-form.tsx'],['documents/transfers-list-page.tsx','documents/transfer-proposal-form.tsx'],['products/detail-entry.tsx','products/list.tsx']]){assert.ok(graph.inputs[prefix+entry],entry);assert.ok(!closure(entry).has(prefix+forbidden),entry+' must not eagerly load '+forbidden);}
 return {status:'PASS',checks:6};
}
