/** Real component DOM candidate; NOT EXECUTED in preparation. Natural browser event QA remains required. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url));
test('actual replacement quantity blur/Tab never commits before explicit confirmation; cancel restores original', async () => {
 const temp = await mkdtemp(path.join(here, '.transfer-edit-flow-')), dom = new JSDOM('<div id="root"></div>', { url: 'https://transfer.test', pretendToBeVisual: true });
 for (const key of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','Node','Event','FocusEvent','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
 Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator }); globalThis.IS_REACT_ACT_ENVIRONMENT = true; globalThis.innerWidth = 1400; globalThis.innerHeight = 900;
 dom.window.matchMedia = media => ({ matches: false, media, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} }); HTMLElement.prototype.scrollTo = function() {};
 const { act, createElement: h } = await import('react'), { createRoot } = await import('react-dom/client'); let root, session;
 const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
 try {
  const output = path.join(temp, 'entry.mjs'); await build({ stdin: { contents: "export {TransferProposalForm} from './transfer-proposal-form.tsx'; export {TransferProposalSession} from '../../../../src/current-form/transfer-proposal.ts'; export {ReadContext} from '../../../../src/loading/read-scope.ts';", resolveDir: here, loader: 'tsx' }, outfile: output, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react','react-dom','react-dom/*'], banner: { js: "import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);" }, plugins: [{ name: 'css', setup(b) { b.onResolve({ filter: /\.css(?:\?inline)?$/ }, a => ({ path: a.path, namespace: 'css' })); b.onLoad({ filter: /.*/, namespace: 'css' }, () => ({ loader: 'js', contents: 'export default "";' })); } }] });
  const { TransferProposalForm, TransferProposalSession, ReadContext } = await import(pathToFileURL(output).href), context = new ReadContext({ accountId: uid(99), sessionRevision: '1', permissionRevision: '1' }), scope = context.createScope('test');
  const product = { id: uid(1), code: 'SYN', name: 'Synthetic', sizeGroupId: uid(2), retailPrice: null, minimumPriceAvailability: 'UNAVAILABLE' }, sku = { id: uid(3), skuCode: 'SYN-Y', productId: product.id, productCode: product.code, productName: product.name, colorId: uid(4), colorName: '白色', fitId: uid(5), fitName: 'Y版', sizeId: uid(6), sizeName: '165/S', sizeGroupId: uid(2), barcodeAvailability: 'UNAVAILABLE' }, group = { id: uid(2), name: 'SYN group', sizes: [{ id: uid(6), name: '165/S', displayOrder: 1 }] };
  const page = items => ({ page: 1, pageSize: 20, exactTotal: BigInt(items.length), items });
  session = new TransferProposalSession(scope, { readProducts: async () => page([product]), readProductSkus: async () => page([sku]), readTransferWarehouses: async () => page([]), readSizeGroups: async p => ({ page: p.page, pageSize: p.pageSize, total: 1, items: [group] }) });
  assert.equal(session.initializeFromSaved({ businessDate: '2026-10-31', note: 'SYN saved', from: { id: uid(10), name: 'FROM' }, to: { id: uid(11), name: 'TO' }, lines: [{ sku, product, quantity: '1', existingLineId: uid(80) }] }), true);
  const original = session.getSnapshot().draft, host = document.getElementById('root'); root = createRoot(host);
  await act(async () => root.render(h(TransferProposalForm, { session, scope, productReader: {}, denied() { throw Error('unexpected access failure'); }, busy: false, number: 'SYN-OLD', actions: null })));
  const settle = () => act(async () => { await new Promise(r => setTimeout(r, 60)); }); await settle();
  for (const mode of ['blur-cancel', 'Tab', 'Enter']) {
   const changeButton = host.querySelector('.mx-spec-edit'); assert.equal(!!changeButton, true, 'actual existing-row change control exists'); await act(async () => changeButton.click()); await settle(); let input = host.querySelector('input[data-transfer-pending=true]'); assert.equal(!!input, true, 'actual replacement quantity input exists');
   await act(async () => { input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '2'); input.dispatchEvent(new Event('input', { bubbles: true })); });
   if (mode === 'blur-cancel') {
    const cancel = host.querySelector('[data-mx=replace-cancel]'); assert.equal(!!cancel, true, 'actual replacement Cancel control exists'); await act(async () => { cancel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); cancel.focus(); });
    assert.equal(session.getSnapshot().draft === original, true, 'focusout toward Cancel must not commit the replacement');
    await act(async () => cancel.click());
   } else {
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: mode, bubbles: true, cancelable: true })));
    assert.equal(session.getSnapshot().draft === original, true, 'replacement keyboard movement must not commit'); assert.equal(session.getSnapshot().replacement !== null, true, 'replacement remains active');
    await act(async () => host.querySelector('[data-mx=replace-cancel]').click());
   }
   assert.equal(session.getSnapshot().replacement === null, true, 'replacement is canceled'); assert.equal(session.getSnapshot().draft === original, true, 'original draft identity is retained'); assert.equal(session.getSnapshot().dirty, false);
  }

  await act(async () => { session.reset(true); await session.openPicker('PRODUCT'); await session.selectPendingProduct(product.id); }); await settle();
  const fitButton = host.querySelector('#mx-transfer-fit'); assert.equal(!!fitButton, true, 'actual fit control exists'); assert.equal(fitButton.disabled, false, 'fit is enabled without color after genuine product SKUs are ready');
  await act(async () => fitButton.click()); await settle();
  const fitOption = document.querySelector(`[data-mx-spec-option="${sku.fitId}"]`); assert.equal(!!fitOption, true, 'the fit option lives in the actual body portal');
  await act(async () => fitOption.click());
  assert.equal(session.getSnapshot().pending.fit?.id, sku.fitId); assert.equal(session.getSnapshot().pending.color === null, true); assert.equal(host.querySelectorAll('input[data-transfer-pending=true]').length, 0, 'no quantity without a genuine color/fit/size SKU');
  await act(async () => session.selectPendingSpec('color', sku.colorId)); await settle();
  const freshQuantity = host.querySelector('input[data-transfer-pending=true]'); assert.equal(!!freshQuantity, true, 'genuine fresh-entry quantity input exists');
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(freshQuantity, '2'); freshQuantity.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => freshQuantity.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
  assert.equal(session.getSnapshot().draft.lines[0]?.quantity, '2', 'normal new-entry Tab auto-commit remains supported');

 } finally { if (root) await act(async () => root.unmount()); session?.dispose(); dom.window.close(); await rm(temp, { recursive: true, force: true }); }
});
