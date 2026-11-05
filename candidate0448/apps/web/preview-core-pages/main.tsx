import { useEffect, useRef, useState, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import type { BreadcrumbSegment } from '../src/components/standard-breadcrumb.tsx';
import { DemoFrame, type DemoNavigationId } from '../src/demo-presentation/demo-frame.tsx';
import { AsyncLeafRegistry } from '../src/loading/async-leaf-registry.ts';
import { ReadContext, type ReadScope } from '../src/loading/read-scope.ts';
import type { ProductReadOnlyReader } from '../src/inventory/product-contracts.ts';
import type { ReadKind, ReportRead } from './catalog.ts';
import './preview.css';
// Portable TEST ONLY derivative intentionally inlines action CSS. This resolved
// fixture-style callback is not a production stylesheet/loading capability.
import '../src/sales/detail.css';
import '../src/demo-controls/single-select.css';
import '../src/components/product-candidate-action.css';
const loadInlineSalesDetailStyles = async (): Promise<void> => {};

type Route = 'inventory' | 'sales' | 'transfers';
type Ready = { readonly View: ComponentType<{ readonly scope: ReadScope }> };
const routes: readonly Route[] = ['inventory', 'sales', 'transfers'];
const labels: Record<Route, string> = { inventory: '库存状况表', sales: '销货单列表', transfers: '调拨单列表' };
const navigationIds: Record<Route, DemoNavigationId> = { inventory: 'inventory', sales: 'sales', transfers: 'transfer' };
const breadcrumbs: Record<Route, readonly BreadcrumbSegment[]> = { inventory: [{id:'inventory-management',label:'库存管理'},{id:'inventory',label:'库存状况表'}], sales: [{id:'sales-management',label:'销售管理'},{id:'sales',label:'销货单列表'}], transfers: [{id:'inventory-management',label:'库存管理'},{id:'transfers',label:'调拨单列表'}] };
const readKinds: readonly ReadKind[] = ['inventory', 'inventoryCandidates', 'salesList', 'salesDetail', 'salesReferences', 'transferList', 'transferDetail', 'transferWarehouses', 'productBasics', 'productSpecifications', 'productImages', 'productOriginal'];

function lazyProductReader(report: ReportRead): ProductReadOnlyReader {
  let fixture: Promise<ProductReadOnlyReader> | null = null;
  const provider = () => fixture ??= import('./product-fixture.ts').then(module => module.createProductFixture(report));
  return {
    readProductBasics: async read => (await provider()).readProductBasics(read),
    readProductSpecifications: async read => (await provider()).readProductSpecifications(read),
    readProductImages: async read => (await provider()).readProductImages(read),
    readProductImage: async read => (await provider()).readProductImage(read),
  };
}
function createLeaves(report: ReportRead) {
  // The portable derivative has inline styles. The actual leaf still owns when
  // it invokes the style readiness handshake; this is not a split-CSS perf proof.
  return new AsyncLeafRegistry({
    inventory: { load: async (): Promise<Ready> => {
      const [leaf, fixture] = await Promise.all([import('../src/inventory/inventory-route.tsx'), import('./inventory-fixture.ts')]);
      const reader = fixture.createInventoryFixture(report); const productReader = lazyProductReader(report);
      return { View: ({ scope }) => <leaf.InventoryPageView scope={scope} reader={reader} productReader={productReader} /> };
    } },
    sales: { load: async (): Promise<Ready> => {
      const [leaf, fixture] = await Promise.all([import('../src/sales/sales-route.tsx'), import('./sales-fixture.ts')]);
      const { reader, references } = fixture.createSalesFixture(report);
      return { View: ({ scope }) => <leaf.SalesPageHost scope={scope} reader={reader} references={references} loadDetailStyles={loadInlineSalesDetailStyles} /> };
    } },
    transfers: { load: async (): Promise<Ready> => {
      const [leaf, fixture] = await Promise.all([import('../src/transfers/transfers-route.tsx'), import('./transfer-fixture.ts')]);
      const { reader, references } = fixture.createTransferFixture(report);
      const product = { reader: lazyProductReader(report), loadStyles: async () => { await Promise.all([import('../src/inventory/product-drawer-frame.css'), import('../src/inventory/product-drawer.css')]); } };
      return { View: ({ scope }) => <leaf.TransferPageHost scope={scope} reader={reader} references={references} loadDetailStyles={() => import('../src/transfers/detail.css')} product={product} /> };
    } },
  }, { maxRetainedEntries: 3 });
}

function CorePagesPreview() {
  const [reads, setReads] = useState<Record<ReadKind, number>>(() => Object.fromEntries(readKinds.map(kind => [kind, 0])) as Record<ReadKind, number>);
  const [context] = useState(() => new ReadContext({ accountId: 'SYNTHETIC-ONLY-NOT-A-LOGIN', sessionRevision: 'SYNTHETIC-ONLY', permissionRevision: 'SYNTHETIC-ONLY' }));
  const [leaves] = useState(() => createLeaves(kind => setReads(previous => ({ ...previous, [kind]: previous[kind] + 1 }))));
  const [route, setRoute] = useState<Route | null>(null); const [phase, setPhase] = useState<'home' | 'loading' | 'ready' | 'error'>('home');
  const [active, setActive] = useState<{ readonly scope: ReadScope; readonly View: Ready['View'] } | null>(null);
  const [error, setError] = useState(''); const currentScope = useRef<ReadScope | null>(null); const sequence = useRef(0);
  useEffect(() => {
    const changed = () => {
      currentScope.current?.dispose(); currentScope.current = null; setActive(null);
      const target = routes.find(candidate => location.hash === `#${candidate}`) ?? null; setRoute(target);
      if (!target) { setPhase('home'); return; }
      const scope = context.createScope(`SYNTHETIC-ONLY-${target}-${++sequence.current}`); currentScope.current = scope; setPhase('loading');
      void leaves.load(target, scope).then(ready => {
        if (!scope.active || currentScope.current !== scope) return;
        setActive({ scope, View: ready.View }); setPhase('ready');
      }, failure => {
        if (!scope.active || currentScope.current !== scope) return;
        setError(failure instanceof Error ? failure.message : '页面加载失败。'); setPhase('error');
      });
    };
    window.addEventListener('hashchange', changed); changed();
    return () => { window.removeEventListener('hashchange', changed); context.clear(); };
  }, [context, leaves]);
  const navigation = Object.fromEntries(routes.map(candidate => [navigationIds[candidate], { href: `#${candidate}`, selected: route === candidate, onActivate: () => { location.hash = candidate; } }]));
  return <DemoFrame navigation={navigation} breadcrumb={route ? breadcrumbs[route] : [{id:'preview',label:'三个核心只读页面 · 合成预览'}]}
    topbarActions={<><span className="core-preview-account">TEST ONLY · 无登录 · 无真实账号</span>{route && <button type="button" className="core-preview-close" onClick={() => { location.hash = 'home'; }}>关闭页面</button>}</>}
    notice={<aside className="core-preview-notice" aria-label="合成测试预览说明"><strong>合成数据预览 · 无真实登录/数据库/写入</strong></aside>}
    footer={<footer className="core-preview-footer"><details className="core-preview-details"><summary>预览说明与读取计数</summary><p>TEST ONLY / SYNTHETIC ONLY：这不是正式系统。本文件使用实际库存、销货、调拨只读组件；商品、客户、人员、单号、数量和金额全部为合成测试数据。无真实登录、网络、数据库或写入，未接入的操作保持禁用。</p><output className="core-preview-diagnostics" {...Object.fromEntries(readKinds.map(kind => [`data-read-${kind.toLowerCase()}`, reads[kind]]))}>测试读取次数：库存 {reads.inventory} / 销货列表 {reads.salesList} / 销货详情 {reads.salesDetail} / 调拨列表 {reads.transferList} / 调拨详情 {reads.transferDetail} / 商品基础 {reads.productBasics} / 规格 {reads.productSpecifications} / 图片 {reads.productImages}</output><p>独立下载预览将代码和样式装入一个文件，仅用于查看交互。不是生产懒加载、真实数据、性能、原生浏览器截图、像素或空间内嵌验收。</p></details></footer>}>
    {phase === 'home' && <section className="core-preview-home"><h1>查看三个核心页面</h1><p>请点击左侧菜单进入。库存和销货需要点击“查询”；调拨按实际页面契约进入时读取第一页。</p><p>点击单号或“查看”可打开详情；库存及调拨商品的“查看”打开实际商品只读抽屉。</p></section>}
    {phase === 'loading' && <p className="iw-inline-state" role="status">正在准备只读页面…</p>}
    {phase === 'error' && <p className="iw-inline-state" role="alert">{error}<button type="button" onClick={() => { location.hash = 'home'; }}>返回</button></p>}
    {active && phase === 'ready' && <active.View key={active.scope.routeInstanceId} scope={active.scope} />}
  </DemoFrame>;
}
const root = document.getElementById('root');
if (!root) throw new Error('SYNTHETIC ONLY preview root missing.');
createRoot(root).render(<CorePagesPreview />);
