import { StandardOverlay } from '../components/standard-overlay.tsx';
import { UIButton } from '../components/standard-controls.tsx';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LatestQuery, type QuerySnapshot } from '../loading/latest-query.ts';
import { ReadScope } from '../loading/read-scope.ts';
import type { ProductImage, ProductImageParameters, ProductImageSummary } from './product-contracts.ts';
import type { ProductReadOnlyReader } from './product-contracts.ts';
interface ImageTabProps { readonly scope: ReadScope; readonly reader: Pick<ProductReadOnlyReader, 'readProductImages' | 'readProductImage'> }
import { assertProductImage, assertProductImages } from './product-model.ts';
import { ProductReadState, useProductRead } from './product-tab-state.tsx';
export function ProductTab({ scope, reader }: ImageTabProps) {
  const { snapshot, read, cancel, cancelled } = useProductRead(scope, value => reader.readProductImages(value), assertProductImages);
  const data = snapshot.success?.data;
  const [image, setImage] = useState<ProductImageSummary | null>(null);
  return <ProductReadState phase={snapshot.phase} retry={read} cancel={cancel} cancelled={cancelled} empty={!data}>{data && <>
    {data.images.length ? <><p className="pd-hint">点击图片查看大图</p><div className="pd-images">{data.images.map(item => <Thumbnail key={item.id} image={item} open={() => setImage(item)} />)}</div></> : <p className="iw-inline-state">暂无图片</p>}
    {image && <ImagePreview key={image.id} scope={scope} reader={reader} image={image} close={() => setImage(null)} />}
  </>}</ProductReadState>;
}
function Thumbnail({ image, open }: { readonly image: ProductImageSummary; readonly open: (button: HTMLButtonElement) => void }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return <figure><UIButton type="button" className="pd-thumbnail" aria-label={`预览 ${image.label}`} onClick={event => open(event.currentTarget)}>{failed ? <span>缩略图暂不可用，仍可预览</span> : <img key={attempt} src={image.thumbnailUrl} alt={image.label} loading="lazy" decoding="async" onError={() => setFailed(true)} />}</UIButton><figcaption>{image.label}</figcaption>{failed && <UIButton type="button" className="iw-link" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>重试缩略图</UIButton>}</figure>;
}
const idleImageSnapshot: QuerySnapshot<ProductImageParameters, ProductImage> = Object.freeze({ phase: 'idle', request: null, success: null, error: null });
const emptyImageSnapshot = () => idleImageSnapshot;
const noImageSubscription = () => () => {};
function ImagePreview(props: ImageTabProps & { readonly image: ProductImageSummary; readonly close: () => void }) {
  const attachmentId = useRef(0);
  type Attachment = { readonly parentScope: ReadScope; readonly imageId: string; readonly scope: ReadScope; readonly query: LatestQuery<ProductImageParameters, ProductImage>; pending: boolean };
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const activeAttachment = useRef<Attachment | null>(null);
  const overlayReady = useRef(false);
  const current = attachment?.parentScope === props.scope && attachment.imageId === props.image.id && attachment.scope.active ? attachment : null;
  const query = current?.query;
  const snapshot = useSyncExternalStore(query?.subscribe ?? noImageSubscription, query?.getSnapshot ?? emptyImageSnapshot, query?.getSnapshot ?? emptyImageSnapshot);
  const [decodeError, setDecodeError] = useState(false);
  const read = () => { setDecodeError(false); const value = activeAttachment.current; if (value?.parentScope === props.scope && value.imageId === props.image.id && value.scope.active && value.scope.entityId) { value.pending = false; void value.query.run({ productId: value.scope.entityId, imageId: value.imageId }); } };
  const start = () => { const value = activeAttachment.current; if (overlayReady.current && value?.pending) read(); };
  useEffect(() => {
    const scope = new ReadScope(props.scope.identity, `${props.scope.routeInstanceId}:image:${props.image.id}:${++attachmentId.current}`, props.scope.entityId, () => {});
    const query = new LatestQuery<ProductImageParameters, ProductImage>({ scope, execute: async read => {
      const data = await props.reader.readProductImage(read); assertProductImage(data, read.parameters); return data;
    } });
    const next = { parentScope: props.scope, imageId: props.image.id, scope, query, pending: true };
    const parameters = scope.entityId ? Object.freeze({ productId: scope.entityId, imageId: props.image.id }) : null;
    const dispose = () => { next.pending = false; if (activeAttachment.current === next) activeAttachment.current = null; query.dispose(); scope.dispose(); setAttachment(value => value === next ? null : value); };
    props.scope.signal.addEventListener('abort', dispose, { once: true });
    if (props.scope.active) {
      activeAttachment.current = next; setAttachment(next); setDecodeError(false);
      queueMicrotask(() => {
        if (overlayReady.current && activeAttachment.current === next && next.pending && scope.active && parameters) { next.pending = false; void query.run(parameters); }
      });
    } else dispose();
    return () => { props.scope.signal.removeEventListener('abort', dispose); next.pending = false; if (activeAttachment.current === next) activeAttachment.current = null; query.dispose(); scope.dispose(); };
  }, [props.scope, props.image.id]);
  return <StandardOverlay className="pd-image-preview" title={props.image.label} label={`图片预览 ${props.image.label}`} closeLabel="关闭图片预览" close={props.close} maskClosable width={860} onReady={() => { overlayReady.current = true; start(); }}>
    {snapshot.phase === 'loading' ? <p role="status">正在读取大图…</p> : snapshot.phase === 'error' || decodeError ? <p role="alert">大图暂不可读取。<UIButton type="button" className="iw-link" onClick={read}>重试大图</UIButton></p> : snapshot.success && <img src={snapshot.success.data.url} alt={props.image.label} onError={() => setDecodeError(true)} />}
  </StandardOverlay>;
}
