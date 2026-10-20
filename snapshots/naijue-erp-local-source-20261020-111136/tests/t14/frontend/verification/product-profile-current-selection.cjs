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
for (const file of ['model.js', 'product-legacy-sizes.js', 'product-catalog.js', 'barcode-2026.js', 'product-master.js', 'product-identity.js']) {
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
const bridge = { skus: new Map(), rawSkuById: new Map(), stockLoaded: new Set() };
let stored;
const catalogReadback = () => {
  assert(stored, '合成服务读取必须跟随实际保存请求');
  const group = C.group(stored.profile.groupId);
  const skus = stored.specs.colors.flatMap(color => stored.specs.fits.flatMap(fit => stored.specs.sizes.map(size => ({
    id: [color, fit, size.id].join('-'), product_id: stored.productId, fit_id: fit, enabled: true,
    options: { COLOR: { id: color, name: C.colors.find(c => c.id === color).name }, SIZE: { ...size, currentGroupId: group.id } },
  }))));
  return { products: [{ id: stored.productId, code: stored.newCode, name: stored.profile.name, fit_name: 'A版', source_type: 'V2', attributes: stored.profile }],
    profiles: [{ product_id: stored.productId, version: 1, body: stored.profile }], skus, barcodes: [], aliases: [] };
};
const context = vm.createContext({
  bridge, C, D: w.ERP_DEMO, M: { canManage: () => true },
  copy: structuredClone, crypto: require('node:crypto').webcrypto,
  ERP_API: { complete() {}, ServiceError: Error },
  PRODUCT_IDENTITY: w.PRODUCT_IDENTITY,
  api: async (route, payload) => {
    requests.push({ route, payload });
    if (route === '/runtime/product-profile') { stored = structuredClone(payload); return { ok: true }; }
    if (route === '/runtime/catalog') return catalogReadback();
    if (route === '/runtime/product-identity') return { version: 1, products: [{ productId: stored.productId, code: stored.newCode }], productCodes: [],
      skus: catalogReadback().skus.map(sku => ({ skuId: sku.id, productId: sku.product_id, productCode: stored.newCode, fitId: sku.fit_id, options: sku.options, enabled: true, codes: [] })) };
    throw Error('Unexpected synthetic IO: ' + route);
  },
});

(async () => {
  const service = await import(path.join(root, 'product-service.mjs'));
  const Adapter = await import(path.join(root, 'legacy-adapter.mjs'));
  const { currentSpecView } = await import(path.join(root, 'product-spec-view.mjs'));
  Object.assign(context, service, { Adapter, currentSpecView });
  const adapterStart = source.indexOf('function adaptedCatalogProduct('), adapterEnd = source.indexOf('const oldRender=', adapterStart);
  const sortStart = source.indexOf('const sortSkus='), sortEnd = source.indexOf('\n', sortStart);
  const indexStart = source.indexOf('const indexProductSkus='), indexEnd = source.indexOf(';for(const p of products)', indexStart) + 1;
  assert(adapterStart >= 0 && adapterEnd > adapterStart && sortStart >= 0);
  assert(indexStart >= 0 && indexEnd > indexStart, '实际 SKU 索引函数须存在');
  vm.runInContext(source.slice(sortStart, sortEnd) + '\n' + source.slice(indexStart, indexEnd) + '\n' + source.slice(adapterStart, adapterEnd) + source.slice(start, end), context);
  const before = JSON.stringify(draft);
  const saved = await bridge.saveProductProfile(draft);
  const save = requests.find(r => r.route === '/runtime/product-profile').payload;
  assert.deepEqual(Array.from(save.specs.colors), Array.from(draft.selectedColorIds));
  assert.deepEqual(Array.from(save.specs.sizes, s => s.id), Array.from(C.group(draft.groupId).sizes, s => s.id));
  assert.deepEqual(Array.from(save.specs.fits), ['A']);
  assert.equal(saved.id, draft.id);
  assert.equal(saved.uuid, stored.productId, '回读保存的原商品身份');
  assert.deepEqual(Array.from(saved.selectedColorIds), Array.from(draft.selectedColorIds));
  assert.equal(bridge.rawSkuById.size, save.specs.colors.length * save.specs.fits.length * save.specs.sizes.length, '回读全部当前规格');
  assert.equal(bridge.skus.size, bridge.rawSkuById.size, '保存回读须建立全部原 SKU 索引');
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
