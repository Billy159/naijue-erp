/** TEST ONLY public DOM/HTTP observer. No React/private-query introspection,
 * layout instrumentation, application mutation, Node import or timing verdict. */
export const SETTINGS = Object.freeze({ category: '商品分类', supplier: '供应商', fit: '版型', sizeGroup: '尺码组', season: '季节', subtotal: '颜色小计', total: '商品合计', sizeDescription: '显示尺码组说明' });
export const DEFAULTS = Object.freeze({ category: true, supplier: false, fit: false, sizeGroup: false, season: false, subtotal: false, total: true, sizeDescription: false });
const compact = value => String(value ?? '').replace(/\s+/g, '');
const quantity = value => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export function sameJson(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
export function resolveInventoryAction({ root, target, mode, setting }) {
  if (!root || !target?.isConnected) return null;
  if (mode === 'FIRST_QUERY') {
    const button = target.closest?.('button.iw-query-button');
    return button && root.contains(button) && !button.disabled && compact(button.textContent) === '查询' ? { mode, setting: null } : null;
  }
  if (mode === 'DISPLAY_SETTING' && Object.hasOwn(SETTINGS, setting)) {
    const input = target.closest?.('input[type="checkbox"]');
    const popup = input?.closest('[role="dialog"][aria-label="显示设置"]');
    return input && popup?.isConnected && !input.disabled && compact(input.closest('label')?.textContent) === SETTINGS[setting]
      ? { mode, setting, checked: input.checked } : null;
  }
  return null;
}
export function createObservationGate() {
  let current = null, sequence = 0;
  return Object.freeze({
    begin(mode) { if (current || !['FIRST_QUERY', 'DISPLAY_SETTING'].includes(mode)) return null; current = { sequence: ++sequence, mode, phase: 'arming' }; return { ...current }; },
    confirm(ticket) { if (current?.sequence !== ticket?.sequence || current.phase !== 'arming') return false; current.phase = 'armed'; return true; },
    consume(action) { if (!action || current?.phase !== 'armed' || current.mode !== action.mode) return null; current.phase = 'running'; return { ...current }; },
    finish(ticket) { if (current?.sequence !== ticket?.sequence) return false; current = null; return true; },
    cancel() { const previous = current; current = null; return previous ? { ...previous } : null; },
    state() { return current ? { ...current } : null; },
  });
}
/** Pure extraction of terminal ownership; expected owner must never acquire a
 * later operation. Deferred rejection tests cover this separate from DOM. */
export function claimTerminalOwner(expected, current) {
  if (!expected || current !== expected || current.finished) return null;
  current.finished = true; return current;
}
/** Public DOM epochs only. React reuses the status DIV, so child additions
 * alone miss measurement completion. oldValue and the NEXT record recover the
 * actual per-target transition even if one microtask contains multiple writes.
 * A disconnected/previous viewport or a final non-measured state certifies
 * nothing. Duplicate measured writes and detach/reinsert are not new epochs. */
export function createMeasuredEpochTracker(document) {
  const activated = new WeakSet(); let epoch = 0;
  const currentMeasured = node => node?.nodeType === 1 && node.isConnected
    && node.getAttribute('data-inventory-windowed') === 'measured'
    && node.closest('#iw-results') === document.getElementById('iw-results');
  return Object.freeze({
    consume(records) {
      const transitions = new Map(), added = new Set();
      for (const record of records) {
        if (record.type === 'attributes' && record.attributeName === 'data-inventory-windowed') {
          const list = transitions.get(record.target) ?? []; list.push(record); transitions.set(record.target, list);
        }
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          for (const measured of [...(node.matches('[data-inventory-windowed="measured"]') ? [node] : []), ...node.querySelectorAll('[data-inventory-windowed="measured"]')]) added.add(measured);
        }
      }
      for (const [node, list] of transitions) {
        if (!currentMeasured(node)) continue;
        for (let i = 0; i < list.length; i++) {
          const after = i + 1 < list.length ? list[i + 1].oldValue : node.getAttribute('data-inventory-windowed');
          if (list[i].oldValue !== 'measured' && after === 'measured') { epoch++; activated.add(node); }
        }
      }
      for (const node of added) if (currentMeasured(node) && !activated.has(node)) { activated.add(node); epoch++; }
      return epoch;
    },
    epoch() { return epoch; },
  });
}
export function readSettings(document) {
  const popup = document.querySelector('[role="dialog"][aria-label="显示设置"]');
  if (!popup) return null;
  const result = {};
  for (const [key, label] of Object.entries(SETTINGS)) {
    const matches = [...popup.querySelectorAll('label')].filter(node => compact(node.textContent) === label);
    const input = matches.length === 1 ? matches[0].querySelector('input[type="checkbox"]') : null;
    if (!input || input.disabled) return null; result[key] = input.checked;
  }
  return result;
}
export function readPageSizeControl(document) {
  // Original SingleChoice→SourceControl places the native Arco control inside
  // this explicit OPEN shadow host. Never global-deep-scan or private probing.
  const wrapper = document.querySelector('#page .iw-pagination > .ui-single-host');
  const hosts = [...(wrapper?.children ?? [])].filter(node => node.shadowRoot?.mode === 'open');
  if (hosts.length !== 1) return null;
  const controls = hosts[0].shadowRoot.querySelectorAll('#root .ui-page-size-select');
  return controls.length === 1 ? controls[0] : null;
}
export function captureInventoryDom(document) {
  const viewport = document.querySelector('#iw-results'), measured = viewport?.querySelector('[data-inventory-windowed="measured"]');
  const viewportRect = viewport?.getBoundingClientRect();
  const rows = measured ? [...measured.querySelectorAll('tbody tr[data-inventory-product]')].map(row => {
    const header = row.closest('table')?.querySelector('thead tr'), cells = [...row.children];
    const rect = row.getBoundingClientRect(); // ONE row BBox read, not width+height separate reads
    return { productId: row.getAttribute('data-inventory-product'), productCode: row.querySelector('.mx-product-identity strong')?.textContent ?? null,
      productName: row.querySelector('.mx-product-identity span')?.textContent ?? null,
      metadata: Object.fromEntries([...row.querySelectorAll('.mx-meta > span')].map(span => { const label = span.querySelector('em')?.textContent ?? ''; return [compact(label), (span.textContent ?? '').slice(label.length).trim()]; })),
      kind: row.classList.contains('mx-total') ? 'product-total' : row.classList.contains('mx-subtotal') ? 'color-total' : 'warehouse',
      color: cells[1]?.textContent ?? '', warehouse: cells[2]?.getAttribute('title') ?? null,
      cellValues: [...(header?.children ?? [])].flatMap((th, index) => th.hasAttribute('data-size-id') ? [{ sizeId: th.getAttribute('data-size-id'), sizeLabel: th.textContent ?? '', text: cells[index]?.textContent ?? '', notApplicable: cells[index]?.classList.contains('mx-invalid') ?? false }] : []),
      total: row.querySelector('.mx-total-cell')?.textContent ?? '', connected: row.isConnected,
      axisParts: [...(header?.children ?? [])].slice(3, -2).map(th => th.hasAttribute('data-size-id') ? { kind: 'size', id: th.getAttribute('data-size-id'), label: th.textContent ?? '' } : { kind: 'gap', span: th.colSpan, hidden: th.getAttribute('aria-hidden') === 'true' }),
      // Geometry is a real read-only browser observation, not simulated proof.
      rect: { width: rect.width, height: rect.height, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      intersectsViewport: !!viewportRect && rect.width > 0 && rect.height > 0 && rect.right > viewportRect.left && rect.left < viewportRect.right && rect.bottom > viewportRect.top && rect.top < viewportRect.bottom,
    };
  }) : [];
  return { hash: document.defaultView?.location.hash ?? '', busy: viewport?.getAttribute('aria-busy'), measured: !!measured,
    viewport: viewport ? { width: viewport.clientWidth, height: viewport.clientHeight, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop } : null,
    probeRowsRemaining: document.querySelectorAll('[data-probe-row]').length, probeSectionsRemaining: document.querySelectorAll('[data-probe-section]').length,
    collapsedFoldCount: measured?.querySelectorAll('.mx-fold[aria-expanded="false"]').length ?? 0,
    descriptions: measured ? [...measured.querySelectorAll('.mx-section h3')].map(node => ({ hidden: node.hidden, text: node.textContent ?? '' })) : [],
    stats: document.querySelector('.iw-stats')?.textContent ?? '', pagination: document.querySelector('.iw-pagination')?.textContent ?? '',
    pageSizeText: readPageSizeControl(document)?.textContent ?? '',
    error: [...document.querySelectorAll('#page [role="alert"]')].filter(node => !node.closest('[hidden]')).map(node => node.textContent?.trim()).filter(Boolean),
    preparing: !![...document.querySelectorAll('#iw-results [role="status"]')].find(node => !node.closest('[hidden]') && /正在整理|正在查询/.test(node.textContent ?? '')),
    stylesReady: [...document.querySelectorAll('link[rel="stylesheet"]')].filter(link => !link.disabled && link.media !== 'not all').every(link => !!link.sheet)
      && !!document.querySelector('link[href$="/source-styles/arco.css"]')?.sheet
      && [...document.querySelectorAll('link[data-frozen-style]')].some(link => ['inventory-workbench.css', 'inventory-with-products.css'].includes(link.getAttribute('data-frozen-style')) && link.media !== 'not all' && !!link.sheet),
    fontsReady: document.fonts?.status === 'loaded', rows };
}
/** expectedRows are the original public display projection from the exact wire
 * DTO, NOT application model state. Hidden/unlabelled fit IDs cannot be observed
 * in DOM; those full canonical identities are verified from actual wire facts.
 * @returns {{ready:false,reason:string}|{ready:true,visibleRows:number,renderedRows:number,visibleProducts:string[],matchedCells:number,wireProductCount:number,exactTotalProducts:number,readReference:string,decoderScope:string,domIdentityScope:string}}
 */
export function inspectInventoryReady({ dom, query, dto, expectedRows, busyObserved, requestCompleted, settingsKnown, settingsMatch = true, requiresNewRead = true, settingsChangeObserved = false, acceptedReadEpochMatches = false, measurementEpochObserved = false, settings = DEFAULTS }) {
  const fail = reason => ({ ready: false, reason });
  if (!requestCompleted || requiresNewRead && !busyObserved) return fail('Current matching operation body/busy transition not observed');
  if (!requiresNewRead && (!settingsChangeObserved || !acceptedReadEpochMatches)) return fail('Pure display change lacks current settings event/same accepted DTO epoch');
  if (!measurementEpochObserved) return fail('This action has no new public probe/measured epoch; old DOM is not new success');
  if (!dto || !sameJson({ page: dto.page, pageSize: dto.pageSize }, { page: query.page, pageSize: query.pageSize })) return fail('Wrong current wire page');
  if (!settingsKnown || !settingsMatch) return fail('Original settings are not observed/matching');
  if (dom.hash !== '#inventory' || dom.busy !== 'false' || !dom.measured || dom.preparing || dom.error.length) return fail('Original active result is not successful/measured');
  if (!dom.fontsReady || !dom.stylesReady || !dom.viewport || dom.viewport.width <= 0 || dom.viewport.height <= 0 || dom.probeRowsRemaining || dom.probeSectionsRemaining) return fail('Viewport/styles/fonts/measurement still pending');
  if (!compact(dom.pageSizeText).includes(`${query.pageSize}款/页`)) return fail('Original page-size control differs');
  const total = quantity(dto.allMatchesTotal.knownQuantity);
  if (!compact(dom.stats).includes(`${dto.exactTotalProducts}款商品`) || !compact(dom.stats).includes(`${dto.warehouseLabels.length}个仓库`) || !compact(dom.stats).includes(`库存${total}`)) return fail('Original complete summary differs');
  const start = (query.page - 1) * query.pageSize + 1, end = Math.min(query.page * query.pageSize, dto.exactTotalProducts);
  if (!compact(dom.pagination).includes(`当前第${start}–${end}款`)) return fail('Original page range differs');
  if (!dto.products.length || !dom.rows.length) return fail('Nonempty baseline has no real windowed rows');
  if (!dom.rows.some(row => row.intersectsViewport) || dom.collapsedFoldCount) return fail('Viewport is blank or baseline has changed fold state');
  if (dom.descriptions.some(description => description.hidden === settings.sizeDescription)) return fail('Size-description visibility differs');
  if (settings.sizeDescription && !dom.descriptions.some(description => dto.products.some(product => description.text.includes(product.sizeGroup.label) && product.sizes.every(size => description.text.includes(size.label))))) return fail('Size-description source facts differ');
  const products = new Map(dto.products.map(product => [product.id, product])); let matchedCells = 0;
  for (const row of dom.rows) {
    const product = products.get(row.productId);
    if (!product || !row.connected || row.rect.width <= 0 || row.rect.height <= 0 || !row.cellValues.length) return fail('Stale/foreign/empty-geometry row');
    if (row.productCode !== null && row.productCode !== product.code || row.productName !== null && row.productName !== product.name) return fail('Visible product identity text differs');
    const fields = { category: ['分类', product.categoryLabel], supplier: ['供应商', product.supplierLabel], season: ['季节', product.seasonLabel], sizeGroup: ['尺码组', product.sizeGroup.label] };
    for (const [key, [label, value]] of Object.entries(fields)) {
      if (!settings[key] && Object.hasOwn(row.metadata, label) || Object.hasOwn(row.metadata, label) && row.metadata[label] !== (value || '未设置')) return fail('Displayed metadata differs from actual source/settings');
    }
    if (!settings.fit && Object.hasOwn(row.metadata, '版型')) return fail('Hidden fit metadata still displayed');
    if (!settings.total && row.kind === 'product-total' || !settings.subtotal && row.kind === 'color-total') return fail('Disabled summary row still rendered');
    let axisIndex = 0; const visibleIds = [];
    if (!Array.isArray(row.axisParts) || !row.axisParts.length) return fail('Original windowed axis coverage missing');
    for (const part of row.axisParts) {
      if (part.kind === 'gap') { if (!part.hidden || !Number.isSafeInteger(part.span) || part.span < 1) return fail('Invalid column gap'); axisIndex += part.span; }
      else if (part.kind === 'size') { const size = product.sizes[axisIndex++]; if (!size || size.id !== part.id || compact(size.label) !== compact(part.label)) return fail('Size axis order/identity differs'); visibleIds.push(part.id); }
      else return fail('Unknown axis part');
    }
    if (axisIndex !== product.sizes.length || new Set(visibleIds).size !== visibleIds.length || !sameJson(visibleIds, row.cellValues.map(cell => cell.sizeId))) return fail('Incomplete/duplicate/foreign visible axis or gap coverage');
    const candidates = expectedRows.filter(expected => expected.productId === row.productId && expected.kind === row.kind && (row.kind === 'product-total' || compact(row.color).endsWith(compact(expected.color))) && (row.kind !== 'warehouse' || row.warehouse === expected.warehouse));
    if (!candidates.some(expected => (!Object.hasOwn(row.metadata, '版型') || row.metadata['版型'] === expected.fitLabel) && compact(row.total) === quantity(expected.total) && row.cellValues.every(cell => {
      const size = product.sizes.find(size => size.id === cell.sizeId), fact = expected.cells[cell.sizeId];
      return size && compact(cell.sizeLabel) === compact(size.label) && fact && (fact.state === 'not-applicable' ? cell.notApplicable && compact(cell.text) === '—' : !cell.notApplicable && compact(cell.text) === quantity(fact.quantity));
    }))) return fail('Visible size/quantity/total differs from complete original projection');
    matchedCells += row.cellValues.length;
  }
  for (const [key, label] of [['category', '分类'], ['supplier', '供应商'], ['fit', '版型'], ['season', '季节'], ['sizeGroup', '尺码组']]) if (settings[key] && !dom.rows.some(row => row.intersectsViewport && Object.hasOwn(row.metadata, label))) return fail('Enabled metadata has no matching viewport witness');
  return { ready: true, visibleRows: dom.rows.filter(row => row.intersectsViewport).length, renderedRows: dom.rows.length, visibleProducts: [...new Set(dom.rows.filter(row => row.intersectsViewport).map(row => row.productId))], matchedCells,
    wireProductCount: dto.products.length, exactTotalProducts: dto.exactTotalProducts, readReference: dto.readReference,
    decoderScope: 'Exact validated HTTP DTO + original public success DOM; no private decoder promise inspected',
    domIdentityScope: 'Public product/size IDs, color/warehouse labels and values. Unlabelled fit/SKU identities are wire-verified, not private DOM facts.' };
}
