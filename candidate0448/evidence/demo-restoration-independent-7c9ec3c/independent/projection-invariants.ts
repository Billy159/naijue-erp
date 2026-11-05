import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { projectInventoryColors, knownDisplaySources } from '/workspace/shared/naijue-erp-rewrite/apps/web/src/inventory/display-projection.ts';
import { totalOf, assertInventoryPage } from '/workspace/shared/naijue-erp-rewrite/apps/web/src/inventory/model.ts';
import { emptyInventoryFilter } from '/workspace/shared/naijue-erp-rewrite/apps/web/src/inventory/contracts.ts';
const file = '/workspace/shared/naijue-erp-rewrite/apps/web/src/inventory/display-projection.ts';
const hash = () => createHash('sha256').update(readFileSync(file)).digest('hex');
const before = hash();
let state = 981231;
const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
let checked = 0, sourcesChecked = 0;
for (let trial = 0; trial < 80; trial++) {
  const sizes = Array.from({length:11}, (_, n) => ({ id: `size-${n}`, label: ['160/XS','165/S','170/M','175/L','180/XL','185/2XL','190/3XL','195/4XL','200/5XL','205/6XL','无尺码'][n] }));
  const colorFits = [];
  for (let c = 0; c < 3; c++) for (let f = 0; f < 3; f++) {
    const rows = [];
    for (let w = 0; w < 4; w++) if (random() % 5 !== 0) {
      const cells = Object.fromEntries(sizes.map((s, n) => [s.id, random() % 7 === 0 ? {state:'not-applicable'} : {state:'known', skuId:`sku-${c}-${f}-${n}`, quantity:((random() % 2 ? 1n : -1n) * (9007199254740993n + BigInt(random()))).toString()}]));
      rows.push({warehouse:{id:`warehouse-${w}`,label:`Warehouse ${w}`},cells,total:totalOf(Object.values(cells))});
    }
    colorFits.push({color:{id:`color-${c}`,label:`Color ${c}`},fit:{id:`fit-${f}`,label:`Fit ${f}`}, rows, sizeTotals:Object.fromEntries(sizes.map(s => [s.id,totalOf(rows.map(row=>row.cells[s.id]))])), total:totalOf(rows.flatMap(row=>Object.values(row.cells)))});
  }
  const product = {id:`p-${trial}`,code:'same-code',name:'same-label',categoryLabel:'c',supplierLabel:'s',seasonLabel:'ss',sizeGroup:{id:'all-sizes',label:'Full sizes'},sizes,colorFits,sizeTotals:Object.fromEntries(sizes.map(s=>[s.id,totalOf(colorFits.flatMap(group=>group.rows.map(row=>row.cells[s.id])))])),total:totalOf(colorFits.flatMap(group=>group.rows.flatMap(row=>Object.values(row.cells))))};
  assertInventoryPage({page:1,pageSize:100,exactTotalProducts:1,products:[product],warehouseLabels:[],allMatchesTotal:product.total,readReference:'independent-synthetic'},{filter:emptyInventoryFilter(),page:1,pageSize:100});
  const original = JSON.stringify(product);
  const output = projectInventoryColors(product);
  for (const color of output) for (const row of color.rows) for (const size of sizes) {
    const expected = colorFits.filter(group=>group.color.id===color.color.id).flatMap(group=>group.rows.filter(sourceRow=>sourceRow.warehouse.id===row.warehouse.id).map(sourceRow=>({group,sourceRow,cell:sourceRow.cells[size.id]})));
    const cell = row.cells[size.id];
    assert.equal(cell.sources.length,expected.length);
    assert.equal(cell.state,expected.some(source=>source.cell.state==='known')?'known':'not-applicable');
    if (cell.state==='known') assert.equal(cell.quantity,expected.reduce((sum,source)=>sum+(source.cell.state==='known'?BigInt(source.cell.quantity):0n),0n).toString());
    for (let i=0;i<expected.length;i++) {
      assert.equal(cell.sources[i].cell,expected[i].cell);
      assert.equal(cell.sources[i].fit,expected[i].group.fit);
      assert.equal(cell.sources[i].warehouse,expected[i].sourceRow.warehouse);
      assert.equal(cell.sources[i].size,size);
      assert.equal(cell.sources[i].productId,product.id);
      sourcesChecked++;
    }
    assert.equal(knownDisplaySources(cell).length,expected.filter(source=>source.cell.state==='known').length);
    checked++;
  }
  assert.equal(output.reduce((sum,g)=>sum+BigInt(g.total.knownQuantity),0n).toString(),product.total.knownQuantity);
  for (const size of sizes) assert.equal(output.reduce((sum,g)=>sum+BigInt(g.sizeTotals[size.id].knownQuantity),0n).toString(),product.sizeTotals[size.id].knownQuantity);
  assert.equal(JSON.stringify(product),original);
}
assert.equal(hash(),before,'Reviewed source changed while probe ran');
console.log(JSON.stringify({pass:true,trials:80,displayCellsChecked:checked,realSourcesChecked:sourcesChecked,sourceSha256:before,boundary:'Independent deterministic model oracle only; no browser, screenshot, database or performance claim.'},null,2));
