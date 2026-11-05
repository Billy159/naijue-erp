import { Component, useCallback, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { DemoFrame, type DemoNavigationId, type DemoNavigationTarget } from '../src/demo-presentation/demo-frame.tsx';
import { ReadContext, type ReadScope } from '../src/loading/read-scope.ts';
import type { ReadKind, ReportRead } from '../preview-core-pages/catalog.ts';
import { acceptanceStylesheet } from './styles.ts';
import type { AcceptanceRoute, AcceptanceRouteModule } from './contracts.ts';

// This is a separate synthetic UI-test application, not an alternate production bootstrap.
const definitions = {
  inventory: { id: 'inventory', breadcrumb: [{id:'inventory-management',label:'库存管理'},{id:'inventory',label:'库存状况表'}], load: () => import('./routes/inventory.tsx') },
  sales: { id: 'sales', breadcrumb: [{id:'sales-management',label:'销售管理'},{id:'sales',label:'销货单列表'}], load: () => import('./routes/sales.tsx') },
  transfers: { id: 'transfer', breadcrumb: [{id:'inventory-management',label:'库存管理'},{id:'transfers',label:'调拨单列表'}], load: () => import('./routes/transfers.tsx') },
} as const;
function selectedRoute(): AcceptanceRoute {
  const route = location.hash.slice(1).replace(/^\//, '');
  return route === 'sales' || route === 'transfers' ? route : 'inventory';
}
class PageBoundary extends Component<{ readonly children: ReactNode }, { readonly failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch(_error: Error, _info: ErrorInfo): void { /* No external error reporting. */ }
  override render(): ReactNode { return this.state.failed ? <p role="alert">SYNTHETIC ONLY：页面加载失败，请重新选择导航。</p> : this.props.children; }
}
function AcceptanceApp() {
  const [route, setRoute] = useState<AcceptanceRoute>(selectedRoute);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState<{ readonly scope: ReadScope; readonly module: AcceptanceRouteModule } | null>(null);
  const [failure, setFailure] = useState(false);
  const [counts, setCounts] = useState<Partial<Record<ReadKind, number>>>({});
  const reads = useRef<Partial<Record<ReadKind, number>>>({});
  const report: ReportRead = useCallback(kind => { reads.current = { ...reads.current, [kind]: (reads.current[kind] ?? 0) + 1 }; setCounts(reads.current); }, []);
  useEffect(() => {
    const change = () => setRoute(selectedRoute());
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    // Non-secret, explicitly synthetic scope identifiers. No account/session API is involved.
    const context = new ReadContext({ accountId: 'SYNTHETIC-ONLY-UI-TEST', sessionRevision: 'NO-LOGIN', permissionRevision: 'NO-DB-NO-WRITES' });
    const scope = context.createScope(`synthetic:${route}:${attempt}`);
    const styles = acceptanceStylesheet(document, `${route}.css`);
    let attached = true;
    setReady(null); setFailure(false);
    void Promise.all([definitions[route].load(), styles.load()]).then(([module]) => {
      if (attached && scope.active) setReady({ scope, module });
    }, () => { if (attached && scope.active) setFailure(true); });
    return () => { attached = false; context.clear(); styles.dispose(); };
  }, [route, attempt]);
  const navigation: Partial<Record<DemoNavigationId, DemoNavigationTarget>> = {};
  for (const name of Object.keys(definitions) as AcceptanceRoute[]) navigation[definitions[name].id] = {
    href: `#/${name}`, selected: route === name,
    onActivate: () => { if (route === name) setAttempt(value => value + 1); else location.hash = `/${name}`; },
  };
  return <DemoFrame navigation={navigation} breadcrumb={definitions[route].breadcrumb}
    topbarActions={<span className="acceptance-marker" title="独立只读 UI 测试应用，无登录、数据库、写入或真实业务数据。">SYNTHETIC ONLY · 无数据库 · 无写入</span>}
    footer={<details className="acceptance-diagnostics"><summary>合成测试诊断</summary><p>仅挂载规范源组件与有限合成读取端口，不代表正式验收。无登录，无真实数据，无保存操作。</p><p>读取次数：{Object.entries(counts).map(([kind, count]) => `${kind}=${count}`).join(' · ') || '0'}</p></details>}>
    {failure ? <p role="alert">SYNTHETIC ONLY：页面或样式未加载。<button type="button" onClick={() => setAttempt(value => value + 1)}>重试</button></p>
      : ready ? <PageBoundary key={ready.scope.routeInstanceId}><ready.module.View scope={ready.scope} report={report} /></PageBoundary>
        : <p role="status">正在加载合成测试页面…</p>}
  </DemoFrame>;
}
const target = document.getElementById('visual-acceptance-root');
if (!target) throw new Error('The explicit acceptance root is missing.');
const root = createRoot(target); root.render(<AcceptanceApp />);
window.addEventListener('pagehide', () => root.unmount(), { once: true });
