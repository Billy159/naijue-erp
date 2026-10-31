import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<div id="root"></div>',{url:'https://prices.test'});
for(const key of ['window','document','HTMLElement','Node','Event'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createElement:h,act}=await import('react'),{createRoot}=await import('react-dom/client');
const temp=await mkdtemp(path.join(process.cwd(),'.price-paste-'));let root;
try{
 const outfile=path.join(temp,'prices.mjs');await build({entryPoints:['apps/web/src/products/product-editor-prices.tsx'],outfile,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/*']});
 const {ProductEditorPrices}=await import(pathToFileURL(outfile).href);
 const keys=['purchase_price','retail_price','wholesale5_price','wholesale6_price','wholesale7_price','wholesale8_price','wholesale9_price','wholesale10_price','minimum_price'];
 const original=Object.fromEntries(keys.map((k,i)=>[k,String(i+1)]));let prices,errors,changes;
 root=createRoot(document.getElementById('root'));
 async function paste(raw,index=0,disabled=false){prices={...original};errors=[];changes=[];await act(async()=>root.render(h(ProductEditorPrices,{values:{prices},disabled,change:patch=>{changes.push(patch);prices=patch.prices;},setError:e=>errors.push(e)})));const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{getData:()=>raw}});await act(async()=>document.querySelectorAll('input')[index].dispatchEvent(event));return event;}
 for(const raw of ['11\nabc\n33','11\n-1','11\n1.234','11\n1e3','11\n10000000000000000']){assert.equal((await paste(raw)).defaultPrevented,true);assert.deepEqual(prices,original);assert.equal(changes.length,0);assert.match(errors[0],/非负金额/);}
 await paste('1\n2\n3\n4\n5\n6\n7\n8\n9\n10');assert.deepEqual(prices,original);assert.match(errors[0],/最多可粘贴 9 项/);
 await paste('11\t22\t33');assert.deepEqual(keys.slice(0,3).map(k=>prices[k]),['11','22','33']);assert.equal(changes.length,1);assert.equal(prices.minimum_price,'9');
 await paste('11\r\n\r\n');assert.equal(prices.purchase_price,'11');assert.equal(prices.retail_price,null);assert.equal(prices.wholesale5_price,'3');
 await paste('0\t99.99',7);assert.equal(prices.wholesale10_price,'0');assert.equal(prices.minimum_price,'99.99');
 await paste('1\t2',8);assert.deepEqual(prices,original);assert.match(errors[0],/最多可粘贴 1 项/);
 assert.equal((await paste('123')).defaultPrevented,false);assert.equal(changes.length,0);
 await paste('11\t22',0,true);assert.equal(changes.length,0);
 console.log('PASS actual shared ProductEditorPrices DOM paste: invalid atomic rejection, capacity, tabs, CRLF, intentional blanks, exact decimals, offset and disabled. No save/browser/PG claim.');
}finally{if(root)await act(async()=>root.unmount());dom.window.close();await rm(temp,{recursive:true,force:true});}
