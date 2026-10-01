const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const dom = new JSDOM('<div></div>', {
  url: 'http://127.0.0.1:8877/?tr-space=profile-selection-regression',
  runScripts: 'outside-only',
});
const w = dom.window;
w.structuredClone = structuredClone;
for (const file of ['model.js', 'product-legacy-sizes.js', 'product-catalog.js', 'barcode-2026.js', 'product-master.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
}
const C = w.PRODUCT_CATALOG;
C.initialize(w.ERP_DEMO);
w.REAL_DATA_MODE = true;
const draft = C.newProduct();
Object.assign(draft, {
  id: 'PROFILE-SELECTION-TEST', name: '当前规格保存验证',
  categoryId: C.standardParents()[0].id, supplierId: C.suppliers[0].id,
  season: C.seasons[0].id, barcodeItemCode: '9901001',
  selectedColorIds: [C.colors[0].id, C.colors[1].id],
  selectedSizeIds: [C.group(draft.groupId).sizes[0].id],
  selectedFitIds: ['A'],
});

// Execute the production save boundary, with only persistence and catalog IO replaced.
const source = fs.readFileSync(path.join(root, 'real-data-bridge.mjs'), 'utf8');
const start = source.indexOf('bridge.saveProductProfile=async draft=>');
const end = source.indexOf('bridge.deleteProduct=async', start);
assert(start >= 0 && end > start);
const requests = [];
const bridge = { skus: new Map(), stockLoaded: new Set() };
const context = vm.createContext({
  bridge, C, D: w.ERP_DEMO, M: { canManage: () => true },
  copy: structuredClone, crypto: require('node:crypto').webcrypto,
  indexProductSkus() {},
  adaptedCatalogProduct: () => ({ ...structuredClone(draft), colorIds: [...draft.selectedColorIds], sizeIds: [...draft.selectedSizeIds] }),
  api: async (route, payload) => { requests.push({ route, payload }); return {}; },
});
vm.runInContext(source.slice(start, end), context);

(async () => {
  const before = JSON.stringify(draft);
  await bridge.saveProductProfile(draft);
  const save = requests.find(r => r.route === '/runtime/product-profile').payload;
  assert.deepEqual(Array.from(save.specs.colors), Array.from(draft.selectedColorIds));
  assert.deepEqual(Array.from(save.specs.sizes, s => s.id), Array.from(C.group(draft.groupId).sizes, s => s.id));
  assert.deepEqual(Array.from(save.specs.fits), ['A']);
  assert.equal(JSON.stringify(draft), before, '校验不能覆盖草稿的历史规格数组');
  await assert.rejects(bridge.saveProductProfile({ ...draft, id: 'EMPTY-COLOR', selectedColorIds: [] }), /有效颜色/);

  const original = { ...structuredClone(draft), id: 'RETAINED-PHOTO', colorIds: [...draft.selectedColorIds],
    images: [{ id: 'old-photo', role: '颜色配图', colorId: draft.selectedColorIds[0], url: 'data:image/png;base64,old' }] };
  const edited = { ...structuredClone(original), selectedColorIds: [draft.selectedColorIds[1]] };
  assert.equal(C.validate(edited, original), '', '退出当前颜色的原图片应继续保留为历史素材');
  const added = { ...edited, images: [...edited.images, { ...edited.images[0], id: 'new-orphan-photo' }] };
  assert.match(C.validate(added, original), /颜色配图/, '新上传图片仍须属于当前颜色');
  console.log('Current selection save, empty selection rejection, immutable draft, and retained historical photos: passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => dom.window.close());
