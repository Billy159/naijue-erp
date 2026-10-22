import { useState } from 'react';
import type { ReadScope } from '../loading/read-scope.ts';
import type { ProductReadOnlyReader } from '../inventory/product-contracts.ts';
import { ProductTab } from '../inventory/product-tab-images.tsx';
import { ProductReadState, useProductRead } from '../inventory/product-tab-state.tsx';
import { assertProductSpecifications } from '../inventory/product-model.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import { UIButton } from '../components/standard-controls.tsx';
import { StandardOverlay } from '../components/standard-overlay.tsx';
import type { ProductEditorImage, ProductEditorMediaReader, ProductImageRole } from './product-editor-contracts.ts';

interface MediaContext {
  readonly scope:ReadScope; readonly reader:Pick<ProductReadOnlyReader,'readProductSpecifications'|'readProductImages'|'readProductImage'>;
  readonly onAccessFailure:(error:HttpQueryError)=>void;
}
interface Props extends MediaContext {
  readonly productId: string | null;
  readonly media?: ProductEditorMediaReader; readonly expectedVersion: number | null;
  readonly onReloadRequest: () => void;
  readonly reloadBlocked?: boolean;
}
const roles: readonly (readonly [ProductImageRole, string])[] = [
  ['MAIN', '主图'], ['WHITE_BACKGROUND', '白底图'], ['HANG_TAG', '吊牌图'], ['DETAIL', '详情图'],
];
function accessFailure(props: MediaContext, error: unknown, signal: AbortSignal) {
  if (props.scope.active && !signal.aborted && error instanceof HttpQueryError
    && (error.kind === 'unauthenticated' || error.kind === 'forbidden')) props.onAccessFailure(error);
}
export function ProductEditorMedia(props: Props) {
  if (!props.productId) return <p className="product-field-hint">图片上传服务尚未就绪；保存商品后可查看已有图片。</p>;
  if (!props.media) return <><p className="product-field-hint">图片分类和维护服务尚未就绪，当前仅可查看已有图片。</p><ProductTab scope={props.scope} reader={props.reader}/></>;
  return <MediaGallery {...props} productId={props.productId} media={props.media}/>;
}
type GalleryProps=MediaContext&{readonly productId:string;readonly media:ProductEditorMediaReader}&({readonly readOnly:true}|{readonly readOnly?:false;readonly expectedVersion:number|null;readonly onReloadRequest:()=>void;readonly reloadBlocked?:boolean});
/** Readonly metadata owns its current version; never lends editor maintenance/reload authority. */
export function ProductReadOnlyMedia(props:MediaContext&{readonly productId:string;readonly media:ProductEditorMediaReader}){return <MediaGallery {...props} readOnly/>;}
function MediaGallery(props: GalleryProps) {
  const { snapshot, read, cancel, cancelled } = useProductRead(props.scope, async input => {
    try { return await props.media.readImages(input); }
    catch (error) { accessFailure(props, error, input.signal); throw error; }
  }, (data, target) => {
    if (data.productId !== target.productId) throw new HttpQueryError('malformed-response', 'PRODUCT_MEDIA_TARGET_MISMATCH');
    if (!props.readOnly && data.version !== props.expectedVersion) throw new HttpQueryError('conflict', 'PRODUCT_MEDIA_VERSION_MISMATCH');
  });
  const [preview, setPreview] = useState<{ image: ProductEditorImage; label: string } | null>(null);
  const data = snapshot.phase === 'success' ? snapshot.success?.data : null;
  const item = (image: ProductEditorImage, label: string) => <MediaThumbnail key={`${image.id}:${image.version}`} image={image} label={label} open={() => setPreview({ image, label })}/>;
  if (!props.readOnly && snapshot.phase === 'error' && snapshot.error instanceof HttpQueryError && snapshot.error.code === 'PRODUCT_MEDIA_VERSION_MISMATCH')
    return <p role="alert" className="product-field-hint">商品图片版本已变化。<UIButton disabled={!!props.reloadBlocked} onClick={props.onReloadRequest}>重新读取商品</UIButton></p>;
  if (snapshot.phase === 'error' && snapshot.error instanceof HttpQueryError && ['not-implemented','unavailable'].includes(snapshot.error.kind))
    return <p role="alert" className="product-field-hint">图片服务尚未就绪。<UIButton onClick={read}>重试读取图片</UIButton></p>;
  return <ProductReadState phase={snapshot.phase} retry={read} cancel={cancel} cancelled={cancelled} empty={!data}>{data && <div className="product-editor-photos">
    <p className="product-field-hint">{props.readOnly?'点击图片查看原图。':'点击图片查看原图。图片上传、替换和删除服务尚未就绪。'}</p>
    {roles.map(([role, label]) => <section className="product-photo-section" key={role} aria-label={label}><h3>{label}</h3><div className="product-photo-row">
      {data.images.filter(image => image.role === role).map((image, index) => item(image, `${label} ${index + 1}`))}
      {!data.images.some(image => image.role === role) && <span className="product-field-hint">暂无图片</span>}
    </div></section>)}
    <MediaColors {...props} images={data.images.filter(image => image.role === 'COLOR')} item={item}/>
    {data.images.some(image => image.role === null) && <section className="product-photo-section" aria-label="未分类"><h3>未分类</h3><div className="product-photo-row">{data.images.filter(image => image.role === null).map((image, index) => item(image, `未分类图片 ${index + 1}`))}</div></section>}
    {preview && <MediaOriginalPreview key={`${preview.image.id}:${preview.image.version}`} {...props} media={props.media} image={preview.image} label={preview.label} close={() => setPreview(null)}/>}
  </div>}</ProductReadState>;
}
function MediaColors(props: MediaContext & { readonly images: readonly ProductEditorImage[]; readonly item: (image: ProductEditorImage, label: string) => React.ReactNode }) {
  const { snapshot, read, cancel, cancelled } = useProductRead(props.scope, async input => {
    try { return await props.reader.readProductSpecifications(input); }
    catch (error) { accessFailure(props, error, input.signal); throw error; }
  }, assertProductSpecifications);
  const data = snapshot.phase === 'success' ? snapshot.success?.data : null;
  // A missing label never discards an actual image or turns its identity into a displayed name.
  const rows = [...(data?.colors ?? [])];
  for (const image of props.images) if (!rows.some(color => color.id === image.colorId)) rows.push({ id: image.colorId!, label: '颜色资料未提供' });
  return <section className="product-photo-section" aria-label="颜色图"><h3>颜色图</h3>
    {snapshot.phase !== 'success' && <ProductReadState phase={snapshot.phase} retry={read} cancel={cancel} cancelled={cancelled} empty={!data}>{null}</ProductReadState>}
    <div className="product-photo-row product-color-photos">{rows.map(color => {
      const image = props.images.find(image => image.colorId === color.id);
      return <div key={color.id} className="product-color-photo"><div className="product-color-photo-name" title={color.label}>{color.label}</div>{image ? props.item(image, `${color.label}配图`) : <span className="product-color-photo-empty">暂无图片</span>}</div>;
    })}</div>
    {snapshot.phase === 'success' && !rows.length && <p className="product-field-hint">暂无当前颜色</p>}
  </section>;
}
function MediaThumbnail(props: { readonly image: ProductEditorImage; readonly label: string; readonly open: () => void }) {
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  const missing = props.image.thumbnailState === 'UNAVAILABLE' || failed;
  return <div className="product-photo-tile"><button type="button" className="product-photo-preview" aria-label={`查看原图 ${props.label}`} title={missing ? '缩略图不可用，点击读取原图' : `查看原图 ${props.label}`} onClick={props.open}>
    {missing ? <span>缩略图不可用</span> : <img key={attempt} src={props.image.thumbnailUrl!} alt={props.label} loading="lazy" decoding="async" onError={() => setFailed(true)}/>}
  </button>{failed && <UIButton className="product-photo-retry" aria-label={`重试缩略图 ${props.label}`} onClick={() => { setAttempt(value => value + 1); setFailed(false); }}>重试</UIButton>}</div>;
}
function MediaOriginalPreview(props: MediaContext & { readonly media: ProductEditorMediaReader; readonly image: ProductEditorImage; readonly label: string; readonly close: () => void }) {
  const [decodeFailed, setDecodeFailed] = useState(false);
  const { snapshot, read, cancel, cancelled } = useProductRead(props.scope, async input => {
    try { return await props.media.readOriginal({ ...input, parameters: { productId: input.parameters.productId, imageId: props.image.id } }); }
    catch (error) { accessFailure(props, error, input.signal); throw error; }
  }, (data, target) => { if (data.productId !== target.productId || data.imageId !== props.image.id) throw new HttpQueryError('malformed-response', 'PRODUCT_MEDIA_TARGET_MISMATCH'); });
  return <StandardOverlay className="pd-image-preview" title={props.label} label={`图片预览 ${props.label}`} closeLabel="关闭图片预览" close={props.close} maskClosable width={860}>
    {decodeFailed ? <p role="alert">原图暂不可读取。<UIButton onClick={() => { setDecodeFailed(false); read(); }}>重试原图</UIButton></p> : <ProductReadState phase={snapshot.phase} retry={read} cancel={cancel} cancelled={cancelled} empty={!snapshot.success}>
      {snapshot.success && <img src={snapshot.success.data.url} alt={props.label} onError={() => setDecodeFailed(true)}/>}
    </ProductReadState>}
  </StandardOverlay>;
}
