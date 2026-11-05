// Synthetic render and CSS contract only. JSDOM does not verify browser geometry.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {detail as savedDetail} from '../../../../src/sales/commands/fixtures.test-support.ts';

const here=path.dirname(fileURLToPath(import.meta.url));
const css=await readFile(new URL('../../styles/shared/sales-editor.css',import.meta.url),'utf8');
const labels=[
 ['SYNTHETIC number C01 color with a long label','SYNTHETIC explicit fit with a long label','SYNTHETIC group-context size with a long label'],
 ['长颜色名称'.repeat(20),'无空格超长版型'.repeat(20),'LONGSIZE'.repeat(20)],
 ['白色','Y','M'],
 ['颜色 <&> "保留"','版型 <&> "保留"','尺码 <&> "保留"'],
 [null,null,null],
];

test('saved sales specifications have scoped clipping and preserve full snapshot labels across states',async()=>{
 const temp=await mkdtemp(path.join(here,'.sales-read-spec-'));
 try{
  const output=path.join(temp,'read.mjs');
  await build({entryPoints:[path.join(here,'sales-read-body.tsx')],outfile:output,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/*'],logLevel:'warning'});
  const {SalesReadBody}=await import(pathToFileURL(output).href);
  for(const status of ['DRAFT','APPROVED','VOID']){
   const source=savedDetail(status);
   const detail={...source,document:{...source.document,lines:labels.map(([colorName,fitName,sizeName],index)=>({...source.document.lines[0],id:`synthetic-row-${index}`,snapshot:{...source.document.lines[0].snapshot,colorName,fitName,sizeName}}))}};
   const before=structuredClone(detail);
   const html=renderToStaticMarkup(createElement(SalesReadBody,{detail,actions:null}));
   const dom=new JSDOM(`<style>${css}</style><div id="page">${html}</div><span class="sale-read-spec-value" id="outside-scope">Unrelated text</span>`);
   try{
    const doc=dom.window.document,rows=[...doc.querySelectorAll('.sale-lines-table tbody tr')];
    assert.equal(rows.length,labels.length);
    for(const [rowIndex,row] of rows.entries()){
     assert.equal(row.cells.length,10,'column count stays unchanged');
     assert.equal(row.querySelectorAll('.sale-read-spec-value').length,3,'only color, fit and size use this clipping boundary');
     for(const [labelIndex,label] of labels[rowIndex].entries()){
      const value=row.cells[labelIndex+1].querySelector(':scope > .sale-read-spec-value');
      assert.ok(value,'each saved specification has its own clipping boundary');
      assert.equal(value.textContent,label??'—','full saved fact remains in the DOM');
      assert.equal(value.getAttribute('title'),label,'full saved label is available without shortening its value');
      if(label===null){
       assert.equal(value.tagName,'SPAN','unknown values do not create an empty action');
      }else{
       assert.equal(value.tagName,'BUTTON','native button makes full content available to keyboard and touch');
       assert.equal(value.type,'button');
       assert.equal(value.tabIndex,0);
       assert.equal(value.getAttribute('aria-haspopup'),'dialog');
      }
      const style=dom.window.getComputedStyle(value);
      if(label!==null)assert.equal(style.minHeight,'24px','touch target fits within the existing 36px row');
      for(const [property,want] of [['display','block'],['min-width','0px'],['max-width','100%'],['overflow','hidden'],['text-overflow','ellipsis'],['white-space','nowrap']]){
       assert.equal(style.getPropertyValue(property),want,property);
      }
     }
     const quantity=source.document.lines[0].quantity;
     const direction=source.document.header.businessType==='SALE'?'':quantity.startsWith('-')?'退回 ':'换出 ';
     assert.equal(row.cells[4].textContent,direction+quantity,'quantity and direction are not clipped or rewritten');
     assert.equal(row.cells[9].querySelectorAll('button[data-document-product]').length,1,'existing product action stays present');
    }
    assert.deepEqual([...doc.querySelectorAll('col')].map(col=>col.style.width),[270,100,122,84,80,95,90,108,99,142].map(width=>`${width}px`),'existing column widths stay unchanged');
    const tableStyle=dom.window.getComputedStyle(doc.querySelector('.sale-lines-table'));
    assert.equal(tableStyle.tableLayout,'fixed');
    assert.equal(tableStyle.minWidth,'1190px');
    assert.notEqual(dom.window.getComputedStyle(doc.getElementById('outside-scope')).overflow,'hidden','unrelated controls are not clipped');
    assert.deepEqual(detail,before,'presentation does not mutate original saved facts');
    assert.equal(renderToStaticMarkup(createElement(SalesReadBody,{detail,actions:null})),html,'repeat viewing is stable');
   }finally{dom.window.close();}
  }
 }finally{await rm(temp,{recursive:true,force:true});}
});

test('full specification dialog opens, closes, reopens and returns focus without changing saved facts',async()=>{
 const temp=await mkdtemp(path.join(here,'.sales-read-spec-dialog-'));
 const dom=new JSDOM(`<style>${css}</style><div id="page"><div id="root"></div></div>`,{url:'https://synthetic-sales.test',pretendToBeVisual:true});
 const keys=['window','document','HTMLElement','HTMLButtonElement','HTMLDialogElement','Node','Event','MouseEvent','Element','navigator','IS_REACT_ACT_ENVIRONMENT'];
 const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 // Synthetic showModal/close only. Native Enter/Space/touch and geometry need a real browser.
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;this.querySelector('button')?.focus();};
 dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const {act}=await import('react'),{createRoot}=await import('react-dom/client');
 const root=createRoot(document.getElementById('root'));
 try{
  const output=path.join(temp,'read.mjs');
  await build({entryPoints:[path.join(here,'sales-read-body.tsx')],outfile:output,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/*'],logLevel:'warning'});
  const {SalesReadBody}=await import(pathToFileURL(output).href);
  const source=savedDetail(),[colorName,fitName,sizeName]=labels[1];
  const detail={...source,document:{...source.document,lines:[{...source.document.lines[0],snapshot:{...source.document.lines[0].snapshot,colorName,fitName,sizeName}}]}};
  const before=structuredClone(detail);
  await act(async()=>root.render(createElement(SalesReadBody,{detail,actions:null})));
  const values=[...document.querySelectorAll('button.sale-read-spec-value')];
  assert.equal(values.length,3);
  for(const [index,button] of values.entries()){
   button.focus();
   await act(async()=>button.click());
   const dialog=document.querySelector('dialog');
   assert.ok(dialog?.open);
   assert.equal(document.querySelectorAll('dialog').length,1);
   assert.equal(dialog.querySelector('.sale-read-spec-full-value').textContent,labels[1][index]);
   const fullStyle=dom.window.getComputedStyle(dialog.querySelector('.sale-read-spec-full-value'));
   assert.equal(fullStyle.whiteSpace,'pre-wrap');
   assert.equal(fullStyle.overflowWrap,'anywhere','unbroken names remain readable in the dialog');
   assert.equal(fullStyle.textOverflow,'clip','dialog content is not ellipsized');
   const cancel=new dom.window.Event('cancel',{bubbles:true,cancelable:true});
   await act(async()=>dialog.dispatchEvent(cancel));
   assert.equal(cancel.defaultPrevented,true,'existing Escape handling owns dismissal');
   assert.equal(document.querySelector('dialog'),null);
   assert.equal(document.activeElement,button,'focus returns to the full-value trigger');
   await act(async()=>button.click());
   assert.ok(document.querySelector('dialog')?.open,'reopening works');
   await act(async()=>document.querySelector('dialog button[aria-label="关闭"]').click());
   assert.equal(document.querySelector('dialog'),null);
   assert.equal(document.activeElement,button);
  }
  assert.deepEqual(detail,before);
  assert.equal(document.querySelectorAll('.sale-lines-table tbody tr').length,1);
  assert.equal(document.querySelector('.sale-lines-table tbody tr').cells.length,10);
  values[0].focus();
  await act(async()=>values[0].click());
  assert.ok(document.querySelector('dialog')?.open);
  const refreshed={...detail,document:{...detail.document,header:{...detail.document.header,version:detail.document.header.version+1}}};
  await act(async()=>root.render(createElement(SalesReadBody,{detail:refreshed,actions:null})));
  assert.equal(document.querySelector('dialog'),null,'a refreshed document closes the old snapshot dialog');
 }finally{
  await act(async()=>root.unmount());
  dom.window.close();
  for(const [key,descriptor] of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];
  await rm(temp,{recursive:true,force:true});
 }
});
