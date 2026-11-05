/* Transfer-only continuous scanning workspace. Quantities come from TRANSFER_UI.state.doc.q. */
(function () {
  'use strict';
  const U = window.TRANSFER_UI;
  const T = U.state;
  const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const product = id => window.PRODUCT_CATALOG?.businessProduct?.(id) || window.ERP_DEMO.products.find(item => item.id === id);
  const active = () => /^#transfer\/(new|doc\/)/.test(location.hash) && !!T.doc;
  const editable = () => active() && T.doc.status === '未审核' && !T.busy && !T.blocked && !T.viewLatest && T.lease?.expires > Date.now();
  const unavailableReason = () => T.blocked || (T.doc?.status === '已审核' ? '已审核单据请先弃审' : ['已删除', '已作废'].includes(T.doc?.status) ? '已作废单据不可录入' : T.busy ? '正在提交，请稍候' : T.viewLatest ? '当前视图不可录入' : '正在恢复编辑资格，请稍候');
  const drawer = document.createElement('aside');
  drawer.id = 'transfer-scan-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'false');
  drawer.setAttribute('aria-label', '调拨扫码录入');
  drawer.hidden = true;
  drawer.innerHTML = `
    <header class="tsd-header">
      <h2>扫码录入</h2><span class="tsd-doc" data-transfer-doc></span>
      <button type="button" class="tsd-close" data-transfer-close aria-label="关闭扫码抽屉">×</button>
    </header>
    <section class="tsd-feedback" data-transfer-scan-feedback data-state="idle" role="status" aria-live="polite"></section>
    <div class="tsd-scan-control">
      <label for="transfer-scan-input">条码</label>
      <input id="transfer-scan-input" type="text" autocomplete="off" spellcheck="false" placeholder="扫描条码，回车自动录入" aria-describedby="tsd-scan-hint">
      <p id="tsd-scan-hint">扫描后自动清空，可连续扫描下一件</p>
    </div>
    <div class="tsd-list-title"><h3>录入明细</h3><span data-transfer-count>0 条明细</span></div>
    <div class="tsd-grid-head" aria-hidden="true"><span>款号／商品名称</span><span>颜色</span><span>版型</span><span>尺码</span><span>数量</span><span>操作</span></div>
    <div class="tsd-list" data-transfer-list></div>`;
  document.body.append(drawer);

  const input = drawer.querySelector('#transfer-scan-input');
  const list = drawer.querySelector('[data-transfer-list]');
  const feedbackEl = drawer.querySelector('[data-transfer-scan-feedback]');
  let open = false;
  let docId = null;
  let origin = null;
  let generation = 0;
  let queue = Promise.resolve();
  let composing = false;
  let feedback = { state: 'idle' };
  let feedbackTimer = 0;
  let scanEpoch = 0;
  let selectedKey = '';
  const SUCCESS_FEEDBACK_MS = 2700;

  function clearFeedbackTimer() {
    clearTimeout(feedbackTimer);
    feedbackTimer = 0;
  }

  function skuRows() {
    if (!T.doc) return [];
    return Object.entries(T.doc.q).filter(([, quantity]) => /^\d+$/.test(String(quantity)) && Number(quantity) > 0).map(([key, quantity]) => {
      const [id, colorIndex, sizeIndex] = key.split('|');
      const p = product(id), c = Number(colorIndex), s = Number(sizeIndex);
      return p && p.colors[c] != null && p.sizes[s] != null ? { key, p, c, s, quantity: Number(quantity) } : null;
    }).filter(Boolean);
  }
  function fitName(p) {
    return window.PRODUCT_CATALOG?.fit?.(p.fitId)?.name || p.fit || '—';
  }
  function rowMarkup({ key, p, c, s, quantity }, readonly) {
    return `<div class="tsd-row${key === selectedKey ? ' tsd-row-current' : ''}" data-transfer-sku="${h(key)}" title="${h(p.id + ' ' + p.name + ' / ' + p.colors[c] + ' / ' + fitName(p) + ' / ' + p.sizes[s])}">
      <span class="tsd-product"><strong>${h(p.displayId||p.id)}</strong><span>${h(p.name)}</span></span>
      <span class="tsd-short">${h(p.colors[c])}</span>
      <span class="tsd-short">${h(fitName(p))}</span>
      <span class="tsd-size">${h(p.sizes[s])}</span>
      <input data-transfer-qty type="number" inputmode="numeric" min="0" max="99999" step="1" aria-label="${h(p.id + ' ' + p.colors[c] + ' ' + p.sizes[s])} 数量" value="${quantity}" ${readonly ? 'disabled' : ''}>
      <button type="button" class="tsd-delete" data-transfer-delete aria-label="删除 ${h(p.id + ' ' + p.colors[c] + ' ' + p.sizes[s])}" ${readonly ? 'disabled' : ''}>删除</button>
    </div>`;
  }
  function paintFeedback() {
    feedbackEl.dataset.state = feedback.state;
    feedbackEl.setAttribute('role', feedback.state === 'error' ? 'alert' : 'status');
    feedbackEl.setAttribute('aria-live', feedback.state === 'error' ? 'assertive' : 'polite');
    if (feedback.state === 'idle') {
      feedbackEl.innerHTML = `<div class="tsd-feedback-top"><strong>待扫码</strong></div><p>${h(editable() ? '扫描条码并回车，等待下一件商品' : unavailableReason())}</p>`;
      return;
    }
    if (feedback.state === 'error') {
      feedbackEl.innerHTML = `<div class="tsd-feedback-top"><strong>扫码失败 · 已暂停</strong><span class="tsd-feedback-code" title="${h(feedback.code)}">${h(feedback.code)}</span></div><p class="tsd-feedback-reason">${h(feedback.error)}</p><div class="tsd-feedback-actions">${feedback.partial ? '' : '<button type="button" class="btn" data-transfer-retry>重新扫码</button>'}<button type="button" class="btn" data-transfer-ignore>${feedback.partial ? '核对后继续' : '忽略并继续'}</button></div>`;
      return;
    }
    const p = product(feedback.productId);
    if (!p) return;
    const color = p.colors[feedback.colorIndex] || '';
    const size = p.sizes[feedback.sizeIndex] || '';
    feedbackEl.innerHTML = `<div class="tsd-feedback-top"><strong><span aria-hidden="true">✓</span> ${feedback.before === 0 ? '新增成功' : '数量 +1'}</strong><b>${feedback.before === 0 ? `当前 ${h(feedback.after)} 件` : `${h(feedback.before)} → ${h(feedback.after)}`}</b></div>
      <p class="tsd-feedback-product"><b>${h(p.displayId||p.id)}</b> ${h(p.name)}</p>
      <p class="tsd-feedback-spec">${h(color)} / ${h(fitName(p))} / ${h(size)}</p>`;
  }
  function locateSku(key) {
    const row = [...list.querySelectorAll('[data-transfer-sku]')].find(item => item.dataset.transferSku === key);
    if (!row) return;
    const viewport = list.getBoundingClientRect(), bounds = row.getBoundingClientRect();
    if (bounds.top < viewport.top) list.scrollTop += bounds.top - viewport.top;
    else if (bounds.bottom > viewport.bottom) list.scrollTop += bounds.bottom - viewport.bottom;
  }
  function refresh({ force = false } = {}) {
    if (!open) return;
    if (!active() || T.doc.id !== docId) { close(false); return; }
    const readonly = !editable();
    const wasDisabled = input.disabled;
    input.disabled = readonly || feedback.state === 'error';
    input.placeholder = feedback.state === 'error' ? '扫码已暂停，请先处理失败结果' : readonly ? unavailableReason() : '扫描条码，回车自动录入';
    drawer.querySelector('[data-transfer-doc]').textContent = T.doc.saved ? T.doc.id : '新增调拨单（未保存）';
    const rows = skuRows();
    drawer.querySelector('[data-transfer-count]').textContent = `${rows.length} 条明细`;
    const editing = document.activeElement?.matches?.('#transfer-scan-drawer [data-transfer-qty]');
    if (force || !editing) list.innerHTML = rows.length ? rows.map(row => rowMarkup(row, readonly)).join('') : '<div class="tsd-empty">暂无录入明细。扫码后会出现在这里。</div>';
    if (selectedKey) locateSku(selectedKey);
    paintFeedback();
    if (wasDisabled && !input.disabled) queueMicrotask(focusScan);
  }
  function sync() { if (open) refresh(); }
  function focusScan() {
    if (!open || input.disabled || feedback.state === 'error' || !input.isConnected) return;
    const current = document.activeElement;
    if (current === input || current === document.body || !current?.isConnected) input.focus({ preventScroll: true });
  }
  function show(trigger) {
    if (!active()) return;
    if (!open) origin = trigger || document.activeElement;
    if (docId !== T.doc.id) {
      docId = T.doc.id;
      feedback = { state: 'idle' };
      selectedKey = '';
      clearFeedbackTimer();
      input.value = '';
    }
    if (!open) generation++;
    open = true;
    drawer.hidden = false;
    document.body.classList.add('transfer-scan-open');
    refresh({ force: true });
    if (T.doc.status === '未审核' && T.lease?.expires <= Date.now() && !T.blocked) Promise.resolve(U.renewLease?.()).finally(() => refresh());
    if (!input.disabled) input.focus({ preventScroll: true });
    else if (feedback.state === 'error') feedbackEl.querySelector('[data-transfer-retry], [data-transfer-ignore]')?.focus({ preventScroll: true });
  }
  function close(restore = true) {
    if (!open) return;
    open = false;
    generation++;
    clearFeedbackTimer();
    if (feedback.state === 'success') feedback = { state: 'idle' };
    input.value = '';
    drawer.hidden = true;
    document.body.classList.remove('transfer-scan-open');
    if (restore && origin?.isConnected) origin.focus({ preventScroll: true });
    origin = null;
  }
  function showError(error, code = '', { partial = false, key = '' } = {}) {
    clearFeedbackTimer();
    scanEpoch++;
    selectedKey = partial ? key : '';
    feedback = { state: 'error', error: error || '本次扫码未完成，请重试', code, partial };
    input.value = '';
    refresh();
    feedbackEl.querySelector('[data-transfer-retry], [data-transfer-ignore]')?.focus({ preventScroll: true });
  }
  function resume(retry) {
    if (feedback.state !== 'error') return;
    const failedCode = feedback.code;
    feedback = { state: 'idle' };
    scanEpoch++;
    input.value = retry ? failedCode : '';
    refresh();
    if (!input.disabled) {
      input.focus({ preventScroll: true });
      if (retry) input.select();
    }
  }
  function showSuccess(result, id, run) {
    clearFeedbackTimer();
    selectedKey = result.key;
    feedback = { state: 'success', ...result };
    refresh();
    locateSku(result.key);
    feedbackTimer = setTimeout(() => {
      if (!valid(id, run) || feedback.state !== 'success' || feedback.key !== result.key) return;
      feedback = { state: 'idle' };
      paintFeedback();
    }, SUCCESS_FEEDBACK_MS);
  }
  function valid(id, run) { return open && generation === run && active() && T.doc.id === id; }
  function submit() {
    if (!open || composing || input.disabled || feedback.state === 'error') return;
    const raw = input.value.trim();
    if (!raw) return;
    input.value = '';
    input.focus({ preventScroll: true });
    const id = docId, run = generation, epoch = scanEpoch;
    queue = queue.catch(() => {}).then(async () => {
      if (!valid(id, run) || epoch !== scanEpoch || feedback.state === 'error') return;
      if (!editable() || document.querySelector('dialog[open]')) {
        showError('当前单据不可录入，请检查编辑状态', raw);
        return;
      }
      const result = await U.scan(raw, crypto.randomUUID(), { exactOnly: true });
      if (!valid(id, run)) return;
      if (!result?.ok) {
        if (result?.partial) {
          try { window.TRANSFER_MATRIX_EXPERIMENT?.afterScan({ ...result, ok: true }); } catch (error) { console.error('调拨明细定位失败', error); }
        }
        showError(result?.error || '条码未录入', raw, { partial: !!result?.partial, key: result?.key });
        return;
      }
      feedback = { state: 'success', ...result };
      selectedKey = result.key;
      try { window.TRANSFER_MATRIX_EXPERIMENT?.afterScan(result); } catch (error) { console.error('调拨明细定位失败', error); }
      if (valid(id, run)) showSuccess(result, id, run);
    }).catch(error => { if (valid(id, run)) showError(error?.message || '本次扫码失败，请重试', raw); })
      .finally(() => { if (valid(id, run)) focusScan(); });
  }

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.isComposing && event.keyCode !== 229) submit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  });
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; });
  drawer.addEventListener('click', event => {
    if (event.target.closest('[data-transfer-close]')) return close();
    if (event.target.closest('[data-transfer-retry]')) return resume(true);
    if (event.target.closest('[data-transfer-ignore]')) return resume(false);
    const button = event.target.closest('[data-transfer-delete]');
    if (!button || !editable()) return;
    const key = button.closest('[data-transfer-sku]')?.dataset.transferSku;
    if (!key || !U.setSkuQuantity(key, 0)) return;
    if (selectedKey === key) selectedKey = '';
    window.TRANSFER_MATRIX_EXPERIMENT?.afterSkuDelete(key);
    refresh({ force: true });
    focusScan();
  });
  list.addEventListener('input', event => {
    const field = event.target.closest('[data-transfer-qty]');
    if (!field || !editable()) return;
    const raw = field.value;
    field.classList.toggle('invalid', raw !== '' && (!/^\d+$/.test(raw) || Number(raw) > 99999));
    if (field.classList.contains('invalid') || raw === '') return;
    const key = field.closest('[data-transfer-sku]')?.dataset.transferSku;
    if (key) U.setSkuQuantity(key, Number(raw));
  });
  list.addEventListener('change', event => {
    const field = event.target.closest('[data-transfer-qty]');
    if (!field || !editable()) return;
    const key = field.closest('[data-transfer-sku]')?.dataset.transferSku;
    if (!key) return;
    const raw = field.value.trim();
    if (raw === '' || raw === '0') {
      if (U.setSkuQuantity(key, 0)) window.TRANSFER_MATRIX_EXPERIMENT?.afterSkuDelete(key);
    } else if (!/^\d+$/.test(raw) || Number(raw) > 99999) {
      field.value = String(T.doc.q[key] || '');
    } else U.setSkuQuantity(key, Number(raw));
    refresh({ force: true });
    focusScan();
  });
  list.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || !event.target.matches('[data-transfer-qty]')) return;
    event.preventDefault();
    event.target.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus({ preventScroll: true });
  });
  drawer.addEventListener('keydown', event => {
    if (event.key === 'Escape' && event.target !== input) { event.preventDefault(); close(); }
  });
  window.addEventListener('hashchange', sync);
  window.TRANSFER_SCAN_DRAWER = { show, close, refresh, sync, get open() { return open; } };
})();
