import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ProductDrawerHost } from '../src/inventory/product-drawer-host.tsx';
import { ReadContext } from '../src/loading/read-scope.ts';
import type { Selection } from '../src/inventory/contracts.ts';
import { createSyntheticProductReader } from './synthetic-product-reader.ts';
import './product-only.css';

// A separate TEST ONLY entry, not a reduced replacement for the inventory app.
const products: readonly Selection[] = [1, 2, 3].map(index => ({
  id: `test-product-${index}`,
  label: `TEST-${String(index).padStart(3, '0')} 测试上衣${index}`,
}));

function ProductOnlyPreview() {
  const [context] = useState(() => new ReadContext({ accountId: 'test-only-product-preview', sessionRevision: 'synthetic-session-1', permissionRevision: 'read-only-1' }));
  const [scope] = useState(() => context.createScope('test-only-product-picker'));
  const [reads, setReads] = useState({ base: 0, specs: 0, images: 0, original: 0 });
  const [reader] = useState(() => createSyntheticProductReader({ onRead: event => {
    setReads(previous => ({ ...previous, [event.kind]: previous[event.kind] + 1 }));
  } }));
  const [product, setProduct] = useState<Selection | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const sequence = useRef(0);
  useEffect(() => () => context.clear(), [context]);
  useEffect(() => { if (!product && trigger.current?.isConnected) trigger.current.focus(); }, [product]);

  return <main className="product-only-preview">
    <header><span className="product-only-label">TEST ONLY · 商品抽屉独立预览</span><h1>商品资料，只读查看</h1><p>这是单独的三页签查看演示，不是完整库存页面，也不是整套 ERP 已完工。</p></header>
    <section className="product-only-notice" aria-label="预览范围"><strong>全部为生成测试数据，未连接真实数据库。</strong><p>点击下方商品，打开实际商品抽屉。基础资料、规格、图片仅在查看相应页签时读取；大图仅在点击缩略图后读取。测试像素图不是商品照片。</p></section>
    <section className="product-only-products" aria-label="测试商品">{products.map((item, index) => <article key={item.id}><span className="product-only-number">0{index + 1}</span><h2>{item.label}</h2><p>{index === 0 ? '含规格及一张测试像素图' : '含规格，图片为空的测试商品'}</p><button type="button" data-product-id={item.id} onClick={event => { trigger.current = event.currentTarget; sequence.current++; setProduct(item); }}>查看商品</button></article>)}</section>
    <output className="product-only-diagnostics" aria-label="测试读取计数" data-read-base={reads.base} data-read-specs={reads.specs} data-read-images={reads.images} data-read-original={reads.original}>基础资料 {reads.base} · 规格 {reads.specs} · 图片清单 {reads.images} · 大图 {reads.original}</output>
    <footer>无真实账号、服务、网络或写入操作。单文件包全部内嵌，不代表按需网络分包、原生浏览器、冻结 Demo 像素或性能验收。完整库存应用保持独立且未被裁减。</footer>
    {product && <ProductDrawerHost key={`${product.id}:${sequence.current}`} parentScope={scope} product={product} reader={reader} close={() => setProduct(null)} />}
  </main>;
}

const host = document.getElementById('root');
if (!host) throw new Error('TEST ONLY product preview root missing.');
createRoot(host).render(<ProductOnlyPreview />);
