import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
test('standalone SALE harness parses cleanly and actual application clicks handle proof retry, receipt and blank next document',async()=>{
 await promisify(execFile)(process.execPath,[fileURLToPath(new URL('./build-sales.mjs',import.meta.url))]);
 const dom=new JSDOM(await readFile(new URL('./dist/synthetic-new-sale.html',import.meta.url),'utf8'),{url:'https://synthetic.test/',runScripts:'outside-only',pretendToBeVisual:true});
 const {window:w}=dom,d=w.document;
 try{
  assert.equal(d.scripts.length,1);assert.equal(d.scripts[0].hasAttribute('src'),false);
  const copy=d.body.cloneNode(true);copy.querySelectorAll('script,style').forEach(n=>n.remove());assert.ok(copy.textContent.length<2000);assert.doesNotMatch(copy.textContent,/Symbol\.for|prototype=/);
  for(const key of ['Response','Request','Headers','AbortController','AbortSignal','TextEncoder','TextDecoder','structuredClone'])w[key]=globalThis[key];
  w.structuredClone=w.eval('(value) => JSON.parse(JSON.stringify(value))'); // All browser DTOs here are plain JSON; preserve the browser realm.
  w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});w.HTMLElement.prototype.scrollIntoView=()=>{};
  // JSDOM does not execute modules; supply this module's URL for its eval-only adapter.
  w.eval(d.scripts[0].textContent.replaceAll('import.meta.url', JSON.stringify('https://synthetic.test/synthetic-new-sale.html')));
  const pause=()=>new Promise(r=>setTimeout(r,25));
  const until=async(fn,label)=>{for(let i=0;i<160&&!fn();i++)await pause();assert.ok(fn(),label+' '+d.querySelector('#root').textContent.slice(-4000));};
  const button=label=>[...d.querySelectorAll('button')].find(b=>b.textContent.trim()===label&&!b.disabled&&!b.closest('[hidden]'));
  const click=async el=>{assert.ok(el);assert.equal(el.disabled,false,el.textContent);el.click();await pause();};
  const change=async(el,value)=>{assert.ok(el);Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}));await pause();};
  const mode=value=>{d.querySelector('#failure').value=value;d.querySelector('#failure').dispatchEvent(new w.Event('change',{bubbles:true}));};
  await click(d.querySelector('#authorize'));await until(()=>button('退出登录'),'authenticated');await click(d.querySelector('#sale'));await until(()=>button('新增销货单'),'sales page');await click(button('新增销货单'));await until(()=>button('选择营业厅'),'new form');
  for(const [select,item]of [['选择营业厅','合成营业厅'],['选择客户','合成客户'],['选择仓库','合成销货仓']]){await click(button(select));await click(button(item));}
  await click(button('添加商品规格'));await click(button('合成验收衬衫（非真实商品）'));await click(button('SYN-001 · 合成红色 · Y版（修身） · 165/S'));await click(button('关闭候选'));
  await change(d.querySelector('[aria-label="单据日期"]'),'2026-10-21');await change(d.querySelector('[aria-label="SYN-SKU-70 单价"]'),'39.90');
  await click(button('添加收退明细'));await click(button('合成现金'));await click(button('合成收款账户'));await change(d.querySelector('[aria-label="收退金额 1"]'),'39.90');
  mode('proofMissing');await click(button('保存'));await until(()=>d.body.textContent.includes('原生新单准备失败'),'proof rejection');assert.doesNotMatch(d.querySelector('#calls').textContent,/POST \/sales\/commands/);
  mode('saveUncertain');await click(button('保存'));await until(()=>d.querySelector('.sales-command-editor'),'native editor');await until(()=>button('核实原操作回执'),'uncertain receipt action');await click(button('核实原操作回执'));await until(()=>d.body.textContent.includes('原操作已确认'),'receipt committed');
  await click(button('读取当前单据'));await until(()=>button('采用当前单据'),'readback version1');await click(button('采用当前单据'));
  await click(button('返回列表'));await click(button('新增销货单'));await until(()=>button('选择营业厅'),'blank next new');assert.equal(d.querySelector('[aria-label="单据日期"]').value,'');
 }finally{dom.window.close();}
});
