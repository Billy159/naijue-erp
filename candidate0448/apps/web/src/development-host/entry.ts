import { startDevelopmentHost } from './bootstrap.ts';

try {
  startDevelopmentHost({ document, location, fetch: globalThis.fetch.bind(globalThis) });
} catch {
  // Configuration/provider errors must never disclose raw exception data or pretend to log in.
  const root = document.getElementById('naijue-erp-root');
  if (root) { root.replaceChildren(); const message = document.createElement('p'); message.setAttribute('role', 'alert'); message.textContent = '开发宿主未能启动。请检查显式配置、HTTPS 地址和构建资源。'; root.append(message); }
}
