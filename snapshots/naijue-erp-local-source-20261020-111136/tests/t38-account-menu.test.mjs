import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {build} from 'vite';
import {JSDOM} from 'jsdom';

const tick=()=>new Promise(resolve=>setTimeout(resolve,60));
const byText=(document,text)=>[...document.querySelectorAll('button,[role="menuitem"]')].find(node=>node.textContent.trim()===text);
function typeInto(window,input,value){
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value);
  input.dispatchEvent(new window.Event('input',{bubbles:true}));
}

test('T38账号菜单：入口顺序、弹窗校验与清空、仅提交本人密码并返回登录',async t=>{
  const out=mkdtempSync(join(tmpdir(),'naijue-t38-ui-'));
  t.after(()=>rmSync(out,{recursive:true,force:true}));
  await build({configFile:false,root:resolve('frontend'),define:{'process.env.NODE_ENV':JSON.stringify('production')},
    build:{outDir:out,emptyOutDir:true,lib:{entry:resolve('frontend/topbar-account.jsx'),name:'T38Account',formats:['iife'],fileName:()=>'account.js'}}});
  const dom=new JSDOM('<!doctype html><html><body><div class="basic-account"></div></body></html>',
    {url:'https://t38-qa.invalid/',runScripts:'outside-only',pretendToBeVisual:true});
  const {window}=dom, {document}=window;
  let submitted=null, expired=null;
  window.MASTER_DATA={current:()=>({id:'synthetic-admin',name:'合成管理员',role:'管理员'}),logout:()=>{},
    serverAuth:{changeOwnPassword:async(...args)=>{submitted=args}},expire:message=>{expired=message}};
  window.eval(readFileSync(join(out,'account.js'),'utf8'));
  await tick();
  document.querySelector('.basic-account button').click();await tick();
  const menu=[...document.querySelectorAll('[role="menuitem"]')].map(node=>node.textContent.trim());
  assert(menu.indexOf('修改密码')>=0);assert(menu.indexOf('退出登录')>menu.indexOf('修改密码'));
  byText(document,'修改密码').click();await tick();
  assert(document.body.textContent.includes('确认新密码'));
  assert.equal(document.querySelectorAll('.account-password-modal input[type="password"]').length,3);
  byText(document,'确认修改').click();await tick();
  assert(document.body.textContent.includes('请输入原密码'));
  typeInto(window,document.querySelector('#account-currentPassword'),'synthetic-draft');await tick();
  assert.equal(document.querySelector('#account-currentPassword').value,'synthetic-draft');
  byText(document,'取消').click();await tick();
  document.querySelector('.basic-account button').click();await tick();
  byText(document,'修改密码').click();await tick();
  assert.equal(document.querySelector('#account-currentPassword').value,'');
  typeInto(window,document.querySelector('#account-currentPassword'),'synthetic-old-password');
  typeInto(window,document.querySelector('#account-newPassword'),'synthetic-new-password');
  typeInto(window,document.querySelector('#account-confirmation'),'synthetic-new-password');
  await tick();byText(document,'确认修改').click();await tick();
  assert.deepEqual(submitted,['synthetic-old-password','synthetic-new-password']);
  assert.equal(expired,'密码已修改，请使用新密码重新登录');
  dom.window.close();
});
