import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const repo = fileURLToPath(new URL('../../../../../', import.meta.url));
const auth = 'apps/web/src/authentication/authentication.css';
const controls = 'apps/web/src/demo-presentation/controls.css';
for (const order of [[auth, controls], [controls, auth]]) {
  const output = await build({ stdin: { contents: order.map(entry => `@import ${JSON.stringify(`./${entry}`)};`).join('\n'), resolveDir: repo, loader: 'css' }, bundle: true, write: false, logLevel: 'warning' });
  const dom = new JSDOM(`<!doctype html><style>${output.outputFiles[0].text}</style><section class="auth-panel">
    <form class="auth-form"><input aria-label="真实认证输入"><button data-auth="login">登录</button><p role="alert" data-auth-alert>认证错误</p></form>
    <div class="auth-actions"><button data-auth="resolve">核验登录状态</button></div>
    <div class="auth-session"><div class="auth-actions"><button data-auth="password">修改密码</button><button disabled data-auth="logout">退出登录</button></div></div>
    <button class="auth-cancel" data-auth="cancel">取消请求</button>
    <div class="demo-ui"><div class="demo-idle-reference"><span class="demo-idle-selection"><span class="demo-idle-token"><span class="demo-idle-token-label">全部状态</span><button class="demo-idle-token-remove" aria-label="重置全部状态"><svg></svg></button></span></span></div>
      <button class="iw-button">查询</button><button class="iw-text-button">高级筛选</button><p role="alert" data-business-alert>业务错误</p>
    </div>
    <div class="arco-modal auth-password-dialog"><button data-auth="dialog">关闭修改密码</button></div>
  </section>`, { pretendToBeVisual: true });
  try {
    const { document } = dom.window;
    const css = element => dom.window.getComputedStyle(element);
    for (const button of document.querySelectorAll('[data-auth]')) {
      assert.equal(css(button).minHeight, '34px', `Auth control ${button.dataset.auth} retains its existing size`);
      assert.equal(css(button).padding, '6px 14px');
      assert.equal(css(button).borderTopWidth, '1px');
    }
    assert.equal(css(document.querySelector('[data-auth="logout"]')).opacity, '0.55');
    assert.equal(css(document.querySelector('[data-auth="logout"]')).cursor, 'wait');
    assert.equal(css(document.querySelector('[data-auth-alert]')).padding, '10px 12px');
    assert.equal(css(document.querySelector('.auth-form input')).height, '38px');
    const remove = document.querySelector('.demo-idle-token-remove');
    assert.equal(css(remove).width, '12px'); assert.equal(css(remove).height, '16px');
    assert.notEqual(css(remove).minHeight, '34px', 'AuthPanel must not enlarge business token removal buttons');
    assert.equal(css(remove).padding, '0px'); assert.equal(css(remove).borderTopWidth, '0px');
    assert.equal(css(remove).backgroundColor, 'rgba(0, 0, 0, 0)');
    assert.equal(css(document.querySelector('.iw-button')).height, '32px');
    assert.equal(css(document.querySelector('.iw-button')).padding, '0px 11px');
    assert.equal(css(document.querySelector('.iw-text-button')).borderTopWidth, '0px');
    assert.notEqual(css(document.querySelector('[data-business-alert]')).padding, '10px 12px');
    assert.equal(document.querySelectorAll('input').length, 1, 'The fix neither adds nor hides a legitimate search field');
    console.log(`PASS authentication CSS ownership: ${order.map(entry => path.basename(entry)).join(' → ')}; owned auth controls unchanged, business token/query/action/alert unaffected.`);
  } finally { dom.window.close(); }
}
console.log('PASS real bundled CSS/JSDOM isolation only; actual browser geometry and frozen-demo comparison remain separate.');
