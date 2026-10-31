import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {ReadContext} from '../../../../src/loading/read-scope.ts';import {createDocumentProductActivation} from './document-activation.ts';
const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('document product view stays in the owner route and opens the inventory leaf with exact identity',async()=>{
 const dom=new JSDOM('<main><input value="draft"><div class="sale-lines"><button data-document-product>first</button></div><div class="sale-lines"><button data-document-product>second</button></div></main>',{url:'https://synthetic.test/#sales/new'}),host=dom.window.document.querySelector('main'),scope=new ReadContext({accountId:id(1),sessionRevision:'1',permissionRevision:'1'}).createScope('parent'),calls=[],tabs=[];
 dom.window.open=(...args)=>{tabs.push(args);return null;};let closed=0;
 const activation=createDocumentProductActivation({auth:{getSnapshot:()=>({phase:'authenticated',principal:{accountId:id(1)}})}},host,scope,async()=>({open:options=>{calls.push(options);return()=>{closed++;};}}));
 const button=host.querySelectorAll('button')[1],viewport=button.parentElement;viewport.scrollTop=99;viewport.scrollLeft=77;button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));
 await activation.open({id:id(2),label:'Synthetic'});
 assert.deepEqual(tabs,[],'must never open a new tab');assert.equal(calls.length,1);assert.equal(calls[0].product.id,id(2));assert.equal(calls[0].viewport,viewport);assert.equal(calls[0].anchor,button);assert.equal(dom.window.location.hash,'#sales/new');assert.equal(scope.active,true);assert.equal(host.querySelector('input').value,'draft');
 activation.dispose();assert.equal(closed,1);assert.equal(scope.active,true);await activation.open({id:id(2),label:''});assert.equal(calls.length,1);scope.dispose();dom.window.close();
});
