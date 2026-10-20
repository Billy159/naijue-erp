/** Read-only display projection. A displayed coordinate is never a stock identity. */
const key = value => JSON.stringify(value);
const text = value => value == null || value === '' ? null : String(value);
const field = (cell, camel, snake) => cell[camel] ?? cell[snake] ?? null;
const collator = new Intl.Collator('zh-CN', {numeric: true, sensitivity: 'base'});
export function originalMemberKey(cell) {
  const warehouseId = field(cell, 'warehouseId', 'warehouse_id'), skuId = field(cell, 'skuId', 'variant_id');
  if (!warehouseId || !skuId) throw new Error('库存单元缺少原仓库或原 SKU 身份');
  return key([warehouseId, skuId, cell.unit ?? null]);
}
export function exactQuantity(value) {
  if (value == null || value === '') return null;
  const source = String(value);
  if (!/^-?\d+(?:\.\d+)?$/.test(source)) throw new Error('库存数量不是已核实的精确小数');
  return source;
}
export function sumExact(values) {
  if (!values.length || values.some(value => exactQuantity(value) === null)) return null;
  const parts = values.map(value => {
    const source = exactQuantity(value), negative = source.startsWith('-');
    const [whole, fraction = ''] = (negative ? source.slice(1) : source).split('.');
    return {negative, whole, fraction};
  });
  const scale = parts.reduce((maximum, part) => Math.max(maximum, part.fraction.length), 0);
  const amount = parts.reduce((sum, part) => sum + (part.negative ? -1n : 1n) * BigInt(part.whole + part.fraction.padEnd(scale, '0')), 0n);
  const absolute = (amount < 0n ? -amount : amount).toString().padStart(scale + 1, '0');
  const fraction = scale ? absolute.slice(-scale).replace(/0+$/, '') : '';
  return (amount < 0n ? '-' : '') + (scale ? absolute.slice(0, -scale) : absolute) + (fraction ? '.' + fraction : '');
}
export const sameQuantity = (left, right) => sumExact([left]) === sumExact([right]);
function normalized(cell) {
  return {...cell, warehouseId: field(cell, 'warehouseId', 'warehouse_id'), skuId: field(cell, 'skuId', 'variant_id'),
    productId: field(cell, 'productId', 'product_id'), productCode: field(cell, 'productCode', 'product_code'),
    productName: field(cell, 'productName', 'product_name'), warehouseName: field(cell, 'warehouseName', 'warehouse_name'),
    warehouseCode: field(cell, 'warehouseCode', 'warehouse_code'), unit: cell.unit ?? null, quantity: exactQuantity(cell.quantity)};
}
function dimension(value, fallback, label) {
  return {key: text(value?.id) ?? text(value?.code) ?? fallback,
    label: text(value?.sourceName) ?? text(value?.name) ?? label, code: text(value?.sourceCode) ?? text(value?.code)};
}
function uniqueMembers(members) {
  const seen = new Set();
  for (const member of members) {
    const id = originalMemberKey(member);
    if (seen.has(id)) throw new Error('展示数量重复引用原仓库、SKU 和单位');
    seen.add(id);
  }
  return members;
}
export function sourceCaption(source = {}) {
  const derived = source.quantityMethod === 'DERIVED_FROM_TARGET_INVENTORY' || source.kind === 'DERIVED_FROM_TARGET_INVENTORY';
  return (derived ? '反推期初与后续有效变动' : '已核库存来源') +
    (source.historicalTimelineCompletenessClaimed === true ? '' : '；未声明完整历史时间线');
}

export function projectInventoryMatrix(snapshot, references = {}) {
  if (!Array.isArray(snapshot?.originalCells) || !Array.isArray(snapshot.warehouses)) throw new Error('库存页未提供原数量单元与仓库');
  const originalCells = uniqueMembers(snapshot.originalCells.map(normalized));
  const originals = new Map(originalCells.map(cell => [originalMemberKey(cell), cell]));
  const sourceSkus = new Map((snapshot.sourceSkus || []).map(sku => [sku.id, sku]));
  const products = new Map(), productsBySku = new Map();
  for (const product of snapshot.products || []) {
    if (product.uuid && !products.has(product.uuid)) products.set(product.uuid, product);
    for (const skuId of Object.values(product.skuByCell || {})) productsBySku.set(skuId, product);
  }
  const referenceMap = rows => new Map((rows || []).map(row => [String(row.id ?? row.value ?? row), String(row.name ?? row.label ?? row)]));
  const categories = referenceMap(references.categories), suppliers = referenceMap(references.suppliers), fits = referenceMap(references.fits);
  const blocks = new Map(), slots = new Map(), admitted = new Set();
  const sourceEntries = snapshot.standardItems ? snapshot.standardItems.flatMap(group => {
    if (!Array.isArray(group.members) || !group.members.length) throw new Error('标准展示未保留原 SKU 成员');
    const members = uniqueMembers(group.members.map(normalized));
    for (const member of members) {
      const original = originals.get(originalMemberKey(member));
      if (!original || !sameQuantity(original.quantity, member.quantity)) throw new Error('标准展示与原数量身份不一致');
      if (member.warehouseId !== group.warehouseId || member.productId !== group.productId || member.unit !== (group.unit ?? null)) throw new Error('标准展示混合了仓库、商品或单位');
    }
    if (!sameQuantity(group.quantity, sumExact(members.map(member => member.quantity)))) throw new Error('标准展示合计与原 SKU 精确数量不一致');
    // Unknown units/colors are never assumed equivalent merely because the
    // server exposes a shared display coordinate. Keep their original SKUs.
    return group.unit == null || group.colorId == null
      ? members.map(member => ({members: [member], quantity: member.quantity, standard: group.standard, colorId: group.colorId, unmappedSkuId: member.skuId}))
      : [{members, quantity: exactQuantity(group.quantity), standard: group.standard, colorId: group.colorId, unmappedSkuId: group.unmappedSkuId}];
  }) : originalCells.map(cell => ({members: [cell], quantity: cell.quantity}));
  for (const entry of sourceEntries) {
    for (const member of entry.members) {
      const id = originalMemberKey(member);
      if (admitted.has(id)) throw new Error('矩阵投影重复消费原库存单元');
      admitted.add(id);
    }
    const cell = entry.members[0], product = productsBySku.get(cell.skuId) || products.get(cell.productId) || {};
    const mapped = Boolean(snapshot.standardItems && entry.standard?.group && entry.standard?.size);
    const rawSku = sourceSkus.get(cell.skuId);
    const rawFit = cell.original?.fit || (rawSku?.fit_id ? {id: rawSku.fit_id, name: fits.get(rawSku.fit_id) || rawSku.fit_id} :
      productsBySku.has(cell.skuId) && product.fitId ? {id: product.fitId, name: product.fit || fits.get(product.fitId) || product.fitId} : null);
    const skuFit = Object.entries(product.skuByFitCell || {}).find(([, skuId]) => skuId === cell.skuId)?.[0]?.split('|')[1];
    const fit = mapped ? {key: key(['standard-fit', entry.standard.fit]), label: text(entry.standard.fit) || '版型待核实'}
      : dimension(rawFit || (skuFit ? {id: skuFit, name: fits.get(skuFit) || skuFit} : null), 'unknown-fit:' + cell.skuId, '版型待核实');
    const color = dimension(cell.original?.color || rawSku?.options?.COLOR, 'unknown-color:' + cell.skuId, '颜色待核实');
    if (mapped && entry.colorId) color.key = String(entry.colorId);
    const rawSize = dimension(cell.original?.size || rawSku?.options?.SIZE, 'unknown-size:' + cell.skuId, '尺码待核实');
    const size = mapped ? {key: key(['standard-size', entry.standard.group, entry.standard.fit, entry.standard.size, entry.standard.code]),
      label: String(entry.standard.size), code: text(entry.standard.code)} : rawSize;
    const productKey = cell.productId || 'sku:' + cell.skuId;
    const unknownUnitKey = cell.unit === null ? 'unknown-unit:' + cell.skuId : cell.unit;
    const sizeGroup = mapped ? ['standard', entry.standard.group] : [snapshot.standardItems ? 'unmapped-original' : 'original'];
    const blockKey = key([productKey, fit.key, unknownUnitKey, sizeGroup]);
    let block = blocks.get(blockKey);
    if (!block) {
      block = {key: blockKey, productKey, productId: cell.productId, code: text(cell.productCode) || text(product.sourceProductId) || text(product.styleNumber) || '款号待核实',
        name: text(cell.productName) || text(product.name) || '商品名称待核实', product, fitLabel: fit.label, unit: cell.unit,
        groupLabel: mapped ? String(entry.standard.group) : snapshot.standardItems ? '未映射原规格' : '原始规格',
        categoryLabel: text(product.categoryName) || categories.get(String(product.categoryId ?? product.category)) || '分类待核实',
        supplierLabel: suppliers.get(String(product.supplierId)) || '供应商待核实', seasonLabel: text(product.season) || '季节待核实',
        colors: new Map(), columns: new Map(), entries: [], warehouses: snapshot.warehouses.map(row => ({id: String(row.id), name: String(row.name || row.id), code: String(row.code || '')}))};
      blocks.set(blockKey, block);
    }
    block.colors.set(color.key, color); block.columns.set(size.key, size);
    if (!block.warehouses.some(row => row.id === cell.warehouseId)) block.warehouses.push({id: cell.warehouseId, name: cell.warehouseName || '仓库名称待核实', code: cell.warehouseCode || ''});
    const slot = key([blockKey, color.key, size.key]);
    const identity = mapped ? 'mapped' : cell.skuId;
    const identities = slots.get(slot) || new Set(); identities.add(identity); slots.set(slot, identities);
    block.entries.push({...entry, colorKey: color.key, sizeKey: size.key, warehouseId: cell.warehouseId, identity, slot});
  }
  if (admitted.size !== originals.size) throw new Error('矩阵投影未消费完整的当前页原数量单元');
  const result = [];
  for (const block of blocks.values()) {
    block.colors = [...block.colors.values()].sort((a, b) => collator.compare(a.label, b.label) || collator.compare(a.key, b.key));
    block.sizeColumns = [...block.columns.values()].sort((a, b) => collator.compare(a.label, b.label) || collator.compare(a.key, b.key));
    delete block.columns;
    block.cells = new Map(); block.colorLanes = new Map();
    for (const entry of block.entries) {
      const lane = [...slots.get(entry.slot)].sort().indexOf(entry.identity);
      const cellKey = key([entry.colorKey, entry.warehouseId, lane, entry.sizeKey]);
      if (block.cells.has(cellKey)) throw new Error('同一矩阵坐标有未区分的原 SKU');
      block.cells.set(cellKey, {quantity: entry.quantity, members: entry.members});
      block.colorLanes.set(entry.colorKey, Math.max(block.colorLanes.get(entry.colorKey) || 1, lane + 1));
    }
    block.members = uniqueMembers(block.entries.flatMap(entry => entry.members));
    block.quantity = sumExact(block.members.map(member => member.quantity));
    block.rowCount = block.colors.reduce((count, color) => count + (block.colorLanes.get(color.key) || 1) * block.warehouses.length, 0);
    result.push(block);
  }
  result.sort((a, b) => collator.compare(a.code, b.code) || collator.compare(a.productKey, b.productKey) || collator.compare(a.fitLabel, b.fitLabel) || collator.compare(a.key, b.key));
  return {blocks: result, originalCells, memberCount: originalCells.length, source: snapshot.source,
    readVersion: snapshot.readVersion, catalogVersion: snapshot.catalogVersion, productCount: snapshot.productCount};
}

function aggregateCell(cells, expectedCount) {
  const members = uniqueMembers(cells.flatMap(cell => cell?.members || []));
  const knownQuantity = sumExact(members.map(member => member.quantity));
  const complete = cells.length === expectedCount && cells.every(cell => cell && cell.quantity !== null);
  return {quantity: complete ? sumExact(cells.map(cell => cell.quantity)) : null, knownQuantity: complete ? null : knownQuantity,
    members, missing: expectedCount - cells.filter(Boolean).length};
}
export function inventoryBlockRows(block, {foldedColors = {}, subtotal = false, total = true} = {}) {
  const rows = [];
  for (const color of block.colors) {
    const colorRows = [], lanes = block.colorLanes.get(color.key) || 1;
    for (let lane = 0; lane < lanes; lane++) for (const warehouse of block.warehouses) {
      const cells = Object.fromEntries(block.sizeColumns.map(column => [column.key, block.cells.get(key([color.key, warehouse.id, lane, column.key])) || null]));
      cells.total = aggregateCell(Object.values(cells).filter(Boolean), block.sizeColumns.length);
      colorRows.push({key: key([block.key, color.key, warehouse.id, lane]), blockKey: block.key, colorKey: color.key,
        productLabel: block.code + ' / ' + block.name, colorLabel: color.label + (lane ? ' · 独立原 SKU ' + (lane + 1) : ''),
        warehouseLabel: warehouse.name, warehouseId: warehouse.id, unitLabel: block.unit || '单位待核实', cells, kind: 'detail'});
    }
    const summary = {key: key([block.key, color.key, 'subtotal']), blockKey: block.key, colorKey: color.key, productLabel: block.code + ' / ' + block.name,
      colorLabel: color.label, warehouseLabel: '已核单元小计', unitLabel: block.unit || '单位待核实', kind: 'subtotal',
      cells: Object.fromEntries(block.sizeColumns.map(column => [column.key, aggregateCell(colorRows.map(row => row.cells[column.key]).filter(Boolean), colorRows.length)]))};
    summary.cells.total = aggregateCell(colorRows.map(row => row.cells.total), colorRows.length);
    if (foldedColors[color.key]) rows.push({...summary, kind: 'folded-color'});
    else {rows.push(...colorRows); if (subtotal) rows.push(summary);}
  }
  if (total && block.colors.length) {
    const cells = Object.fromEntries(block.sizeColumns.map(column => [column.key, aggregateCell(block.entries.filter(entry => entry.sizeKey === column.key),
      block.colors.reduce((count, color) => count + (block.colorLanes.get(color.key) || 1) * block.warehouses.length, 0))]));
    cells.total = {quantity: block.quantity, members: block.members};
    rows.push({key: key([block.key, 'total']), blockKey: block.key, productLabel: block.code + ' / ' + block.name, colorLabel: '已核单元合计', warehouseLabel: '当前商品页匹配范围',
      unitLabel: block.unit || '单位待核实', cells, kind: 'total'});
  }
  return rows;
}

export function matrixQuantityLabel(cell) {
  if (!cell || cell.quantity === null) return cell?.knownQuantity != null ? '已核 ' + cell.knownQuantity + '（另有未知格）' : '未知';
  return exactQuantity(cell.quantity);
}
export function inventoryMatrixReport(snapshot, references = {}) {
  const projection = projectInventoryMatrix(snapshot, references);
  const rows = [['奈爵服饰 库存状况表'], ['数量来源', sourceCaption(snapshot.source)], ['读取版本', snapshot.readVersion],
    ['范围', `全部匹配 ${snapshot.productCount} 款；原库存单元 ${snapshot.rowCount}`]];
  for (const block of projection.blocks) {
    rows.push([block.code, block.name, block.fitLabel, block.unit || '单位待核实', block.groupLabel]);
    rows.push(['款号', '商品名称', '颜色', '仓库', '计量单位', ...block.sizeColumns.map(column => column.label)]);
    for (const row of inventoryBlockRows(block, {subtotal: false, total: false})) rows.push([block.code, block.name, row.colorLabel, row.warehouseLabel,
      block.unit || '单位待核实', ...block.sizeColumns.map(column => matrixQuantityLabel(row.cells[column.key]))]);
  }
  rows.push([], ['原数量身份与来源'], ['仓库 ID', '原 SKU', '商品 ID', '款号', '计量单位', '精确账面数量', '来源批次', '数量方法', '完整历史声明']);
  for (const cell of projection.originalCells) rows.push([cell.warehouseId, cell.skuId, cell.productId || '', cell.productCode || '', cell.unit ?? '单位待核实', cell.quantity ?? '未知',
    cell.basis?.runId || snapshot.source?.runId || '', cell.quantityMethod || snapshot.source?.quantityMethod || '未知', cell.historicalTimelineCompletenessClaimed === true ? '已声明' : '未声明']);
  return rows;
}

const escaped = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
export function inventoryMatrixMarkup(snapshot, references = {}, display = {}) {
  const projection = projectInventoryMatrix(snapshot, references);
  return projection.blocks.map(block => {
    const headers = ['款号 / 商品名称', ...(display.category ? ['商品分类'] : []), ...(display.supplierId ? ['供应商'] : []),
      ...(display.fitId ? ['版型'] : []), ...(display.groupId ? ['尺码组'] : []), ...(display.season ? ['季节'] : []), '颜色', '仓库', '单位',
      ...block.sizeColumns.map(column => column.label + (display.sizeDescription && column.code && column.code !== column.label ? ' / ' + column.code : '')),
      ...(display.total ? ['已核单元合计'] : [])];
    const rows = inventoryBlockRows(block, {subtotal: display.subtotal, total: display.total});
    return '<section class="mx-section"><h2>' + escaped([block.code, block.name, block.fitLabel, block.unit || '单位待核实', block.groupLabel].join(' · ')) + '</h2>' +
      '<table><thead><tr>' + headers.map(header => '<th>' + escaped(header) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(row => {
        const fields = [block.code + ' / ' + block.name, ...(display.category ? [block.categoryLabel] : []), ...(display.supplierId ? [block.supplierLabel] : []),
          ...(display.fitId ? [block.fitLabel] : []), ...(display.groupId ? [block.groupLabel] : []), ...(display.season ? [block.seasonLabel] : []), row.colorLabel, row.warehouseLabel, row.unitLabel];
        return '<tr class="' + escaped(row.kind) + '">' + fields.map(field => '<td class="identity">' + escaped(field) + '</td>').join('') +
          [...block.sizeColumns.map(column => row.cells[column.key]), ...(display.total ? [row.cells.total] : [])].map(cell =>
            '<td data-original-members="' + escaped(key((cell?.members || []).map(originalMemberKey))) + '">' + escaped(matrixQuantityLabel(cell)) + '</td>').join('') + '</tr>';
      }).join('') + '</tbody></table></section>';
  }).join('') || '<p>当前范围没有已核实的库存单元。</p>';
}
