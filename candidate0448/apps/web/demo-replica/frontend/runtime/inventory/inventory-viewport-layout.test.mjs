/** Source layout contract only; actual browser geometry is checked separately. No PG/network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const css=await readFile(new URL('../../styles/shared/inventory-controls.css',import.meta.url),'utf8');
const rule=selector=>{const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const found=[...css.matchAll(new RegExp(escaped+'\\s*\\{([^}]+)\\}','g'))];assert.ok(found.length,'Missing layout rule '+selector);return found.at(-1)[1];};
test('inventory footer stays in content flow while only the matrix consumes remaining scroll height',()=>{
 assert.match(rule('body.inventory-workbench .app'),/height:100dvh/);
 assert.match(rule('body.inventory-workbench .app'),/min-height:0/);
 assert.match(rule('body.inventory-workbench .app > .main'),/display:flex/);
 assert.match(rule('body.inventory-workbench .app > .main'),/min-height:0/);
 assert.match(rule('body.inventory-workbench #page'),/flex:1/);
 assert.match(rule('body.inventory-workbench #page'),/overflow:hidden/);
 assert.match(rule('body.inventory-workbench #page'),/min-height:0/);
 assert.match(rule('body.inventory-workbench .iw-workbench'),/flex:1/);
 assert.match(rule('body.inventory-workbench .iw-workbench'),/max-height:none/);
 assert.match(rule('body.inventory-workbench .iw-workbench > #iw-results'),/flex:1 1 0/);
 assert.match(rule('body.inventory-workbench .iw-workbench > #iw-results'),/max-height:none/);
 const footer=rule('body.inventory-workbench .iw-workbench > .iw-pagination');
 assert.match(footer,/flex:0 0 auto/);
 assert.doesNotMatch(footer,/position:(?:fixed|absolute|sticky)|bottom:/,'No overlay can hide the last inventory row or sidebar.');
});
