import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const frozen = '/workspace/shared/frozen-demo-ui/extracted/8877-ui-evidence-b8bcfe3';
const read = name => readFile(path.join(frozen, name), 'utf8'); const own = name => readFile(path.join(here, '..', name), 'utf8');
const [order, layout, current, golden, matrix, matrixCss, finalCss, goldenCss, filters, dates, single, page, controls, detailCss, detail, pager] = await Promise.all([
  read('LOAD_ORDER.md'), read('LAYOUT_MAP.md'), read('frontend/transfer-current.js'), read('frontend/transfer-golden.js'), read('frontend/transfer-matrix-experiment.js'), read('frontend/matrix-experiments.css'), read('frontend/final-ui.css'), read('frontend/golden-consistency.css'), read('frontend/inventory-filters.jsx'), read('frontend/transfer-date.jsx'), read('frontend/unified-single-select.jsx'), own('transfers-page.tsx'), own('filter-controls.tsx'), own('detail.css'), own('detail-content.tsx'), own('pagination.tsx'),
]);
assert.match(order, /transfer-golden\.js/); assert.match(layout, /transfer-matrix-experiment\.js/);
const sourceColumns = golden.match(/head\.innerHTML=(\[[^\]]+\])\.map/); assert.ok(sourceColumns); const expected = JSON.parse(sourceColumns[1].replaceAll("'", '"'));
const ownColumns = page.match(/\{(\['日期', '调拨单号'[^\]]+\])\.map/); assert.ok(ownColumns); assert.deepEqual(JSON.parse(ownColumns[1].replaceAll("'", '"')), expected);
assert.match(golden, /data-transfer-date="start"/); assert.match(golden, /data-transfer-date="end"/); assert.match(golden, /\['status','from','to'\]/); assert.match(filters, /TreeSelect/); assert.match(dates, /DatePicker/); assert.match(single, /ui-page-size-select/);
assert.match(controls, /DatePicker, TreeSelect/); assert.match(controls, /treeCheckable treeCheckStrictly/); assert.match(controls, /visibleTagLimit/); assert.match(pager, /<Select/);
assert.match(current, /查看调拨单/); assert.match(matrix, /款号／商品名称/); assert.match(matrix, /mx-fit-col/); assert.match(matrixCss, /tc-subtotal[^\n]+position:sticky/); assert.match(finalCss, /\.ui-action-cell[^\n]+position:sticky/);
assert.match(goldenCss, /\.mx-fit-col[^\n]+left:356px/); assert.match(detailCss, /\.mx-fit-col[^\n]+left:356px/); assert.match(detailCss, /\.tc-subtotal\{position:sticky;right:96px/); assert.match(detailCss, /\.ui-action-cell\{position:sticky;right:0/); assert.match(detailCss, /align-items:baseline;gap:4px/); assert.match(detailCss, /max-width:68%/); assert.match(detailCss, /tc-gold-footer[^\n]+gap:8px[^\n]+height:42px[^\n]+font-size:12px/);
assert.match(detail, /className="ui-action-cell"/); assert.match(detail, /transferMatrixDisplay/); assert.doesNotMatch(page + controls + detail, /ERP_DEMO|TRANSFER_SERVICE|GOLD\.|localStorage|sessionStorage|data-t=/);
console.log('PASS frozen-source mapping: final list columns/filters/source controls/page-size contract; source full-page detail, canonical matrix vocabulary and final sticky/baseline/footer geometry are mapped to scoped leaf code.');
console.log('Approved canonical-ID, honest missing-fact, readonly and large-grid fallback departures are documented. This is static evidence, not real-browser computed-style or pixel acceptance.');
