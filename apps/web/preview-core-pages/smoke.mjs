import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { JSDOM, requestInterceptor, VirtualConsole } from 'jsdom';

const commit = process.argv[2];
if (!commit || !/^[0-9a-f]{40}$/.test(commit)) throw new Error('Pass the exact reviewed runtime commit used by the checkpoint-specific portable build. Historical delivered artifacts are not relabelled as current.');
const artifactDirectory = new URL(`./artifacts/${commit.slice(0, 12)}/`, import.meta.url);
const manifest = JSON.parse(await readFile(new URL('verification.json', artifactDirectory), 'utf8'));
assert.equal(manifest.baseCommit, commit);
const file = pathToFileURL(manifest.file);
assert.ok(file.href.startsWith(artifactDirectory.href));
assert.ok(file.pathname.endsWith(`three-core-pages-synthetic-test-only-${manifest.baseCommit.slice(0, 12)}.html`));
const html = await readFile(file, 'utf8');
assert.equal(createHash('sha256').update(html).digest('hex'), manifest.sha256);
assert.equal(Buffer.byteLength(html), manifest.bytes);
assert.ok(manifest.bytes <= 10485760);
assert.doesNotMatch(html, /<script[^>]+\bsrc\s*=|<link[^>]+\bhref\s*=/i);
assert.match(html, /connect-src 'none'/);
const errors = []; const resources = []; const network = []; const passed = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(String(error)));
virtualConsole.on('error', (...args) => errors.push(args.map(String).join(' ')));
const dom = new JSDOM(html, { url: 'https://synthetic.test/core-pages-test-only#home', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole,
  resources: { interceptors: [requestInterceptor(request => { resources.push(request.url); throw new Error(`Unexpected external resource: ${request.url}`); })] },
  beforeParse(window) {
    window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    window.HTMLElement.prototype.scrollIntoView = () => {};
    window.fetch = (...args) => { network.push(String(args[0])); return Promise.reject(new Error('Network disabled in synthetic artifact smoke.')); };
    window.XMLHttpRequest = class { constructor() { network.push('XMLHttpRequest'); throw new Error('Network disabled.'); } };
  },
});
const window = dom.window; const document = window.document;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate, label) {
  const deadline = Date.now() + 15000;
  while (!predicate()) { if (Date.now() >= deadline) throw new Error(`Timed out: ${label}. Runtime errors: ${errors.join('; ')}`); await pause(15); }
}
const counts = () => Object.fromEntries([...document.querySelector('.core-preview-diagnostics').attributes].filter(attribute => attribute.name.startsWith('data-read-')).map(attribute => [attribute.name.slice(10), Number(attribute.value)]));
const count = kind => counts()[kind.toLowerCase()];
const click = element => { assert.ok(element, 'Click target exists.'); assert.notEqual(element.disabled, true); element.click(); };
const nav = route => click(document.querySelector(`nav a[href="#${route}"]`));
const submit = label => { const form = document.querySelector(`form[aria-label="${label}"]`); assert.ok(form); form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); };
const visibleButton = label => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === label && !button.closest('[hidden]'));
const pass = label => { passed.push(label); console.log(`PASS ${label}`); };
try {
  await waitFor(() => document.querySelector('.core-preview-diagnostics'), 'actual preview shell');
  assert.match(document.body.textContent, /TEST ONLY \/ SYNTHETIC ONLY/);
  assert.equal(document.querySelectorAll('nav a').length, 3);
  for (const label of ['客户', '供应商', '新增销货单', '新增调拨单']) assert.equal([...document.querySelectorAll('nav button')].find(button => button.textContent === label).disabled, true);
  assert.ok(Object.values(counts()).every(value => value === 0)); await pause(180); assert.ok(Object.values(counts()).every(value => value === 0));
  pass('built artifact: actual shared menu, exactly three enabled routes, truthful test notice, no initial/idle provider reads');

  nav('inventory'); await waitFor(() => document.querySelector('form[aria-label="库存筛选"]'), 'actual inventory leaf');
  assert.equal(count('inventory'), 0); assert.equal(count('inventoryCandidates'), 0); assert.equal(count('productBasics'), 0);
  submit('库存筛选'); await waitFor(() => document.querySelectorAll('[data-inventory-row]').length === 4, 'generated inventory matrix');
  assert.equal(count('inventory'), 1); assert.match(document.querySelector('.iw-results').textContent, /SYNTH-001/);
  assert.match(document.querySelector('.iw-results').textContent, /Y版（修身）/); assert.match(document.querySelector('.iw-results').textContent, /A版（标准）/);
  assert.match(document.querySelector('.iw-results').textContent, /165\/S/); assert.match(document.querySelector('.iw-results').textContent, /205\/6XL/);
  assert.equal(document.querySelector('.mx-negative').textContent, '-2'); assert.equal(document.querySelector('.mx-zero').textContent, '0'); assert.ok(document.querySelector('.mx-absent'));
  assert.ok([...document.querySelectorAll('.mx-stock')].every(button => button.disabled), 'Unavailable ledger remains disabled.');
  const productTrigger = document.querySelector('.mx-view'); click(productTrigger);
  await waitFor(() => document.querySelector('.iw-product-drawer')?.textContent.includes('SYNTHETIC-ONLY-SYSTEM-001'), 'actual product basics action');
  assert.equal(count('productBasics'), 1); assert.equal(count('productSpecifications'), 0); assert.equal(count('productImages'), 0);
  click(document.querySelectorAll('.iw-product-drawer [role=tab]')[1]);
  await waitFor(() => document.querySelectorAll('.pd-skus tbody tr').length === 6, 'six legal native SKU specs');
  assert.equal(count('productSpecifications'), 1); assert.match(document.querySelector('.pd-skus').textContent, /165\/S/);
  click(document.querySelectorAll('.iw-product-drawer [role=tab]')[2]);
  await waitFor(() => document.querySelector('.iw-product-drawer')?.textContent.includes('暂无图片'), 'truthful empty product images');
  assert.equal(count('productImages'), 1); assert.equal(count('productOriginal'), 0);
  click(document.querySelector('[aria-label="关闭商品资料"]')); await waitFor(() => !document.querySelector('.iw-product-drawer'), 'product close cleanup');
  assert.doesNotMatch(document.getElementById('root').textContent, /SYNTHETIC-ONLY-SYSTEM-001/);
  pass('actual inventory query: negative/zero/non-applicable cells, distinct FIT/full size labels; target-only product basics/specs/images and close cleanup');

  nav('sales'); await waitFor(() => document.querySelector('form[aria-label="销货筛选"]'), 'actual sales leaf');
  assert.equal(document.querySelector('.iw-results'), null); assert.equal(count('salesList'), 0); assert.equal(count('salesDetail'), 0); assert.equal(count('salesReferences'), 0);
  submit('销货筛选'); await waitFor(() => document.querySelectorAll('.sales-list tbody tr').length === 2, 'two generated native sales documents');
  assert.equal(count('salesList'), 1); assert.match(document.querySelector('.sales-list').textContent, /SYNTH-RETURN-001/);
  const returnTrigger = [...document.querySelectorAll('.sales-number')].find(button => button.textContent === 'SYNTH-RETURN-001'); returnTrigger.focus(); click(returnTrigger);
  await waitFor(() => document.querySelector('.sales-detail-facts .sale-lines-table'), 'actual sales return detail');
  assert.equal(count('salesDetail'), 1); assert.match(document.querySelector('.sales-detail-facts').textContent, /退回 -1/); assert.match(document.querySelector('.sales-detail-facts').textContent, /合成收退账户（非真实账户）/);
  assert.equal(document.querySelector('dialog'), null); assert.equal(document.querySelector('[data-document-list=sales]').hidden, true);
  click(visibleButton('返回列表')); await waitFor(() => !document.querySelector('.sales-detail-page,.sales-detail-loading'), 'sales detail back cleanup');
  assert.equal(document.querySelector('.sales-detail-facts'), null); assert.equal(document.activeElement, returnTrigger); assert.equal(count('salesList'), 1);
  assert.equal(document.querySelector('[data-document-list=sales]').hidden, false);
  click(returnTrigger); await waitFor(() => count('salesDetail') === 2, 'fresh sales action read');
  click(visibleButton('返回列表')); await pause(150); assert.equal(document.querySelector('.sales-detail-page,.sales-detail-loading'), null);
  pass('actual sales query/full-page readonly detail: inline test-only CSS readiness, no modal, exact synthetic sale+return, one target per action, Back during pending read cannot revive detail, list preserved without refetch');

  nav('transfers'); await waitFor(() => document.querySelectorAll('.transfer-list-table tbody tr').length === 1, 'actual transfer route activation first page');
  assert.equal(document.querySelector('.sales-workbench'), null); assert.equal(count('transferList'), 1); assert.equal(count('transferDetail'), 0); assert.equal(count('transferWarehouses'), 0);
  submit('调拨筛选'); await waitFor(() => count('transferList') === 2 && document.querySelector('[aria-label="调拨查询结果"]').getAttribute('aria-busy') === 'false', 'explicit transfer query');
  const transferTrigger = document.querySelector('.transfer-view'); transferTrigger.focus(); click(transferTrigger);
  await waitFor(() => document.querySelector('.transfer-editor'), 'actual native full-page transfer detail');
  assert.equal(count('transferDetail'), 1); assert.equal(document.querySelector('.transfer-list').hidden, true); assert.equal(document.querySelector('.transfer-editor dialog'), null);
  const transfer = document.querySelector('.transfer-editor'); assert.match(transfer.textContent, /SYNTH-TRANSFER-001/); assert.match(transfer.textContent, /Y版（修身）/); assert.match(transfer.textContent, /A版（标准）/); assert.match(transfer.textContent, /205\/6XL/);
  assert.ok(transfer.querySelector('td[aria-label$="无单据明细"]')); assert.equal(transfer.querySelector('td[aria-label$="无单据明细"]').textContent, '');
  assert.equal(transfer.querySelector('td[aria-label$="无此规格"]').textContent, '—');
  assert.equal(transfer.querySelectorAll('.transfer-record-snapshots tbody tr').length, 0); click(visibleButton('单据保存记录')); await waitFor(() => transfer.querySelectorAll('.transfer-record-snapshots tbody tr').length === 2, 'saved snapshot disclosure'); assert.equal(count('transferDetail'), 1);
  const productBefore = count('productBasics'); click(transfer.querySelector('.mx-actions button'));
  await waitFor(() => document.querySelector('.iw-product-drawer')?.textContent.includes('SYNTHETIC-ONLY-SYSTEM-001'), 'shared product drawer from actual transfer action');
  assert.equal(count('productBasics'), productBefore + 1); assert.equal(count('productSpecifications'), 1); assert.equal(count('productImages'), 1);
  click(document.querySelector('[aria-label="关闭商品资料"]')); await waitFor(() => !document.querySelector('.iw-product-drawer'), 'transfer product close');
  click(visibleButton('返回列表')); await waitFor(() => !document.querySelector('.transfer-editor'), 'transfer back cleanup');
  assert.equal(document.querySelector('.transfer-list').hidden, false); assert.equal(document.activeElement, transferTrigger); assert.equal(count('transferList'), 2);
  pass('actual transfer route/query/full-page detail: native sparse matrix, current FIT/full size facts, blank vs unsupported cells, saved snapshots, action-only shared drawer, back clears detail without list refetch');

  click(document.querySelector('.transfer-view')); await waitFor(() => count('transferDetail') === 2, 'second detail read starts');
  click(visibleButton('返回列表')); await pause(150); assert.equal(document.querySelector('.transfer-editor'), null);
  nav('inventory'); await waitFor(() => document.querySelector('form[aria-label="库存筛选"]'), 'fresh inventory scope');
  assert.equal(document.querySelectorAll('[data-inventory-row]').length, 0, 'Route re-entry cannot reuse previous business facts.'); assert.equal(count('inventory'), 1);
  window.history.back(); await waitFor(() => window.location.hash === '#transfers' && document.querySelectorAll('.transfer-list-table tbody tr').length === 1, 'browser Back returns actual transfer route');
  assert.equal(document.querySelector('.iw-results'), null); assert.equal(document.querySelector('.transfer-editor'), null); assert.equal(document.querySelector('.iw-product-drawer'), null); assert.equal(count('transferList'), 3);
  click(document.querySelector('.core-preview-close')); await waitFor(() => document.querySelector('.core-preview-home'), 'page close clears active route');
  await pause(180); assert.equal(document.querySelector('.transfer-route'), null); assert.equal(document.querySelector('.sales-detail-page,.sales-detail-loading'), null); assert.equal(document.querySelector('.iw-product-drawer'), null);
  assert.deepEqual(resources, []); assert.deepEqual(network, []); assert.deepEqual(errors, []);
  pass('actual artifact route/page/back/interruption cleanup: fresh scopes, no stale results or late detail revival, no external resource/network request or runtime error');
  const ownNames = (await readdir(new URL('.', import.meta.url), { withFileTypes: true })).filter(entry => entry.isFile()).map(entry => entry.name).sort();
  const ownPreviewSourceHashes = await Promise.all(ownNames.map(async name => ({ file: `apps/web/preview-core-pages/${name}`, sha256: createHash('sha256').update(await readFile(new URL(`./${name}`, import.meta.url))).digest('hex') })));
  const ownPreviewManifestSha256 = createHash('sha256').update(ownPreviewSourceHashes.map(row => `${row.sha256}  ${row.file}\n`).join('')).digest('hex');
  await writeFile(new URL('preview-source.sha256', artifactDirectory), ownPreviewSourceHashes.map(row => `${row.sha256}  ${row.file}\n`).join(''));
  const report = { ...manifest, ownPreviewSourceHashes, ownPreviewManifestSha256, smoke: { status: 'PASS', groups: passed, externalResourceRequests: resources, networkAttempts: network, runtimeErrors: errors, limitation: 'JSDOM built-artifact DOM smoke only; not native-browser, screenshots/pixels, network waterfall/performance, real data or Space embed acceptance.' } };
  await writeFile(new URL('verification.json', artifactDirectory), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ file: file.pathname, bytes: manifest.bytes, sha256: manifest.sha256, groups: passed.length }, null, 2));
  console.log(report.smoke.limitation);
} finally { dom.window.close(); }
