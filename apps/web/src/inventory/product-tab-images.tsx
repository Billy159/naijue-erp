import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LatestQuery, type QuerySnapshot } from '../loading/latest-query.ts';
import { ReadScope } from '../loading/read-scope.ts';
import type { ProductImage, ProductImageParameters, ProductImageSummary } from './product-contracts.ts';
import type { ProductDrawerContentProps } from './product-drawer.tsx';
import { assertProductImage, assertProductImages } from './product-model.ts';
import { ProductReadState, useProductRead } from './product-tab-state.tsx';
export function ProductTab({ scope, reader }: ProductDrawerContentProps) {
  const { snapshot, read, cancel, cancelled } = useProductRead(scope, value => reader.readProductImages(value), assertProductImages);
  const data = snapshot.success?.data;
  const [image, setImage] = useState<ProductImageSummary | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  return <ProductReadState phase={snapshot.phase} retry={read} cancel={cancel} cancelled={cancelled} empty={!data}>{data && <>
    {data.images.length ? <><p className="pd-hint">点击图片查看大图</p><div className="pd-images">{data.images.map(item => <Thumbnail key={item.id} image={item} open={button => { trigger.current = button; setImage(item); }} />)}</div></> : <p className="iw-inline-state">暂无图片</p>}
    {image && <ImagePreview key={image.id} scope={scope} reader={reader} image={image} close={() => { setImage(null); trigger.current?.focus(); }} />}
  </>}</ProductReadState>;
}
function Thumbnail({ image, open }: { readonly image: ProductImageSummary; readonly open: (button: HTMLButtonElement) => void }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return <figure><button type="button" className="pd-thumbnail" aria-label={`预览 ${image.label}`} onClick={event => open(event.currentTarget)}>{failed ? <span>缩略图暂不可用，仍可预览</span> : <img key={attempt} src={image.thumbnailUrl} alt={image.label} loading="lazy" decoding="async" onError={() => setFailed(true)} />}</button><figcaption>{image.label}</figcaption>{failed && <button type="button" className="iw-link" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>重试缩略图</button>}</figure>;
}
const idleImageSnapshot: QuerySnapshot<ProductImageParameters, ProductImage> = Object.freeze({ phase: 'idle', request: null, success: null, error: null });
const emptyImageSnapshot = () => idleImageSnapshot;
const noImageSubscription = () => () => {};
function ImagePreview(props: ProductDrawerContentProps & { readonly image: ProductImageSummary; readonly close: () => void }) {
  const attachmentId = useRef(0);
  const [attachment, setAttachment] = useState<{ readonly parentScope: ReadScope; readonly imageId: string; readonly scope: ReadScope; readonly query: LatestQuery<ProductImageParameters, ProductImage> } | null>(null);
  const current = attachment?.parentScope === props.scope && attachment.imageId === props.image.id && attachment.scope.active ? attachment : null;
  const query = current?.query;
  const snapshot = useSyncExternalStore(query?.subscribe ?? noImageSubscription, query?.getSnapshot ?? emptyImageSnapshot, query?.getSnapshot ?? emptyImageSnapshot);
  const [decodeError, setDecodeError] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const read = () => { setDecodeError(false); if (current?.scope.entityId) void current.query.run({ productId: current.scope.entityId, imageId: props.image.id }); };
  useEffect(() => {
    const scope = new ReadScope(props.scope.identity, `${props.scope.routeInstanceId}:image:${props.image.id}:${++attachmentId.current}`, props.scope.entityId, () => {});
    const query = new LatestQuery<ProductImageParameters, ProductImage>({ scope, execute: async read => {
      const data = await props.reader.readProductImage(read); assertProductImage(data, read.parameters); return data;
    } });
    const next = { parentScope: props.scope, imageId: props.image.id, scope, query };
    const dispose = () => { query.dispose(); scope.dispose(); setAttachment(value => value === next ? null : value); };
    props.scope.signal.addEventListener('abort', dispose, { once: true });
    if (props.scope.active) {
      setAttachment(next); setDecodeError(false);
      if (scope.entityId) void query.run({ productId: scope.entityId, imageId: props.image.id });
    } else dispose();
    return () => { props.scope.signal.removeEventListener('abort', dispose); query.dispose(); scope.dispose(); };
  }, [props.scope, props.image.id]);
  useEffect(() => {
    const element = dialog.current;
    if (typeof element?.showModal === 'function') element.showModal(); else element?.setAttribute('open', '');
    closeButton.current?.focus();
    return () => { element?.close?.(); };
  }, [props.scope, props.image.id]);
  return <dialog ref={dialog} className="pd-image-preview" aria-modal="true" onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) props.close(); } }} aria-label={`图片预览 ${props.image.label}`} onCancel={event => { event.preventDefault(); event.stopPropagation(); props.close(); }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); props.close(); }
    if (event.key === 'Tab') { event.stopPropagation(); const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button')); const first = buttons[0], last = buttons.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
  }}><header><strong>{props.image.label}</strong><button ref={closeButton} type="button" className="iw-text-button" aria-label="关闭图片预览" onClick={props.close}>×</button></header>
    {snapshot.phase === 'loading' ? <p role="status">正在读取大图…</p> : snapshot.phase === 'error' || decodeError ? <p role="alert">大图暂不可读取。<button type="button" className="iw-link" onClick={read}>重试大图</button></p> : snapshot.success && <img src={snapshot.success.data.url} alt={props.image.label} onError={() => setDecodeError(true)} />}
  </dialog>;
}
