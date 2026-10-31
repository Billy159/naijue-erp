// Source-contract RED/GREEN candidate only. This is not a browser geometry test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const frontend=new URL('../../',import.meta.url);
const read=path=>readFileSync(new URL(path,frontend),'utf8');
const form=read('runtime/documents/proposal-form.tsx');
const salesCss=read('styles/shared/sales-editor.css');
const scheme=read('runtime/catalogue/scheme-page.tsx');
const schemeCss=read('styles/shared/product-detail.css');
const inventoryCss=read('styles/shared/inventory-query.css');
const block=(css,selector)=>{
 const start=css.lastIndexOf(selector+'{');
 assert.notEqual(start,-1,'missing rule: '+selector);
 return css.slice(start+selector.length+1,css.indexOf('}',start));
};

test('inventory view is quiet at rest, visible on hover and keyboard focus',()=>{
 assert.match(block(inventoryCss,'body.inventory-workbench .mx-table .mx-view'),/text-decoration:none/);
 assert.match(inventoryCss,/\.mx-view:hover,body\.inventory-workbench \.mx-table \.mx-view:focus-visible\{[^}]*text-decoration:underline/);
});
test('inventory retains real per-row buttons and folded-only summary action, without rowspan',()=>{
 const matrix=read('runtime/inventory/matrix.tsx');
 assert.match(matrix,/folded&&<button className="mx-view" onClick=\{\(\)=>p\.onProduct\(\{id:product\.id,label:product\.code\}\)\}/);
 assert.match(matrix,/<td className="ui-action-cell"><button className="mx-view" onClick=\{\(\)=>p\.onProduct/);
 assert.doesNotMatch(matrix,/rowSpan|rowspan|window\.open|target="_blank"/);
});
test('product code and name use one explicitly scoped product-cell layout',()=>{
 assert.match(form,/<td><div className="sale-product-layout">/);
 assert.match(form,/className="sale-product-input btn sale-product-identity"/);
 assert.match(form,/<span className="sale-product-code" title=\{product\?\.code\}>\{product\?\.code\}<\/span>/);
 assert.match(salesCss,/\.sale-product-layout \.sale-product-input\{[^}]*width:100%;[^}]*min-width:0;[^}]*text-align:left/);
 assert.match(salesCss,/\.sale-product-layout \.sale-product-identity\{[^}]*justify-content:flex-start;[^}]*background:none/);
 assert.match(salesCss,/\.sale-product-layout \.sale-entry-name\{[^}]*max-width:100%;margin:0/);
});
test('selected identity keeps the original begin-edit and native-input focus hooks',()=>{
 assert.match(form,/if\(session\.beginLineEdit\(entry\.key\)\)\{setTarget\(null\);setLineQuery\(null\);requestAnimationFrame/);
 assert.ok(form.includes("row?.querySelector<HTMLInputElement>('input.sale-product-input')"));
 assert.ok(form.includes('input?.focus({preventScroll:true});input?.select();'));
 assert.ok(form.includes('onChange={e=>{const raw=e.target.value;setLineQuery({key:entry.key,value:raw});open({key:entry.key,direction,spec:null,line:true});void session.search(raw);}}'));
});
test('return/exchange alone receives a readable single-row quantity column',()=>{
 assert.match(form,/className=\{"sale-lines-table"\+\(exchange\?" sale-return-exchange-table":""\)\}/);
 assert.match(form,/width:exchange&&index===4\?120:width/);
 assert.match(form,/className=\{exchange&&product\?"sale-quantity-control":undefined\}/);
 assert.match(salesCss,/\.sale-lines-table\.sale-return-exchange-table\{min-width:1230px\}/);
 assert.match(salesCss,/\.sale-quantity-control\{display:flex;align-items:center;gap:4px/);
 assert.match(salesCss,/\.sale-quantity-control>\[data-line-direction\]\{flex:0 0 58px;[^}]*min-width:0;margin:0/);
});
test('direction labels have no redundant signs, while the input remains signed raw text',()=>{
 assert.ok(form.includes("items={[{value:'IN',label:'退回'},{value:'OUT',label:'换出'}]}"));
 assert.ok(form.includes('aria-label="本行数量" disabled={p.busy||!product} value={entry.quantity} onChange={e=>update({quantity:e.target.value})}'));
 assert.ok(form.includes("className={entry.quantity.startsWith('-')?'negative':''}"));
});
test('the exact int64 direction helper and its impossible-transition guard remain untouched',()=>{
 const helper=read('runtime/documents/sales-line-direction.ts');
 assert.equal(createHash('sha256').update(helper).digest('hex'),'8e7eb2f023f36d94140b43a66f7aaed701751fb54786b56eb1688039a0384a17');
 assert.ok(form.includes("disabled={p.busy||salesLineDirectionQuantity(entry.quantity,entry.quantity.startsWith('-')?'OUT':'IN')===null}"));
 assert.ok(form.includes('const next=salesLineDirectionQuantity(entry.quantity,value);if(next!==null){close();update({quantity:next});}'));
});
test('no global or shadow-select shrink is part of the UI correction',()=>{
 for(const [path,sha] of [
  ['runtime/documents/source-controls.tsx','2d98f2e39224c56b8e45929a5d3e5d2dc4e70853d4e8ea5f64d87184ed6afa26'],
  ['runtime/common/ui/control-css.ts','91d93d04190ed1a592850a47757bac73a48629e1a76ebbae1a679eeeb8990886'],
 ])assert.equal(createHash('sha256').update(read(path)).digest('hex'),sha,path);
});
test('scheme note follows the actual table, before separate pagination',()=>{
 const tableEnd=scheme.indexOf('</tbody></table></div>');
 const note=scheme.indexOf('<p className="hint spaced pc-scheme-note">');
 const pager=scheme.indexOf('{data && <Pager');
 assert.ok(tableEnd>=0&&tableEnd<note&&note<pager,'table → original note → pager');
});
test('short scheme results do not expand a section or auto-push its pager',()=>{
 assert.match(block(schemeCss,'.pc-schemes-page .pc-schemes'),/flex:0 1 auto;min-height:0/);
 assert.match(block(schemeCss,'.pc-schemes-page .pc-settings-pagination'),/flex:none;margin-top:0/);
 assert.match(block(schemeCss,'.pc-schemes-page .pc-schemes .table-scroll'),/min-height:0;max-height:none;overflow:auto/);
});
test('scheme positioning does not replace historical facts with Demo placeholders',()=>{
 assert.ok(scheme.includes('{scheme.ruleDescription}'));
 assert.ok(scheme.includes("{scheme.codeLength === null ? '未知' : `${scheme.codeLength} 位`}"));
 assert.ok(scheme.includes("{scheme.applicability ?? '未知'}"));
 assert.ok(scheme.includes('历史商品使用已确认的条码记录，商品段采用 T+ 存货默认条码完整原值。历史数据已定稿，不自动重新生成条码。2026 方案用于新增商品。'));
 assert.ok(scheme.includes("'结构未提供；保留原说明，不按当前规则推断或重建历史条码。'"));
});
