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
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});w.HTMLElement.prototype.scrollIntoView=()=>{};
  // JSDOM does not execute modules; supply this module's URL for its eval-only adapter.
  w.eval(d.scripts[0].textContent.replaceAll('import.meta.url', JSON.stringify('https://synthetic.test/synthetic-new-sale.html')));
  const pause=()=>new Promise(r=>setTimeout(r,25));
  const until=async(fn,label)=>{for(let i=0;i<160&&!fn();i++)await pause();assert.ok(fn(),label+' '+d.querySelector('#root').textContent.slice(-4000));};
  const button=label=>[...d.querySelectorAll('button')].find(b=>b.textContent.trim()===label&&!b.disabled&&!b.closest('[hidden]'));
  const click=async el=>{assert.ok(el);assert.notEqual(el.disabled,true,el.textContent);assert.notEqual(el.getAttribute('aria-disabled'),'true');el.dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true,cancelable:true}));el.click();await pause();};
  const change=async(el,value)=>{assert.ok(el);Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}));await pause();};
  const mode=value=>{d.querySelector('#failure').value=value;d.querySelector('#failure').dispatchEvent(new w.Event('change',{bubbles:true}));};
  await until(()=>d.querySelector('.auth-form input[type="password"]')?.disabled,'synthetic password disabled');
  assert.equal(d.querySelector('.auth-form button[type="submit"]').disabled,true);
  await click(d.querySelector('#authorize'));await until(()=>d.querySelector('[aria-label="账号菜单：SYNTHETIC-SALE-ONLY"]'),'authenticated');
  await click(d.querySelector('[aria-label="账号菜单：SYNTHETIC-SALE-ONLY"]'));
  await until(()=>d.querySelector('.auth-account-options [role=menuitem]'),'actual account menu');
  const syntheticPassword=[...d.querySelectorAll('.auth-account-options [role=menuitem]')].find(node=>/无真实密码|修改密码/.test(node.textContent));
  assert.ok(syntheticPassword);assert.equal(syntheticPassword.getAttribute('aria-disabled'),'true','Synthetic harness must keep actual account-menu password action unavailable');
  const beforePasswordCalls=d.querySelector('#calls').textContent;syntheticPassword.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));for(const key of ['Enter',' '])syntheticPassword.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));await pause();assert.equal(d.querySelector('.auth-password-dialog'),null);assert.equal(d.querySelector('input[type=password]'),null);assert.equal(d.querySelector('#calls').textContent,beforePasswordCalls,'Click and keyboard never dispatch password transport');
  syntheticPassword.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await pause();
  const select=label=>d.querySelector(`[role=combobox][aria-label="${label}"]`);
  const option=label=>[...d.querySelectorAll('[role=option]')].find(node=>node.textContent.trim()===label);
  const key=async(node,value)=>{assert.ok(node);node.dispatchEvent(new w.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}));await pause();};
  await click(d.querySelector('#sale'));await until(()=>button('新增销货单'),'sales page');await click(button('新增销货单'));await until(()=>select('选择营业厅'),'new form');
  for(const [label,item]of [['选择营业厅','合成营业厅'],['选择营业员','合成营业员'],['选择客户','合成客户'],['选择出库仓','合成销货仓']]){await click(select(label));await click(option(item));}
  await click(d.querySelector('.sale-entry-row .sale-product-input'));await until(()=>d.querySelector('[data-finder-option]'),'actual bounded product finder');await click(d.querySelector('[data-finder-option]'));
  for(const [part,name]of [['color','合成红色'],['fit','Y版（修身）'],['size','165/S']]){
    await click(d.querySelector(`[data-entry-control$="-${part}"]`));await until(()=>d.querySelector('[data-candidate-option]'),`actual ${part} candidates`);
    await click([...d.querySelectorAll('[data-candidate-option]')].find(node=>node.textContent.trim().replace(/✓$/,'')===name));
  }
  const dictionaryReads=[...d.querySelector('#calls').textContent.matchAll(/SYNTHETIC_READ (.+)/g)].map(match=>JSON.parse(match[1]));
  assert.ok(dictionaryReads.some(read=>read.endpoint==='/dictionary-read/size-groups/query'));for(const read of dictionaryReads){assert.deepEqual(read.body,{search:'',page:1,pageSize:100});assert.equal('actor' in read.body,false);}
  await change(d.querySelector('[aria-label="单据日期"]'),'2026-10-21');await change(d.querySelector('[data-entry-field=quantity]'),'1');await change(d.querySelector('[data-entry-field=price]'),'39.90');await key(d.querySelector('[data-entry-field=price]'),'Enter');
  await click(select('付款方式 1'));await click(option('合成现金'));await click(select('资金账户 1'));await click(option('合成收款账户'));await change(d.querySelector('[aria-label="第1笔收款金额"]'),'39.90');
  mode('proofMissing');await click(button('保存'));await until(()=>d.body.textContent.includes('原生新单准备失败'),'proof rejection');assert.doesNotMatch(d.querySelector('#calls').textContent,/POST \/sales\/commands/);
  mode('saveUncertain');await click(button('保存'));await until(()=>d.querySelector('.sales-command-recovery'),'uncertain original operation remains on the source form');assert.ok(d.querySelector('.sales-proposal-editor'));assert.equal(button('保存'),undefined,'Unknown SAVE cannot start a new save');await until(()=>button('核实原操作回执'),'uncertain receipt action');await click(button('核实原操作回执'));await until(()=>d.body.textContent.includes('原操作已确认'),'receipt committed');
  await click(button('读取当前单据'));await until(()=>button('采用当前单据'),'readback version1');await click(button('采用当前单据'));
  await click(button('返回列表'));await click(button('新增销货单'));await until(()=>select('选择营业厅'),'blank next new');assert.equal(select('选择营业厅').querySelector('input').value,'');assert.equal(d.querySelectorAll('[data-proposal-quantity]').length,0);assert.equal(d.querySelector('[aria-label="单据日期"]').value,new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
  await click(button('返回列表'));await click(d.querySelector('[aria-label="账号菜单：SYNTHETIC-SALE-ONLY"]'));await until(()=>[...d.querySelectorAll('.auth-account-options [role=menuitem]')].some(node=>node.textContent==='退出登录'),'unchanged logout menu action');
  const logout=[...d.querySelectorAll('.auth-account-options [role=menuitem]')].find(node=>node.textContent==='退出登录');assert.notEqual(logout.getAttribute('aria-disabled'),'true');await click(logout);await until(()=>d.querySelector('.auth-form input[type=password]')?.disabled,'normal logout returns to guarded synthetic login');assert.match(d.querySelector('#calls').textContent,/POST \/auth\/logout/);
 }finally{dom.window.close();}
});
