const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const dom = new JSDOM('', { runScripts: 'outside-only' });
const w = dom.window;
w.structuredClone = structuredClone;
try {
  for (const file of ['model.js', 'product-legacy-sizes.js', 'product-catalog.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  }
  const C = w.PRODUCT_CATALOG;
  C.initialize(w.ERP_DEMO);
  const p = C.newProduct();
  Object.assign(p, { id: 'QA-BARCODE-VALIDATION', name: '条码校验隔离样本', categoryId: 'shirts', supplierId: C.suppliers[0].id, groupId: 'FREE', colorIds: ['color-101'] });
  C.prepare(p);
  const key = C.specKey(p.colorIds[0], p.sizeIds[0]);
  p.barcodes[key] = { current: 'QA-VALID-PRIMARY', history: [], compatible: [{ code: 'QA-MANUAL-ALIAS', source: 'MANUAL' }] };
  const original = JSON.stringify(p);
  assert.equal(C.validate(p), '');
  assert.equal(JSON.stringify(p), original, 'validation must not change the product');
  const duplicate = C.clone(p);
  duplicate.barcodes['another-spec'] = { current: 'QA-VALID-PRIMARY', history: [] };
  assert.match(C.validate(duplicate), /同一条码不能绑定多个规格/);
  const aliasDuplicate = C.clone(p);
  aliasDuplicate.barcodes['another-spec'] = { current: 'QA-OTHER-PRIMARY', history: [], compatible: [{ code: 'QA-MANUAL-ALIAS', source: 'MANUAL' }] };
  assert.match(C.validate(aliasDuplicate), /同一条码不能绑定多个规格/);
  assert.equal(JSON.stringify(p), original);
  console.log('PASS primary and manual barcodes validate without changing identity; duplicate specifications rejected');
} finally { w.close(); }
