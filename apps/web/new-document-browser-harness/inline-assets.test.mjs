import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { inlineHarnessAssets } from './inline-assets.mjs';
const template = '<!doctype html><html><head><link rel="stylesheet" href="./main.css"></head><body><div id="root">VISIBLE</div><script type="module" src="./main.js"></script></body></html>';
function visibleText(document) {
  const body = document.body.cloneNode(true); body.querySelectorAll('script,style').forEach(node => node.remove()); return body.textContent;
}
test('inline assets preserve every replacement metacharacter literally and neutralize mixed-case HTML end tags', () => {
  const script = 'const tokens = ["$&", "$$", "$`", "$\'", "</ScRiPt><p>LEAKED</p>"];';
  const css = '.test::after { content: "$& $$ $` $\' </StYlE><p>STYLE-LEAK</p>"; }';
  const dom = new JSDOM(inlineHarnessAssets(template, script, css));
  assert.equal(dom.window.document.scripts.length, 1);
  assert.equal(dom.window.document.scripts[0].textContent, script.replace(/<\/script/gi, '<\\/script'));
  assert.equal(dom.window.document.querySelector('style').textContent, css.replace(/<\/style/gi, '<\\/style'));
  assert.equal(visibleText(dom.window.document), 'VISIBLE'); assert.equal(dom.window.document.querySelectorAll('p').length, 0);
  dom.window.close();
});
test('ambiguous or absent placeholders fail rather than duplicating executable assets', () => {
  assert.throws(() => inlineHarnessAssets(template + template, '', ''));
  assert.throws(() => inlineHarnessAssets('<html></html>', '', ''));
});
test('built standalone HTML parses into one complete module script and has no bundled JavaScript in visible body', async () => {
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./build.mjs', import.meta.url))]);
  const html = await readFile(new URL('./dist/synthetic-new-transfer.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html), document = dom.window.document;
  assert.equal(document.scripts.length, 1); const script = document.scripts[0];
  assert.equal(script.type, 'module'); assert.equal(script.hasAttribute('src'), false); assert.ok(script.textContent.length > 100000);
  assert.equal(document.querySelectorAll('style[data-harness-style]').length, 1);
  assert.equal(document.querySelectorAll('html').length, 1); assert.equal(document.querySelectorAll('body').length, 1);
  assert.equal(document.querySelectorAll('#root').length, 1); assert.equal(document.querySelectorAll('#authorize').length, 1);
  const visible = visibleText(document); assert.ok(visible.length < 2000, `Unexpected visible bundle leakage: ${visible.length} characters`);
  assert.doesNotMatch(visible, /react\.production|Symbol\.for|function\(|sourceMappingURL|__esModule|prototype=/);
  assert.match(visible, /合成浏览器验收/); assert.match(visible, /无数据库/);
  assert.deepEqual([...document.body.children].map(node => node.tagName), ['HEADER', 'DETAILS', 'DIV', 'SCRIPT']);
  dom.window.close();
});
