# frontend/transfer-scan-drawer.js - Frozen UI excerpts

Source commit: `b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3`. Full source SHA256: `99a6c4324fc47a0d62f0890e9d1d68a771b1d9863a820828ff9a06edc6588f66`.

Boundary: Scanner drawer DOM and row template only. No actual barcode or product values; do not copy old global/mock scanning commands. These are incomplete reference fragments; unresolved expressions are preserved. Empty data has not been inserted to fabricate a runnable module.

## Original lines 1-47

```javascript
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

```

## Original lines 64-73

```javascript
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
```
