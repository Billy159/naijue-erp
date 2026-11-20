import { UIButton } from './standard-controls.tsx';
import { useEffect, useState } from 'react';
import { ReadScope } from '../loading/read-scope.ts';
import type { ProductReadOnlyReader } from '../inventory/product-contracts.ts';
import { assertProductBasics, assertProductImages, assertProductSpecifications } from '../inventory/product-model.ts';
import { useProductRead } from '../inventory/product-tab-state.tsx';

/** Only the currently active suggestion owns these existing target-only reads. */
export function ProductCandidatePreview(props: { readonly parent: ReadScope; readonly reader: ProductReadOnlyReader; readonly productId: string }) {
  const [owned, setOwned] = useState<{ parent: ReadScope; reader: ProductReadOnlyReader; scope: ReadScope } | null>(null);
  useEffect(() => {
    const scope = new ReadScope(props.parent.identity, `${props.parent.routeInstanceId}:candidate-preview:${props.productId}`, props.productId, () => {});
    const abort = () => { scope.dispose(); setOwned(null); };
    props.parent.signal.addEventListener('abort', abort, { once: true });
    if (props.parent.active) setOwned({ parent: props.parent, reader: props.reader, scope }); else abort();
    return () => { props.parent.signal.removeEventListener('abort', abort); scope.dispose(); };
  }, [props.parent, props.reader, props.productId]);
  return owned?.parent === props.parent && owned.reader === props.reader && owned.scope.entityId === props.productId && owned.scope.active
    ? <PreviewRead scope={owned.scope} reader={props.reader} /> : null;
}
function PreviewRead({ scope, reader }: { readonly scope: ReadScope; readonly reader: ProductReadOnlyReader }) {
  const basics = useProductRead(scope, value => reader.readProductBasics(value), assertProductBasics);
  const specs = useProductRead(scope, value => reader.readProductSpecifications(value), assertProductSpecifications);
  const images = useProductRead(scope, value => reader.readProductImages(value), assertProductImages);
  const data = basics.snapshot.success?.data; const specification = specs.snapshot.success?.data; const photos = images.snapshot.success?.data;
  const fields = data ? [['款号', data.code], ['商品名称', data.name],
    ...(specification ? [['颜色', `${specification.colors.length} 色`]] : []), ['商品分类', data.categoryLabel ?? '未提供'],
    ['季节', data.seasonLabel ?? '未提供'], ...(specification ? [['版型', specification.fits.map(item => item.label).join(' / ') || '未提供']] : []),
    ['零售价', data.retailPrice ?? '未提供']] : [];
  const reads = [basics, specs, images]; const failed = reads.some(read => read.snapshot.phase === 'error');
  return <aside className="inv-preview" aria-label="当前候选商品资料"><div className="inv-preview-title">商品资料</div>
    {photos ? photos.images.length ? <div className="inv-photo-grid">{photos.images.map(photo => <div key={photo.id} className="inv-photo-item">
      <span className="inv-photo-tile"><img src={photo.thumbnailUrl} alt={photo.label} loading="lazy" decoding="async" /></span><span className="inv-photo-label">{photo.label}</span></div>)}</div>
      : <div className="inv-preview-no-photo">该商品尚未提供图片</div> : images.snapshot.phase === 'success' ? <div className="inv-preview-no-photo">图片资料未提供</div> : images.snapshot.phase !== 'error' && <div className="inv-preview-no-photo">正在读取商品图片…</div>}
    {data ? <div className="inv-preview-info">{fields.map(([label, value]) => <div className="inv-preview-field" key={label}><small>{label}</small> {value}</div>)}</div>
      : basics.snapshot.phase === 'success' ? <p className="inv-preview-no-photo">该商品尚未提供资料</p> : basics.snapshot.phase !== 'error' && <p className="inv-preview-no-photo" role="status">正在读取商品资料…</p>}
    {failed && <p className="inv-preview-no-photo" role="alert">部分资料暂不可读取。<UIButton type="button" className="iw-link" onClick={() => { for (const read of reads) if (read.snapshot.phase === 'error') read.read(); }}>重试资料</UIButton></p>}
  </aside>;
}
