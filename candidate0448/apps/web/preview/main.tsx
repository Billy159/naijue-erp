import { useEffect, useRef, useState, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { DemoFrame } from '../src/demo-presentation/demo-frame.tsx';
import { AsyncLeafRegistry } from '../src/loading/async-leaf-registry.ts';
import { ReadContext, type ReadScope } from '../src/loading/read-scope.ts';
import type { InventoryPageProps } from '../src/inventory/inventory-page.tsx';
import type { InventoryCellTarget } from '../src/inventory/contracts.ts';
import type { ProductReadOnlyReader } from '../src/inventory/product-contracts.ts';
import type { createSyntheticInventoryReader } from './synthetic-reader.ts';
import './shell.css';

function loadInventoryStyles(): Promise<void> {
  if (document.querySelector('[data-inventory-inline]')) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = new URL('./inventory-route.css', import.meta.url).href;
    link.onload = () => resolve();
    link.onerror = () => { link.remove(); reject(new Error('库存页面样式加载失败，请重试。')); };
    document.head.append(link);
  });
}
const leaves = new AsyncLeafRegistry({ inventory: {
  load: async () => { const [route, fixture] = await Promise.all([import('../src/inventory/inventory-route.tsx'), import('./synthetic-reader.ts')]); return { View: route.InventoryPageView, createReader: fixture.createSyntheticInventoryReader }; },
  loadStyles: loadInventoryStyles,
} }, { maxRetainedEntries: 1 });

type Reader = ReturnType<typeof createSyntheticInventoryReader>;
interface ActiveInventory { readonly View: ComponentType<InventoryPageProps>; readonly scope: ReadScope; readonly reader: Reader; readonly productReader: ProductReadOnlyReader }
function PreviewApp() {
  const [context] = useState(() => new ReadContext({ accountId: 'TEST-ONLY-ACCOUNT', sessionRevision: 'TEST-ONLY-SESSION', permissionRevision: 'TEST-ONLY-PERMISSION' }));
  const [active, setActive] = useState<ActiveInventory | null>(null);
  const [routeState, setRouteState] = useState<'home' | 'loading' | 'ready' | 'error'>('home');
  const [routeError, setRouteError] = useState('');
  const [reads, setReads] = useState({ inventory: 0, candidates: 0, product: 0 });
  const [armedFailure, setArmedFailure] = useState(false);
  const [notice, setNotice] = useState<{ title: string; lines: readonly string[] } | null>(null);
  const currentScope = useRef<ReadScope | null>(null);
  const sequence = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const lastAction = useRef<HTMLElement | null>(null);
  const activate = async () => {
    currentScope.current?.dispose(); setActive(null); setArmedFailure(false);
    const scope = context.createScope(`test-inventory-route-${++sequence.current}`);
    currentScope.current = scope; setRouteState('loading');
    try {
      const { View, createReader } = await leaves.load('inventory', scope);
      if (!scope.active || currentScope.current !== scope) return;
      const reader = createReader({ onRead: event => { if (event.kind === 'inventory') setArmedFailure(false); setReads(value => ({ ...value, [event.kind === 'inventory' ? 'inventory' : 'candidates']: value[event.kind === 'inventory' ? 'inventory' : 'candidates'] + 1 })); } });
      // Required provider is explicit, and its synthetic fixture code loads only on a detail read.
      let fixture: Promise<ProductReadOnlyReader> | null = null;
      const productFixture = () => fixture ??= import('./synthetic-product-reader.ts').then(module => module.createSyntheticProductReader({ onRead: () => setReads(value => ({ ...value, product: value.product + 1 })) }));
      const productReader: ProductReadOnlyReader = {
        readProductBasics: async read => { const fixture = await productFixture(); if (read.signal.aborted) throw new Error('TEST ONLY：商品读取范围已关闭。'); return fixture.readProductBasics(read); },
        readProductSpecifications: async read => { const fixture = await productFixture(); if (read.signal.aborted) throw new Error('TEST ONLY：商品读取范围已关闭。'); return fixture.readProductSpecifications(read); },
        readProductImages: async read => { const fixture = await productFixture(); if (read.signal.aborted) throw new Error('TEST ONLY：商品读取范围已关闭。'); return fixture.readProductImages(read); },
        readProductImage: async read => { const fixture = await productFixture(); if (read.signal.aborted) throw new Error('TEST ONLY：商品读取范围已关闭。'); return fixture.readProductImage(read); },
      };
      setActive({ View, scope, reader, productReader }); setRouteState('ready');
    } catch (error) {
      if (!scope.active || currentScope.current !== scope) return;
      setRouteError(error instanceof Error ? error.message : '库存页面加载失败。'); setRouteState('error');
    }
  };
  useEffect(() => {
    const changed = () => {
      if (location.hash === '#inventory') { void activate(); }
      else { currentScope.current?.dispose(); currentScope.current = null; setActive(null); setNotice(null); setRouteState('home'); }
    };
    window.addEventListener('hashchange', changed); changed();
    return () => { window.removeEventListener('hashchange', changed); context.clear(); };
    // This preview shell owns one session. No hidden route or idle prefetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context]);
  useEffect(() => {
    if (!notice) return;
    lastAction.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (typeof dialog.current?.showModal === 'function') dialog.current.showModal(); else dialog.current?.setAttribute('open', '');
  }, [notice]);
  const closeNotice = () => { setNotice(null); lastAction.current?.focus(); };
  const cellAction = (target: InventoryCellTarget) => setNotice({ title: '库存流水尚未接入', lines: ['TEST ONLY：已正确触发该仓库 / SKU 的点击回调；此处不是流水结果。', `${target.productLabel} · ${target.color.label} · ${target.fit.label} · ${target.size.label}`, `仓库：${target.warehouse.label}`, '真实流水仍需接入授权读取、日期/业务类型/来源筛选及 20 条分页。'] });
  return <DemoFrame breadcrumb={[{id:"inventory-management",label:"库存管理"},{id:"inventory",label:"库存状况表"}]} navigation={{ inventory: { href: '#inventory', selected: routeState !== 'home', onActivate: () => { location.hash = '#inventory'; } } }} topbarActions={<>{routeState !== 'home' && <button type="button" className="shell-text-button" onClick={() => { location.hash = ''; }}>关闭库存页</button>}<span className="test-account">TEST ONLY · 合成数据预览</span></>} footer={<footer className="preview-footer"><div className="preview-diagnostics"><span>库存读取 {reads.inventory} · 候选读取 {reads.candidates} · 商品资料读取 {reads.product}</span><button type="button" disabled={!active || armedFailure} onClick={() => { active?.reader.failNextInventory(); setArmedFailure(true); setNotice({ title: '已安排一次测试失败', lines: ['下一次点击查询或刷新将模拟读取失败。失败后可点重试；不会连接或改动真实数据库。'] }); }}>下一次查询模拟失败</button></div><p>TEST ONLY：全部商品、数量、仓库均为生成测试数据，未连接真实数据库。源码布局已恢复，未完成真实浏览器截图或像素验收；库存流水、导出/打印仍未接入。</p></footer>}>
      {routeState === 'home' && <div className="shell-empty"><h1>库存状况表</h1><p>点击菜单进入页面。进入前不加载库存页面和业务候选。</p><a className="shell-primary" href="#inventory" onClick={event => { event.preventDefault(); location.hash = '#inventory'; }}>打开库存状况表</a></div>}
      {routeState === 'loading' && <div className="shell-empty" role="status"><p>正在准备库存页面…</p></div>}
      {routeState === 'error' && <div className="shell-empty" role="alert"><p>{routeError}</p><button className="shell-primary" onClick={() => { void activate(); }}>重试加载页面</button></div>}
      {active && <active.View key={active.scope.routeInstanceId} scope={active.scope} reader={active.reader} productReader={active.productReader} actions={{ onOpenCell: cellAction }} />}

    {notice && <dialog ref={dialog} className="preview-dialog" aria-label={notice.title} onCancel={closeNotice}><div className="preview-dialog-head"><strong>{notice.title}</strong><button type="button" aria-label="关闭提示" onClick={closeNotice}>×</button></div><div>{notice.lines.map(line => <p key={line}>{line}</p>)}</div><footer><button type="button" onClick={closeNotice}>知道了</button></footer></dialog>}
  </DemoFrame>;
}
const host = document.getElementById('root');
if (!host) throw new Error('Preview root element missing.');
createRoot(host).render(<PreviewApp />);
