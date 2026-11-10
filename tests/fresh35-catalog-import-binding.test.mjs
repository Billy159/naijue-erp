import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('history comparison resolves its exact host import to the real catalog module',async()=>{
 const url=new URL('../tools/unified-import/fresh35-host-session.mjs',import.meta.url),source=await readFile(url,'utf8');
 const declaration=source.match(/^import \{[^\n]+\} from ['"]([^'"\n]+\/fresh35-combined-catalog-v1\.mjs)['"];$/m);
 assert(declaration,'the physical host must import the catalog module');
 const call=source.match(/describeFresh35CombinedCatalog\(currentCatalog\)\.modelSha256/);
 assert(call,'exercise the actual historical-comparison call');
 const actualImport=declaration[0].replace(declaration[1],new URL(declaration[1],url).href);
 // Use the host's exact declaration and expression, with the real named
 // exports. An injected same-name function cannot conceal a missing binding.
 const linked=await import('data:text/javascript;base64,'+Buffer.from(actualImport+'\nexport function compare(currentCatalog){return '+call[0]+';}').toString('base64'));
 assert.throws(()=>linked.compare({}),/FRESH35_COMBINED_CATALOG_GENUINE_CATALOG_REQUIRED/);
 await import(url.href); // the entire real host must still link without mocks
});
